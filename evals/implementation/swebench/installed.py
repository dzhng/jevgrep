#!/usr/bin/env python3
"""Freeze and evaluate one installed package against the ten retained SWE-bench baselines."""
import argparse
from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import shlex
import selectors
import subprocess
import time
import urllib.parse
import urllib.request
import uuid

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PROVIDER_ROUTE = HERE / 'provider-route.mjs' if (HERE / 'provider-route.mjs').exists() else ROOT / 'test/fixtures/provider-route.mjs'
REGISTRY = json.loads((HERE / 'fixed-baselines.json').read_text())
HARNESS_COMMIT = '02e7a74ffd0b707aab73d203fe87bdc7c76afc8e'
TIMING_POLICY = {'clock': 'work_excluding_standalone_jg_search_wait', 'work_seconds': 900,
                 'hard_wall_seconds': 86400, 'overlapping_other_commands': 'count_as_work',
                 'event_clock': 'host_monotonic_observation'}
TREATMENT_TIMING = ('The task, including verification, has a 900-second work budget, excluding time waiting for standalone jg search commands when no other command is running. '
                    'Other commands, compound commands, and concurrent work count toward that budget; a 24-hour wall-clock guard stops runaway attempts. ')
SAFE_FIELDS = {'instance_id', 'repo', 'base_commit', 'image', 'problem_statement'}
VERSIONS = {'node': 'v24.14.0', 'codex': 'codex-cli 0.153.4', 'claude': '2.1.278 (Claude Code)'}
VERIFICATION = (
    'Save test stdout/stderr to a log and preserve the test exit status. Inspect that log '
    'to understand failures; do not rerun unchanged tests merely to change an output filter. '
    'Prefer foreground test commands with an adequate tool timeout within the task deadline. '
    'In Claude, a Bash timeout may background a command rather than stop it. If backgrounded, '
    'use its completion notification and output or exit-status file; do not invent process-name '
    'polling with pgrep or add fixed sleeps. '
    'Keep your implementation applied in /testbed during long-running verification. '
    'If a pristine comparison is needed, use a separate temporary checkout and verify tests import '
    'that checkout. Report verification that could not finish.'
)


def baseline_prompt(row):
    common = ('Implement the following request in /testbed. Work only from local source and tests; '
              'do not fetch external research, packages, solutions or hidden tests. Do not use network tools. '
              'Preserve existing behavior outside the request. Run relevant available tests and wait for their results. '
              'Report what changed, completed verification, and any unresolved limitations. '
              'Do not change Git history or make commits.\n\n')
    return common + 'The entire task, including verification, has a 900-second deadline. ' + VERIFICATION + '\n\n' + row['problem_statement']


def treatment_prompt(row):
    return '$jevgrep\n\n' + baseline_prompt(row).replace(
        'The entire task, including verification, has a 900-second deadline. ', TREATMENT_TIMING, 1)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')
    path.chmod(0o600)


def command(args, **kwargs):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)


def text(args):
    return command(args).stdout.decode().strip()


def load_pair(baseline, inputs, task):
    receipt = json.loads((baseline / 'receipt.json').read_text())
    cell = receipt['cell']
    registered = next(item for item in REGISTRY['tasks'] if item['task'] == task)
    if cell != registered['cell'] or receipt['image'] != cell['image']:
        raise ValueError('Baseline differs from the fixed registry')
    for name, expected in registered['files'].items():
        if digest(baseline / name) != expected:
            raise ValueError('Retained baseline evidence changed: ' + name)
    if (cell['model'], cell['effort'], cell['timeout_seconds']) != ('openai/gpt-5.6-sol', 'medium', 900):
        raise ValueError('Baseline model/effort/deadline differs from the registered harness')
    if receipt['versions'] != VERSIONS or receipt['provider_route'] != 'vercel-ai-gateway':
        raise ValueError('Baseline runtime or provider differs from the registered harness')
    rows = json.loads(inputs.read_text())
    if not isinstance(rows, list) or any(not isinstance(row, dict) or set(row) != SAFE_FIELDS for row in rows):
        raise ValueError('Only safe exported agent-input fields are accepted')
    matches = [row for row in rows if row['instance_id'] == task]
    if len(matches) != 1 or matches[0]['image'] != cell['source_image']:
        raise ValueError('Task input must match the fixed baseline source image')
    row = matches[0]
    prompt = baseline_prompt(row).encode()
    if hashlib.sha256(prompt).hexdigest() != receipt['prompt_sha256'] or (baseline / 'prompt.txt').read_bytes() != prompt:
        raise ValueError('Baseline prompt differs; do not rerun or overwrite it')
    grade = json.loads((baseline / 'grading-receipt.json').read_text())
    if (grade.get('resolved_instances') == 1) != registered['resolved']:
        raise ValueError('Retained official outcome changed')
    return receipt, row


def check_image(image):
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', image):
        raise ValueError('Use the immutable retained runtime image ID')
    actual = text(['docker', 'image', 'inspect', image, '--format', '{{.Id}}'])
    if actual != image:
        raise ValueError('Runtime image identity changed')
    return actual


def paired_runtime(baseline, rebuild=None):
    if rebuild is None:
        return baseline['image']
    if (rebuild.get('original_image') != baseline['image'] or
            rebuild.get('source_pinned_ref') != baseline['cell']['source_pinned_ref'] or
            not re.fullmatch(r'sha256:[a-f0-9]{64}', rebuild.get('image', ''))):
        raise ValueError('Rebuilt runtime does not match the retained source/environment pairing')
    return rebuild['image']


def prepare(args):
    root = args.evidence_root.resolve()
    selected = [item for item in REGISTRY['tasks'] if args.task in ('all', item['task'])]
    pairs = [(item, *load_pair(root / item['baseline'], root / REGISTRY['inputs'], item['task'])) for item in selected]
    baseline = pairs[0][1]
    rebuild = None
    if getattr(args, 'runtime_image', None):
        if len(pairs) != 1:
            raise ValueError('A rebuilt runtime must be prepared for one task at a time')
        rebuild = {'original_image': baseline['image'], 'image': args.runtime_image,
                   'source_pinned_ref': baseline['cell']['source_pinned_ref']}
        base_layers = json.loads(text(['docker', 'image', 'inspect', rebuild['source_pinned_ref'], '--format', '{{json .RootFS.Layers}}']))
        actual_layers = json.loads(text(['docker', 'image', 'inspect', rebuild['image'], '--format', '{{json .RootFS.Layers}}']))
        if actual_layers[:len(base_layers)] != base_layers:
            raise ValueError('Rebuilt runtime does not extend the pinned official source image')
    image = check_image(paired_runtime(baseline, rebuild))
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    out.chmod(0o700)
    package = out / 'package.tgz'
    shutil.copyfile(args.package, package)
    package.chmod(0o600)
    name = 'jg-prepare-' + uuid.uuid4().hex[:12]
    # Preparation may fetch pinned npm dependencies. The coding agent never receives that network.
    install = '''set -eu
cd /tmp
npm install --global --prefix /opt/jg-install /tmp/package.tgz --ignore-scripts --no-audit --no-fund
/opt/jg-install/bin/jg --version > /tmp/jg-version.txt
# jg skill runs the npx installer; read the bundled skill bytes directly.
cat /opt/jg-install/lib/node_modules/@dzhng/jevgrep/dist/skills/jevgrep/SKILL.md > /tmp/jg-skill.md
node -e 'const fs=require("fs"),cp=require("child_process");const p=require("/opt/jg-install/lib/node_modules/@dzhng/jevgrep/package.json");if(fs.realpathSync("/opt/jg-install/bin/jg")!=="/opt/jg-install/lib/node_modules/@dzhng/jevgrep/dist/bin/index.js")throw Error("Unexpected executable");const git=a=>cp.execFileSync("git",["-C","/testbed",...a],{encoding:"utf8"}).trim();fs.writeFileSync("/tmp/install.json",JSON.stringify({package:p.name,version:p.version,head:git(["rev-parse","HEAD"]),tree:git(["rev-parse","HEAD^{tree}"]),status:git(["status","--porcelain"])}));'
tar -C /opt -cf /tmp/installed-prefix.tar jg-install
'''
    try:
        command(['docker', 'create', '--platform', 'linux/amd64', '--name', name, image, 'sh', '-c', install])
        command(['docker', 'cp', str(package), name + ':/tmp/package.tgz'])
        with (out / 'prepare.log').open('wb') as log:
            subprocess.run(['docker', 'start', '-a', name], stdout=log, stderr=subprocess.STDOUT, check=True)
        for remote, local in [('installed-prefix.tar', 'installed-prefix.tar'), ('install.json', 'installation.json'), ('jg-skill.md', 'skill.md'), ('jg-version.txt', 'version.txt')]:
            command(['docker', 'cp', name + ':/tmp/' + remote, str(out / local)])
            (out / local).chmod(0o600)
        installed = json.loads((out / 'installation.json').read_text())
        cell = baseline['cell']
        if installed['package'] != '@dzhng/jevgrep' or installed['status'] or installed['head'] != cell['expected_image_head'] or installed['tree'] != cell['expected_source_tree']:
            raise ValueError('Installation changed source identity or installed the wrong package')
        if (out / 'skill.md').read_bytes() != args.skill.read_bytes():
            raise ValueError('Packaged skill differs from the canonical skill')
        # Every image gets an offline check using the same installed bytes.
        cells = []
        for registered, fixed, _ in pairs:
            runtime = check_image(paired_runtime(fixed, rebuild))
            check = 'jg-preflight-' + uuid.uuid4().hex[:12]
            try:
                command(['docker', 'create', '--platform', 'linux/amd64', '--network', 'none', '--name', check, runtime, 'sh', '-ec',
                         'tar -xf /tmp/prefix.tar -C /opt; node --version; codex --version; claude --version; /opt/jg-install/bin/jg --version; cat /opt/jg-install/lib/node_modules/@dzhng/jevgrep/dist/skills/jevgrep/SKILL.md; git -C /testbed rev-parse HEAD; git -C /testbed rev-parse HEAD^{tree}; git -C /testbed status --porcelain'])
                command(['docker', 'cp', str(out / 'installed-prefix.tar'), check + ':/tmp/prefix.tar'])
                output = command(['docker', 'start', '-a', check]).stdout
                expected = ((''.join(value + '\n' for value in VERSIONS.values())).encode() + (out / 'version.txt').read_bytes() + (out / 'skill.md').read_bytes() +
                            (fixed['cell']['expected_image_head'] + '\n' + fixed['cell']['expected_source_tree'] + '\n').encode())
                if output != expected:
                    raise ValueError('Offline runtime/source/skill preflight differs: ' + registered['task'])
            finally:
                subprocess.run(['docker', 'rm', '-f', check], capture_output=True)
            cell = {**fixed['cell'], 'id': 'installed-' + registered['task'] + '-' + uuid.uuid4().hex[:12],
                    'arm': 'chunks', 'candidate': str(out / 'installed-prefix.tar'), 'image': runtime}
            cells.append({'cell': cell, 'baseline': str(root / registered['baseline']),
                          'baseline_cost_usd': registered['cost_usd'], 'baseline_resolved': registered['resolved'],
                          'output': str(out / 'attempts' / registered['task'])})
        write_json(out / 'agent-inputs.json', [public for _, _, public in pairs])
        frozen = out / 'runner'
        frozen.mkdir(mode=0o700)
        for source in [Path(__file__).resolve(), HERE / 'gateway_broker.py', HERE / 'fixed-baselines.json', PROVIDER_ROUTE]:
            shutil.copyfile(source, frozen / source.name)
        artifacts = [*frozen.iterdir(), package, out / 'installed-prefix.tar', out / 'skill.md', out / 'agent-inputs.json', root / REGISTRY['dataset']]
        plan = {'schema': 4, 'timing_policy': dict(TIMING_POLICY), 'status': 'frozen', 'cells': cells,
                'purpose': 'One prospective package cohort; reuse fixed baselines without execution.',
                'inputs': str(out / 'agent-inputs.json'), 'skill': str(out / 'skill.md'), 'package': str(package),
                'runner': str(frozen / 'installed.py'), 'broker': str(frozen / 'gateway_broker.py'), 'provider_preload': str(frozen / 'provider-route.mjs'),
                'registry': str(frozen / 'fixed-baselines.json'), 'dataset': str(root / REGISTRY['dataset']),
                'tooling': str(root / REGISTRY['tooling']),
                'artifacts': {str(path): digest(path) for path in artifacts}}
        plan['jev_provider'] = getattr(args, 'jev_provider', 'vercel')
        if rebuild:
            plan['runtime_rebuild'] = rebuild
        write_json(out / 'plan.json', plan)
        print(json.dumps({'status': 'prepared', 'plan': str(out / 'plan.json'), 'tasks': len(cells)}))
    finally:
        subprocess.run(['docker', 'rm', '-f', name], capture_output=True)


def load_cohort(path):
    plan = json.loads(path.read_text())
    if plan.get('schema') != 4 or plan.get('status') != 'frozen':
        raise ValueError('Expected a frozen schema-4 cohort; use the archived runner for older studies')
    if plan.get('timing_policy') != TIMING_POLICY:
        raise ValueError('Frozen treatment timing policy changed')
    for artifact, expected in plan['artifacts'].items():
        if digest(artifact) != expected:
            raise ValueError('Frozen artifact changed: ' + artifact)
    for key in ['runner', 'broker', 'provider_preload', 'registry', 'inputs', 'skill', 'package', 'dataset']:
        if plan.get(key) not in plan['artifacts']:
            raise ValueError('Plan omits required artifact: ' + key)
    if digest(PROVIDER_ROUTE) != digest(plan['provider_preload']):
        raise ValueError('Use the frozen provider preload')
    if digest(__file__) != digest(plan['runner']) or digest(HERE / 'gateway_broker.py') != digest(plan['broker']) or json.loads(Path(plan['registry']).read_text()) != REGISTRY:
        raise ValueError('Use the frozen runner and registry')
    prefixes = {item['cell']['candidate'] for item in plan['cells']}
    identities = {item['cell']['id'] for item in plan['cells']}
    outputs = {item['output'] for item in plan['cells']}
    if len(prefixes) != 1 or len(identities) != len(plan['cells']) or len(outputs) != len(plan['cells']):
        raise ValueError('Cohort requires one prefix and distinct attempt identities')
    tasks = [item['cell']['instance_id'] for item in plan['cells']]
    if not tasks or len(set(tasks)) != len(tasks):
        raise ValueError('Plan tasks must be unique')
    for item in plan['cells']:
        cell = item['cell']
        registered = next(row for row in REGISTRY['tasks'] if row['task'] == cell['instance_id'])
        baseline, _ = load_pair(Path(item['baseline']), Path(plan['inputs']), cell['instance_id'])
        expected = {**baseline['cell'], 'id': cell['id'], 'arm': 'chunks', 'candidate': cell['candidate'],
                    'image': paired_runtime(baseline, plan.get('runtime_rebuild'))}
        if cell != expected or not re.fullmatch(r'installed-[A-Za-z0-9_.-]+', cell['id']):
            raise ValueError('Treatment pairing changed')
        if cell['candidate'] not in plan['artifacts'] or item['baseline_cost_usd'] != registered['cost_usd'] or item['baseline_resolved'] != registered['resolved']:
            raise ValueError('Treatment artifacts or baseline outcome changed')
    return plan


def load_plan(path, task=None):
    cohort = load_cohort(path)
    matches = [item for item in cohort['cells'] if task is None or item['cell']['instance_id'] == task]
    if len(matches) != 1:
        raise ValueError('Select one frozen task or use --all')
    plan = {**cohort, **matches[0]}
    _, row = load_pair(Path(plan['baseline']), Path(plan['inputs']), plan['cell']['instance_id'])
    return plan, row


def existing_attempt(plan):
    out = Path(plan['output'])
    if not out.exists():
        return False
    path = out / 'receipt.json'
    if not path.exists():
        raise ValueError('Existing attempt lacks a lifecycle receipt; inspect it before continuing')
    receipt = json.loads(path.read_text())
    if receipt['cell'] != plan['cell']:
        raise ValueError('Existing attempt belongs to another cell')
    if receipt['status'] in ('completed', 'failed', 'interrupted'):
        return True
    try:
        os.kill(receipt['host_pid'], 0)
        alive = True
    except ProcessLookupError:
        alive = False
    active = text(['docker', 'ps', '-q', '--filter', 'label=jg.cell=' + plan['cell']['id']])
    if alive or active:
        raise ValueError('Existing attempt is active; wait for its actual process to finish')
    receipt.update(status='interrupted', interruption='Runner and labeled containers are no longer active')
    write_json(path, receipt)
    return True


def direct_jg_search(command):
    """Recognize a standalone invocation, never a shell program that also runs jg."""
    try:
        argv = shlex.split(command)
        if len(argv) == 3 and argv[0] in ('/bin/sh', '/bin/bash', 'sh', 'bash') and argv[1] in ('-c', '-lc'):
            command = argv[2]
        # Expansions and shell operators can execute additional work. Quoted query
        # punctuation is data; shlex keeps it within its argument.
        if any(character in command for character in '$`\n\r'):
            return False
        raw = shlex.shlex(command, posix=False, punctuation_chars=';&|<>()')
        raw.whitespace_split, raw.commenters = True, ''
        if any(not token.startswith(('\"', "'")) and any(char in token for char in '*?[{~') for token in raw):
            return False
        lexer = shlex.shlex(command, posix=True, punctuation_chars=';&|<>()')
        lexer.whitespace_split = True
        lexer.commenters = ''
        argv = list(lexer)
        if not argv or argv[0] not in ('jg', '/opt/jg-install/bin/jg'):
            return False
        if any(re.fullmatch(r'[;&|<>()]+', token) for token in argv):
            return False
        positionals, options = [], True
        index = 1
        while index < len(argv):
            arg = argv[index]
            if options and arg == '--':
                options = False
            elif options and arg in ('--no-cache', '--hidden', '--no-ignore', '--include-dependencies', '--include-sensitive'):
                pass
            elif options and arg == '--max-source-bytes':
                index += 1
                if index >= len(argv) or not argv[index].isdigit():
                    return False
            elif options and arg.startswith('--max-source-bytes='):
                if not arg.split('=', 1)[1].isdigit():
                    return False
            elif options and arg.startswith('-'):
                return False
            else:
                positionals.append(arg)
            index += 1
        return (1 <= len(positionals) <= 2 and bool(positionals[0].strip()) and
                positionals[0] not in ('auth', 'doctor', 'cache', 'skill'))
    except ValueError:
        return False


def monitor_native(invocation, stdout, stderr, policy):
    """Charge wall time except observed standalone retrieval with no other command active."""
    started = time.monotonic()
    active, intervals = {}, []
    credit_start, credited, errors = None, 0.0, 0
    timed_out, timeout_kind = False, None

    def close_credit(now):
        nonlocal credit_start, credited
        if credit_start is not None:
            intervals.append({'start_seconds': credit_start - started, 'end_seconds': now - started,
                              'command_ids': sorted(active)})
            credited += now - credit_start
            credit_start = None

    def event(line, now):
        nonlocal credit_start, errors
        try:
            value = json.loads(line)
            item = value.get('item', {})
            kind = value.get('type')
            if kind in ('turn.completed', 'turn.failed'):
                close_credit(now)
                active.clear()
            elif kind in ('item.started', 'item.completed') and item.get('type') == 'command_execution':
                identifier = item.get('id')
                if not isinstance(identifier, str):
                    raise ValueError('Missing command identity')
                close_credit(now)
                if kind == 'item.started':
                    if identifier in active:
                        errors += 1
                    active[identifier] = direct_jg_search(item.get('command', ''))
                else:
                    if identifier not in active:
                        errors += 1
                    active.pop(identifier, None)
                if active and all(active.values()):
                    credit_start = now
        except (ValueError, TypeError, AttributeError):
            errors += 1
            close_credit(now)
            active.clear()

    process = subprocess.Popen(invocation, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=stderr)
    pending = b''
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map() or process.poll() is None:
                now = time.monotonic()
                retrieval = credited + (now - credit_start if credit_start is not None else 0)
                work = now - started - retrieval
                if work >= policy['work_seconds'] or now - started >= policy['hard_wall_seconds']:
                    timed_out = True
                    timeout_kind = 'work' if work >= policy['work_seconds'] else 'hard_wall'
                    break
                if not selector.get_map():
                    time.sleep(0.05)
                    continue
                for key, _ in selector.select(0.05):
                    chunk = os.read(key.fd, 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        close_credit(time.monotonic())
                        active.clear()
                        continue
                    stdout.write(chunk)
                    stdout.flush()
                    pending += chunk
                    while b'\n' in pending:
                        line, pending = pending.split(b'\n', 1)
                        event(line, time.monotonic())
    finally:
        close_credit(time.monotonic())
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdout.close()
    elapsed = time.monotonic() - started
    if pending.strip():
        errors += 1
    return {'exit_code': process.returncode, 'timed_out': timed_out, 'timeout_kind': timeout_kind,
            'wall_seconds': elapsed, 'work_seconds': elapsed - credited,
            'retrieval_wait_seconds': credited, 'credit_intervals': intervals,
            'timing_event_errors': errors}


def run(args):
    plan, row = load_plan(args.plan.resolve(), args.task)
    cell = plan['cell']
    jev_provider = plan.get('jev_provider', 'vercel')
    if jev_provider not in ('vercel', 'typesafe'):
        raise ValueError('Unsupported Jev provider')
    image = check_image(cell['image'])
    if args.dry_run:
        print(json.dumps({'status': 'validated', 'paid_calls': 0, 'baseline_reused': plan['baseline'], 'image': image, 'cell': cell['id']}))
        return
    if existing_attempt(plan):
        print(json.dumps({'status': 'retained', 'cell': cell['id']}))
        return
    if not os.environ.get('AI_GATEWAY_API_KEY'):
        raise ValueError('AI_GATEWAY_API_KEY is required; load it through the authorized credential workflow')
    if jev_provider == 'typesafe' and not os.environ.get('TYPESAFE_API_KEY'):
        raise ValueError('TYPESAFE_API_KEY is required for native Jev')
    out = Path(plan['output'])
    out.mkdir(parents=True, exist_ok=False)
    out.chmod(0o700)
    tag = 'jg-native-' + uuid.uuid4().hex[:12]
    network, proxy = tag + '-net', tag + '-proxy'
    receipt = {'engine': 'codex', 'cell': cell, 'image': image, 'plan_sha256': digest(args.plan), 'started': time.time(), 'status': 'preparing',
               'jev_provider': jev_provider, 'provider_route': 'vercel-ai-gateway', 'gateway_model': 'openai/gpt-5.6-sol', 'baseline': plan['baseline'], 'host_pid': os.getpid()}
    write_json(out / 'receipt.json', receipt)
    def dx(argv, user=None):
        return command(['docker', 'exec', *(['-u', user] if user else []), tag, *argv])
    def put(container, path, data, owner='agent:agent', mode='600'):
        command(['docker', 'exec', '-i', container, 'sh', '-c', 'umask 077; cat > "$1"; chown "$2" "$1"; chmod "$3" "$1"', 'sh', path, owner, mode], input=data)
    def capture(remote, destination):
        return subprocess.run(['docker', 'cp', remote, str(destination)], capture_output=True).returncode == 0
    try:
        command(['docker', 'network', 'create', '--internal', network])
        command(['docker', 'run', '-d', '--name', proxy, '--label', 'jg.cell=' + cell['id'], '-e', 'JEVGREP_TRACE_DIR=/run/jev-traces', image, 'python3', '-u', '-c', (HERE / 'gateway_broker.py').read_text()])
        command(['docker', 'network', 'connect', '--alias', 'model-egress', network, proxy])
        # The monitor owns the deadline; keep the container alive for setup and
        # artifact capture too, then remove it in finally.
        command(['docker', 'run', '-d', '--name', tag, '--label', 'jg.cell=' + cell['id'], '--network', network,
                 '-e', 'HTTP_PROXY=http://model-egress:3128', '-e', 'HTTPS_PROXY=http://model-egress:3128',
                 '-e', 'NO_PROXY=localhost,127.0.0.1,model-egress', image, 'sleep', 'infinity'])
        dx(['sh', '-c', 'useradd -m -u 1001 agent; mkdir -p /home/agent/.codex /home/agent/.claude /workspace; chown -R agent:agent /home/agent /workspace'])
        receipt['official_image_head'] = dx(['git', '-C', '/testbed', 'rev-parse', 'HEAD']).stdout.decode().strip()
        receipt['official_source_status'] = dx(['git', '-C', '/testbed', 'status', '--porcelain']).stdout.decode()
        receipt['official_image_tree'] = dx(['git', '-C', '/testbed', 'rev-parse', 'HEAD^{tree}']).stdout.decode().strip()
        if receipt['official_source_status'] or receipt['official_image_head'] != cell['expected_image_head'] or receipt['official_image_tree'] != cell['expected_source_tree']:
            raise ValueError('Native source differs from the retained baseline')
        dx(['sh', '-c', 'cd /testbed && tracked=$(mktemp) && git ls-files -z > "$tracked" && rm -rf .git && git init -q && git config user.email agent@localhost && git config user.name Agent && git --literal-pathspecs add -f --pathspec-from-file="$tracked" --pathspec-file-nul && rm "$tracked" && git commit -qm "Pristine official image source" && chown -R agent:agent /testbed'])
        base = dx(['git', '-C', '/testbed', 'rev-parse', 'HEAD'], 'agent').stdout.decode().strip()
        receipt['synthetic_base'] = base
        receipt['source_tree'] = dx(['git', '-C', '/testbed', 'rev-parse', 'HEAD^{tree}'], 'agent').stdout.decode().strip()
        if receipt['source_tree'] != cell['expected_source_tree']:
            raise ValueError('Normalized source tree changed')
        receipt['versions'] = {name: dx([name, '--version']).stdout.decode().strip() for name in VERSIONS}
        if receipt['versions'] != VERSIONS:
            raise ValueError('Agent runtime changed')
        command(['docker', 'cp', cell['candidate'], tag + ':/tmp/installed-prefix.tar'])
        dx(['tar', '-xf', '/tmp/installed-prefix.tar', '-C', '/opt'])
        skill_dir = '/home/agent/.agents/skills/jevgrep'
        dx(['mkdir', '-p', skill_dir])
        put(tag, skill_dir + '/SKILL.md', Path(plan['skill']).read_bytes())
        receipt['installed_skills'] = {skill_dir: dx(['sha256sum', skill_dir + '/SKILL.md']).stdout.decode().split()[0]}
        if receipt['installed_skills'][skill_dir] != digest(plan['skill']):
            raise ValueError('Installed skill differs from the frozen package')
        receipt['jg_version'] = dx(['/opt/jg-install/bin/jg', '--version'], 'agent').stdout.decode().strip()
        receipt['candidate_sha256'] = digest(cell['candidate'])
        receipt['package_sha256'] = digest(plan['package'])
        prompt = treatment_prompt(row)
        (out / 'prompt.txt').write_text(prompt)
        receipt['prompt_sha256'] = digest(out / 'prompt.txt')
        token = uuid.uuid4().hex
        put(proxy, '/run/gateway.json', json.dumps({'key': os.environ['AI_GATEWAY_API_KEY'], 'token': token, 'agent_engine': 'codex', 'allow_jev': True, 'jev_provider': jev_provider, 'jev_key': os.environ.get('TYPESAFE_API_KEY') if jev_provider == 'typesafe' else None}).encode(), 'root:root')
        dx(['mkdir', '-p', '/home/agent/.config/jevgrep'], 'agent')
        dx(['chmod', '700', '/home/agent/.config/jevgrep'], 'agent')
        dx(['mkdir', '-p', '/opt/jg-harness'])
        put(tag, '/home/agent/.config/jevgrep/credentials.json', json.dumps({'provider': jev_provider, 'apiKey': token}).encode())
        put(tag, '/opt/jg-harness/provider-route.mjs', Path(plan['provider_preload']).read_bytes(), 'root:root', '444')
        receipt['provider_preload_sha256'] = digest(plan['provider_preload'])
        config = ('model = "openai/gpt-5.6-sol"\nmodel_provider = "vercel"\nmodel_reasoning_effort = "medium"\n'
                  '[model_providers.vercel]\nname = "Vercel AI Gateway"\n'
                  'base_url = "http://model-egress:3129/codex/v1"\nenv_key = "JEVGREP_MODEL_TOKEN"\nwire_api = "responses"\n')
        put(tag, '/home/agent/.codex/config.toml', config.encode())
        native = ['codex', 'exec', '--model', 'openai/gpt-5.6-sol', '-c', 'model_reasoning_effort="medium"', '-c', 'web_search="disabled"', '--json', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check', prompt]
        receipt['command'] = native
        path = '/opt/jg-install/bin:/opt/node-v24.14.0-linux-x64/bin:/opt/miniconda3/envs/testbed/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
        invocation = ['docker', 'exec', '-u', 'agent', '-e', 'HOME=/home/agent', '-e', 'PATH=' + path,
                      '-e', 'CONDA_PREFIX=/opt/miniconda3/envs/testbed', '-e', 'JEVGREP_MODEL_TOKEN=' + token,
                      '-e', 'XDG_CONFIG_HOME=/home/agent/.config',
                      '-e', 'NODE_OPTIONS=--import=/opt/jg-harness/provider-route.mjs',
                      '-e', 'JEVGREP_TEST_PROVIDER_ORIGIN=http://model-egress:3129', '-w', '/testbed', tag, *native]
        receipt['status'] = 'running'
        receipt['agent_started_at'] = time.time()
        write_json(out / 'receipt.json', receipt)
        start = time.monotonic()
        with (out / 'events.jsonl').open('wb') as stdout, (out / 'stderr.txt').open('wb') as stderr:
            receipt['timing_policy'] = plan['timing_policy']
            receipt['timing'] = monitor_native(invocation, stdout, stderr, plan['timing_policy'])
            receipt['exit_code'] = receipt['timing']['exit_code']
            receipt['timed_out'] = receipt['timing']['timed_out']
            if receipt['timed_out']:
                subprocess.run(['docker', 'exec', tag, 'pkill', '-KILL', '-u', '1001'], capture_output=True)
        receipt['agent_elapsed_seconds'] = time.monotonic() - start
        receipt['agent_finished_at'] = time.time()
        receipt['timing_valid'] = receipt['timing']['timing_event_errors'] == 0 and abs(receipt['agent_finished_at'] - receipt['agent_started_at'] - receipt['agent_elapsed_seconds']) <= 5
        events = []
        for line in (out / 'events.jsonl').read_text().splitlines():
            try: events.append(json.loads(line))
            except ValueError: pass
        receipt['native_completed'] = any(event.get('type') == 'turn.completed' for event in events)
        executions = [event['item'].get('command', '') for event in events if event.get('type') == 'item.completed' and event.get('item', {}).get('type') == 'command_execution']
        receipt['required_retrieval_observed'] = any(re.search(r'(?<![A-Za-z0-9_])jg\s+(?!doctor\b|skill\b|auth\b|cache\b|--help\b|--version\b)', execution) for execution in executions)
        receipt['usage_events'] = [event for event in events if event.get('type') == 'turn.completed']
        receipt['source_status'] = dx(['git', '-C', '/testbed', 'status', '--porcelain'], 'agent').stdout.decode()
        dx(['git', '-C', '/testbed', 'add', '-A'], 'agent')
        (out / 'agent.patch').write_bytes(dx(['git', '-C', '/testbed', 'diff', '--cached', base, '--binary'], 'agent').stdout)
        receipt['patch_sha256'] = digest(out / 'agent.patch')
        receipt['all_sessions_copied'] = capture(tag + ':/home/agent/.codex/sessions', out / 'codex-sessions')
        sessions = list((out / 'codex-sessions').rglob('*.jsonl'))
        if len(sessions) == 1:
            shutil.copyfile(sessions[0], out / 'raw-rollout.jsonl')
        receipt['status'] = 'completed' if (not receipt['timed_out'] and receipt.get('exit_code') == 0 and
                                            receipt['native_completed'] and receipt['required_retrieval_observed']) else 'failed'
    except Exception as error:
        receipt['status'] = 'failed'
        # Tool output may contain environment arguments: retain error types, never raw commands or keys.
        receipt['error_type'] = type(error).__name__
    finally:
        logs = subprocess.run(['docker', 'logs', proxy], capture_output=True)
        (out / 'proxy.jsonl').write_bytes(logs.stdout)
        (out / 'proxy-stderr.txt').write_bytes(logs.stderr)
        receipt['jev_traces_copied'] = capture(proxy + ':/run/jev-traces', out / 'jev-traces')
        for container in [tag, proxy]: subprocess.run(['docker', 'rm', '-f', container], capture_output=True)
        subprocess.run(['docker', 'network', 'rm', network], capture_output=True)
        if receipt['status'] in ('preparing', 'running'):
            receipt['status'] = 'interrupted'
        receipt['total_elapsed_seconds'] = time.time() - receipt['started']
        write_json(out / 'receipt.json', receipt)
    print(json.dumps({'status': receipt['status'], 'output': str(out), 'error_type': receipt.get('error_type')}))
    if receipt['status'] != 'completed': raise SystemExit(1)


def grade(args):
    plan, _ = load_plan(args.plan.resolve(), args.task)
    args.tooling = Path(plan['tooling'])
    args.dataset = Path(plan['dataset'])
    out, cell = Path(plan['output']), plan['cell']
    receipt = json.loads((out / 'receipt.json').read_text())
    if receipt['plan_sha256'] != digest(args.plan) or receipt['cell'] != cell or receipt['status'] not in ('completed', 'failed', 'interrupted'):
        raise ValueError('Attempt does not belong to this frozen plan')
    run_id = 'jg-' + cell['id']
    report = args.tooling.resolve() / 'logs/evaluation' / run_id / 'results.json'
    if (out / 'grading-receipt.json').exists():
        print(json.dumps({'status': 'retained', 'grading': str(out / 'grading-receipt.json')}))
        return
    if report.exists():
        raise ValueError('Refusing to reuse an official grading run ID')
    harness = args.tooling.resolve() / 'repo'
    if text(['git', '-C', str(harness), 'rev-parse', 'HEAD']) != HARNESS_COMMIT or text(['git', '-C', str(harness), 'status', '--porcelain']):
        raise ValueError('Official harness checkout changed')
    module = text([str(args.tooling.resolve() / 'venv/bin/python'), '-B', '-c', 'import pathlib,swebench; print(pathlib.Path(swebench.__file__).resolve())'])
    if Path(module).parent.parent != harness:
        raise ValueError('Python environment does not use the pinned official harness')
    prediction = out / 'predictions.jsonl'
    prediction.write_text(json.dumps({'instance_id': cell['instance_id'], 'model_name_or_path': cell['id'], 'model_patch': (out / 'agent.patch').read_text() if (out / 'agent.patch').exists() else ''}) + '\n')
    start = time.monotonic()
    with (out / 'grading-console.log').open('w') as log:
        result = subprocess.run([str(args.tooling.resolve() / 'venv/bin/python'), '-m', 'swebench.harness.run_evaluation', '--dataset_name', str(args.dataset.resolve()), '--predictions_path', str(prediction), '--instance_ids', cell['instance_id'], '--max_workers', '1', '--timeout', '1800', '--run_id', run_id], cwd=args.tooling, stdout=log, stderr=subprocess.STDOUT)
    grading = {'run_id': run_id, 'exit_code': result.returncode, 'grading_seconds': time.monotonic() - start, 'report': str(report)}
    if report.exists():
        summary = json.loads(report.read_text())
        grading.update({key: summary.get(key) for key in ['resolved_instances', 'unresolved_instances', 'infra_failure_instances', 'error_instances']})
    write_json(out / 'grading-receipt.json', grading)
    print(json.dumps(grading))


def valid_cost(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def observed_jev(out, events, log_valid, traces_copied, provider="vercel"):
    """Sum Gateway costs or estimate native input usage at the retained public rate."""
    starts = [event for event in events if event.get('kind') == 'jev-request-start']
    ids = [event.get('requestId') for event in starts]
    safe_ids = {identifier for identifier in ids if isinstance(identifier, str) and re.fullmatch(r'[a-f0-9]{32}', identifier)}
    traces = out / 'jev-traces'
    responses = {path.name.removesuffix('.response.json'): path for path in traces.glob('*.response.json')}
    requests = {path.name.removesuffix('.request.json'): path for path in traces.glob('*.request.json')}
    ends = [event for event in events if event.get('kind') == 'gateway']
    end_ids = [event.get('requestId') for event in ends]
    safe_end_ids = {identifier for identifier in end_ids if isinstance(identifier, str) and re.fullmatch(r'[a-f0-9]{32}', identifier)}
    coverage = (log_valid and traces_copied is True and len(safe_ids) == len(ids) and
                safe_ids == set(responses) == set(requests) == safe_end_ids and len(safe_end_ids) == len(ends) == len(ids))
    costs, inputs, outputs, attempts = [], [], [], []
    native_rate = Decimal('0.042') / 1_000_000
    pricing = {'source': 'https://docs.typesafe.ai/models', 'verified_date': '2026-09-28',
               'model': 'jev-1.13.0', 'input_usd_per_million': 0.042, 'output_usd_per_million': 0,
               'basis': 'Public list-price estimate; no free-credit or negotiated discounts applied'} if provider == 'typesafe' else None
    def count(value):
        return type(value) is int and value >= 0
    # Retained response metadata remains known even if transport logs were lost.
    for identifier in sorted(responses):
        try:
            response = responses[identifier]
            body = json.loads(response.read_text())
            usage = body.get('usage', {})
            if count(usage.get('input_tokens', usage.get('inputTokens'))): inputs.append(usage.get('input_tokens', usage.get('inputTokens')))
            if count(usage.get('output_tokens', usage.get('outputTokens'))): outputs.append(usage.get('output_tokens', usage.get('outputTokens')))
            gateway = body.get('provider_metadata', body.get('providerMetadata', {})).get('gateway', {})
            provider_attempts = gateway.get('routing', {}).get('totalProviderAttemptCount')
            if count(provider_attempts): attempts.append(provider_attempts)
            value = gateway.get('cost')
            if provider == 'typesafe':
                value = None
                if body.get('model') == 'jev-1.13.0' and count(usage.get('input_tokens')):
                    value = str(Decimal(usage['input_tokens']) * native_rate)
            # Billing can be absent while usage and transport coverage remain known.
            try:
                if type(value) not in (str, int, float): raise ValueError('Missing cost')
                cost = Decimal(str(value))
                if not cost.is_finite() or cost < 0 or not math.isfinite(float(cost)): raise ValueError('Invalid cost')
                costs.append(cost)
            except (ValueError, InvalidOperation):
                pass
            matching = [event for event in ends if event.get('requestId') == identifier]
            if len(matching) != 1:
                coverage = False
                continue
            end = matching[0]
            # The broker captures each Jev chunk before writing it to the client.
            # A client disconnect can therefore leave a complete bill in the trace
            # even though responseBytes (delivered bytes) is smaller. Count that
            # paid request, including its retries; malformed JSON still fails above.
            captured_after_disconnect = (end.get('transportError') == 'BrokenPipeError' and
                count(end.get('responseBytes')) and end['responseBytes'] <= response.stat().st_size)
            if (end.get('status') != 200 or end.get('incompleteStream') or
                    (not captured_after_disconnect and (end.get('transportError') or
                        end.get('responseBytes') != response.stat().st_size)) or
                    end.get('requestBytes') != requests[identifier].stat().st_size):
                coverage = False
        except (OSError, ValueError, KeyError, TypeError, AttributeError, InvalidOperation):
            coverage = False
    complete = coverage and len(costs) == len(ids)
    known = float(sum(costs, Decimal(0)))
    if not math.isfinite(known):
        known = None
        complete = False
    return {'basis': 'Native input usage at retained list price' if pricing else 'Retained response Gateway cost metadata; not invoice reconciliation',
            'pricing': pricing, 'cost_kind': 'estimate' if pricing else 'reported',
            'included_in_scored_task_cost': True, 'client_calls': len(ids), 'responses_with_cost': len(costs),
            'complete': complete, 'observed_cost_usd': known if complete else None, 'known_cost_usd': known,
            'responses_with_client_disconnect': sum(event.get('transportError') == 'BrokenPipeError' for event in ends),
            'input_tokens': sum(inputs) if coverage and len(inputs) == len(ids) else None,
            'output_tokens': sum(outputs) if coverage and len(outputs) == len(ids) else None,
            'provider_attempts': sum(attempts) if coverage and len(attempts) == len(ids) else None,
            'known_input_tokens': sum(inputs), 'known_output_tokens': sum(outputs), 'known_provider_attempts': sum(attempts)}


def account(args):
    plan, _ = load_plan(args.plan.resolve(), args.task)
    out = Path(plan['output'])
    receipt = json.loads((out / 'receipt.json').read_text())
    if receipt['cell'] != plan['cell'] or receipt['plan_sha256'] != digest(args.plan) or receipt['status'] not in ('completed', 'failed', 'interrupted'):
        raise ValueError('Accounting requires this plan’s terminal attempt')
    events = []
    log = out / 'proxy.jsonl'
    log_valid = log.exists()
    for line in log.read_text().splitlines() if log.exists() else []:
        try:
            event = json.loads(line)
            if not isinstance(event, dict):
                raise ValueError('Invalid log event')
            events.append(event)
        except ValueError:
            log_valid = False
    starts = [event for event in events if event.get('kind') == 'codex-request-start' and event.get('operation') == 'generation']
    request_ids = {event['requestId'] for event in starts}
    ends = [event for event in events if event.get('kind') == 'codex-gateway' and event.get('requestId') in request_ids]
    observations = [event for event in events if event.get('kind') == 'codex-generation']
    identifiers = list(dict.fromkeys(event['generationId'] for event in observations))
    path = out / 'generation-lookups.json'
    cached = {row['id']: row for row in json.loads(path.read_text())} if path.exists() else {}
    lookups = []
    for identifier in identifiers:
        if identifier in cached and cached[identifier].get('metadata', {}).get('id') == identifier and cached[identifier].get('metadata', {}).get('model') == 'openai/gpt-5.6-sol':
            lookups.append(cached[identifier]); continue
        if not os.environ.get('AI_GATEWAY_API_KEY'): raise ValueError('Gateway credential required for uncached generation accounting')
        request = urllib.request.Request('https://ai-gateway.vercel.sh/v1/generation?' + urllib.parse.urlencode({'id': identifier}), headers={'Authorization': 'Bearer ' + os.environ['AI_GATEWAY_API_KEY']})
        try:
            with urllib.request.urlopen(request, timeout=20) as response: metadata = json.load(response)['data']
            if metadata['id'] != identifier or metadata['model'] != 'openai/gpt-5.6-sol': raise ValueError('Generation identity differs')
            lookups.append({'id': identifier, 'metadata': metadata})
        except (OSError, ValueError, KeyError) as error: lookups.append({'id': identifier, 'error_type': type(error).__name__})
    write_json(path, lookups)
    complete = log_valid and bool(identifiers) and len(request_ids) == len(starts) == len(ends) == len(identifiers) == len(lookups) and request_ids == {event.get('requestId') for event in ends} == {event.get('requestId') for event in observations} and all(event.get('streamTerminal') == 'response.completed' and not event.get('incompleteStream') and not event.get('transportError') and event.get('status') == 200 for event in ends) and all(valid_cost(row.get('metadata', {}).get('total_cost')) for row in lookups)
    known = sum(row.get('metadata', {}).get('total_cost', 0) for row in lookups if valid_cost(row.get('metadata', {}).get('total_cost')))
    result = {'cell': plan['cell']['id'], 'request_starts': len(starts), 'generation_ids': len(identifiers), 'all_requests_accounted': complete, 'known_gateway_cost_usd': known, 'gateway_cost_usd': known if complete else None, 'baseline_cost_usd': plan['baseline_cost_usd'], 'jev': observed_jev(out, events, log_valid, receipt.get('jev_traces_copied'), plan.get('jev_provider', 'vercel'))}
    jev = result['jev']
    result['task_cost_complete'] = complete and jev['complete']
    result['task_cost_usd'] = known + jev['observed_cost_usd'] if result['task_cost_complete'] else None
    result['known_task_cost_usd'] = known + (jev['known_cost_usd'] or 0)
    grading = out / 'grading-receipt.json'
    if grading.exists():
        grade_receipt = json.loads(grading.read_text())
        result['official_resolved'] = grade_receipt.get('run_id') == 'jg-' + plan['cell']['id'] and grade_receipt.get('exit_code') == 0 and grade_receipt.get('resolved_instances') == 1
        result['protocol_valid'] = protocol_valid(receipt)
        result['successful_cost_win'] = result['task_cost_complete'] and result['official_resolved'] and result['protocol_valid'] and result['task_cost_usd'] < plan['baseline_cost_usd']
    write_json(out / 'generation-accounting.json', result)
    print(json.dumps(result))


def protocol_valid(receipt):
    return (receipt.get('status') == 'completed' and receipt.get('exit_code') == 0 and
            receipt.get('native_completed') is True and receipt.get('required_retrieval_observed') is True and
            receipt.get('timing_valid') is True)


def aggregate(args):
    plan = load_cohort(args.plan.resolve())
    rows = []
    for item in plan['cells']:
        out = Path(item['output'])
        def read(name):
            path = out / name
            return json.loads(path.read_text()) if path.exists() else {}
        receipt, grading, billing = read('receipt.json'), read('grading-receipt.json'), read('generation-accounting.json')
        belongs = receipt.get('cell') == item['cell'] and receipt.get('plan_sha256') == digest(args.plan)
        terminal = belongs and receipt.get('status') in ('completed', 'failed', 'interrupted')
        grade_attempted = terminal and grading.get('run_id') == 'jg-' + item['cell']['id'] and type(grading.get('exit_code')) is int
        graded = grade_attempted and grading['exit_code'] == 0
        protocol = terminal and protocol_valid(receipt)
        solved = graded and grading.get('resolved_instances') == 1
        billed = (terminal and billing.get('cell') == item['cell']['id'] and
                  billing.get('task_cost_complete') is True and valid_cost(billing.get('task_cost_usd')))
        cost = billing.get('task_cost_usd') if billed else None
        rows.append({'task': item['cell']['instance_id'], 'status': receipt.get('status', 'not-started'),
                     'terminal': terminal, 'grading_attempted': grade_attempted, 'graded': graded, 'protocol_valid': protocol, 'official_resolved': solved, 'resolved': solved and protocol,
                     'baseline_resolved': item['baseline_resolved'], 'baseline_cost_usd': item['baseline_cost_usd'],
                     'fully_billed': billed, 'task_cost_usd': cost,
                     'gateway_cost_usd': billing.get('gateway_cost_usd') if belongs and billing.get('cell') == item['cell']['id'] else None,
                     'jev': billing.get('jev', {}) if belongs and billing.get('cell') == item['cell']['id'] else {},
                     'known_gateway_cost_usd': billing.get('known_gateway_cost_usd') if belongs and billing.get('cell') == item['cell']['id'] and valid_cost(billing.get('known_gateway_cost_usd')) else None,
                     'successful_cost_win': solved and protocol and billed and cost < item['baseline_cost_usd']})
    full = {row['task'] for row in rows} == {item['task'] for item in REGISTRY['tasks']}
    preserved = sum(row['baseline_resolved'] and row['resolved'] and row['protocol_valid'] for row in rows)
    wins = sum(row['successful_cost_win'] for row in rows)
    complete = all(row['terminal'] and row['graded'] for row in rows)
    result = {'prospective_full_cohort': full, 'complete': complete, 'baseline_solves_preserved': preserved,
              'fully_billed_solved_cost_wins': wins,
              'official_solves': sum(row['official_resolved'] for row in rows),
              'comparison_basis': 'Saved no-Jev baselines; descriptive only, not version acceptance',
              'known_gateway_subtotal_usd': sum(row['known_gateway_cost_usd'] for row in rows if row['known_gateway_cost_usd'] is not None),
              'fully_billed_total_usd': sum(row['task_cost_usd'] for row in rows) if all(row['fully_billed'] for row in rows) else None,
              'jev': {'included_in_scored_task_cost': True,
                      'basis': 'Per-task reported Gateway costs or native list-price estimates; not invoice reconciliation',
                      'complete': all(row['jev'].get('complete') is True and valid_cost(row['jev'].get('observed_cost_usd')) for row in rows),
                      'known_cost_usd': sum(row['jev']['known_cost_usd'] for row in rows if valid_cost(row['jev'].get('known_cost_usd'))),
                      'observed_cost_usd': sum(row['jev']['observed_cost_usd'] for row in rows) if all(row['jev'].get('complete') is True and valid_cost(row['jev'].get('observed_cost_usd')) for row in rows) else None},
              'cells': rows}
    write_json(args.plan.resolve().parent / 'aggregate.json', result)
    print(json.dumps(result))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='operation', required=True)
    prep = sub.add_parser('prepare', help='Install a package in the retained image and freeze a new treatment; no model calls')
    prep.add_argument('--package', type=Path, required=True)
    prep.add_argument('--output', type=Path, required=True)
    prep.add_argument('--task', default='all', choices=['all', *[item['task'] for item in REGISTRY['tasks']]])
    prep.add_argument('--evidence-root', type=Path, default=ROOT)
    prep.add_argument('--skill', type=Path, default=ROOT / 'skills/jevgrep/SKILL.md')
    prep.add_argument('--jev-provider', choices=['vercel', 'typesafe'], default='vercel', help='Jev route only; Sol remains on Gateway')
    prep.add_argument('--runtime-image', help='Rebuilt image ID extending the pinned source; source/tool versions still verified, original image recorded')
    execute = sub.add_parser('run', help='Run the paid coding-agent treatment once, or validate without calls')
    execute.add_argument('--plan', type=Path, required=True)
    execute.add_argument('--dry-run', action='store_true')
    grading = sub.add_parser('grade', help='Run the official evaluator under a new run ID')
    grading.add_argument('--plan', type=Path, required=True)
    billing = sub.add_parser('account', help='Reconcile full Sol billing; never count unknown charges as zero')
    billing.add_argument('--plan', type=Path, required=True)
    summary = sub.add_parser('aggregate', help='Summarize official results and billing without a promotion verdict')
    summary.add_argument('--plan', type=Path, required=True)
    for operation in [execute, grading, billing]:
        choice = operation.add_mutually_exclusive_group(required=True)
        choice.add_argument('--task', choices=[item['task'] for item in REGISTRY['tasks']])
        choice.add_argument('--all', action='store_true')
    args = parser.parse_args()
    if args.operation in ('prepare', 'aggregate'):
        {'prepare': prepare, 'aggregate': aggregate}[args.operation](args)
        return
    cohort = load_cohort(args.plan.resolve())
    tasks = [item['cell']['instance_id'] for item in cohort['cells']] if args.all else [args.task]
    failed = False
    for task in tasks:
        args.task = task
        try:
            {'run': run, 'grade': grade, 'account': account}[args.operation](args)
        except SystemExit:
            failed = True
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    try: main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as error:
        print(json.dumps({'status': 'failed', 'error_type': type(error).__name__, 'message': str(error) if isinstance(error, ValueError) else 'Inspect the retained attempt or preparation log.'}))
        raise SystemExit(1)
