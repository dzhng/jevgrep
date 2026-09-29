"""Focused tests run inside Docker; every writable artifact stays in temporary storage."""
import argparse
import contextlib
import hashlib
import http.client
import http.server
import importlib.util
import io
import json
import os
import sys
import subprocess
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent

def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

runner = load('installed')
broker = load('gateway_broker')

class InstalledTests(unittest.TestCase):
    def test_rebuilt_runtime_records_new_identity_without_rewriting_baseline(self):
        with tempfile.TemporaryDirectory() as temporary:
            path, _ = self.fixture(Path(temporary))
            plan = json.loads(path.read_text())
            item = plan['cells'][0]
            baseline_path = Path(item['baseline']) / 'receipt.json'
            original = baseline_path.read_bytes()
            plan['runtime_rebuild'] = {
                'original_image': item['cell']['image'],
                'image': 'sha256:' + '1' * 64,
                'source_pinned_ref': item['cell']['source_pinned_ref'],
            }
            item['cell']['image'] = plan['runtime_rebuild']['image']
            runner.write_json(path, plan)
            restored = runner.load_cohort(path)
            self.assertEqual(restored['cells'][0]['cell']['image'], 'sha256:' + '1' * 64)
            self.assertEqual(baseline_path.read_bytes(), original)
            plan['runtime_rebuild']['source_pinned_ref'] = 'different-source'
            runner.write_json(path, plan)
            with self.assertRaisesRegex(ValueError, 'source/environment pairing'):
                runner.load_cohort(path)

    def test_frozen_prompt_and_required_product_call(self):
        row = {'problem_statement': 'Fix behavior.'}
        self.assertEqual(hashlib.sha256(runner.baseline_prompt(row).encode()).hexdigest(), '41c7e3cf7acbc19d0b24ab55e6ea29fe3cdbc2b777549d158488c6c55baaa643')
        prompt = runner.treatment_prompt(row)
        self.assertTrue(prompt.startswith('$jevgrep\n\n'))
        self.assertEqual(prompt, '$jevgrep\n\n' + runner.baseline_prompt(row).replace(
            'The entire task, including verification, has a 900-second deadline. ', runner.TREATMENT_TIMING, 1))
        self.assertTrue(prompt.endswith(runner.VERIFICATION + '\n\nFix behavior.'))

    def monitor(self, steps, work_seconds=2, hard_wall_seconds=10):
        script = "import json,time\n" + "\n".join(
            "time.sleep(%r)" % step if isinstance(step, (int, float)) else
            "print(%r, flush=True)" % json.dumps(step) for step in steps)
        with tempfile.TemporaryDirectory() as temporary:
            with open(Path(temporary)/'events.jsonl', 'wb') as stdout, open(Path(temporary)/'stderr', 'wb') as stderr:
                result = runner.monitor_native([sys.executable, '-u', '-c', script], stdout, stderr,
                                               {**runner.TIMING_POLICY, 'work_seconds':work_seconds,
                                                'hard_wall_seconds':hard_wall_seconds})
            events = (Path(temporary)/'events.jsonl').read_text()
        return result, events

    def event(self, identifier, command, completed=False, **extra):
        return {'type':'item.completed' if completed else 'item.started',
                'item':{'id':identifier,'type':'command_execution','command':command,**extra}}

    def test_direct_jg_wait_does_not_consume_work_budget(self):
        command = "/bin/sh -lc 'jg \"research the mechanism\"'"
        result, events = self.monitor([self.event('search', command), 3.2,
                                       self.event('search', command, True), {'type':'turn.completed'}])
        self.assertEqual(result['exit_code'], 0)
        self.assertFalse(result['timed_out'])
        self.assertGreater(result['retrieval_wait_seconds'], 3)
        self.assertLess(result['work_seconds'], 2)
        self.assertEqual(result['credit_intervals'][0]['command_ids'], ['search'])
        self.assertIn('turn.completed', events)

    def test_nonterminal_error_during_retrieval_preserves_credit_until_completion(self):
        command = 'jg "research"'
        result, events = self.monitor([self.event('search', command), 0.3,
                                       {'type':'error','message':'stream reconnecting'}, 3.2,
                                       self.event('search', command, True), {'type':'turn.completed'}])
        self.assertEqual(result['exit_code'], 0)
        self.assertFalse(result['timed_out'])
        self.assertEqual(result['timing_event_errors'], 0)
        self.assertGreater(result['retrieval_wait_seconds'], 3)
        self.assertEqual(len(result['credit_intervals']), 1)
        self.assertIn('turn.completed', events)

    def test_unrelated_command_reaches_work_deadline(self):
        result, events = self.monitor([self.event('test', "python -m unittest"), 3,
                                       {'type':'turn.completed'}])
        self.assertTrue(result['timed_out'])
        self.assertEqual(result['timeout_kind'], 'work')
        self.assertEqual(result['retrieval_wait_seconds'], 0)
        self.assertGreaterEqual(result['work_seconds'], 2)
        self.assertNotIn('turn.completed', events)

    def test_cancelled_jg_stops_credit_and_remaining_work_times_out(self):
        command = 'jg "research"'
        result, events = self.monitor([self.event('search', command), 0.6,
                                       self.event('search', command, True, exit_code=130, status='failed'),
                                       3, {'type':'turn.completed'}])
        self.assertTrue(result['timed_out'])
        self.assertEqual(result['timeout_kind'], 'work')
        self.assertGreater(result['retrieval_wait_seconds'], 0.4)
        self.assertGreaterEqual(result['work_seconds'], 2)
        self.assertEqual(len(result['credit_intervals']), 1)
        self.assertIn('"exit_code": 130', events)

    def test_other_command_overlap_counts_as_work(self):
        command = 'jg "research"'
        result, events = self.monitor([self.event('search', command), 0.6,
                                       self.event('test', 'python -m unittest'), 3,
                                       {'type':'turn.completed'}])
        self.assertTrue(result['timed_out'])
        self.assertEqual(result['timeout_kind'], 'work')
        self.assertGreater(result['retrieval_wait_seconds'], 0.4)
        self.assertGreaterEqual(result['work_seconds'], 2)
        self.assertEqual(result['credit_intervals'][0]['command_ids'], ['search'])
        self.assertNotIn('turn.completed', events)

    def test_overlapping_retrieval_is_union_not_double_credit(self):
        result, _ = self.monitor([self.event('a', 'jg "first"'), 0.3,
                                  self.event('b', 'jg "second"'), 0.6,
                                  self.event('a', 'jg "first"', True), 0.3,
                                  self.event('b', 'jg "second"', True), {'type':'turn.completed'}])
        self.assertEqual(result['exit_code'], 0)
        self.assertFalse(result['timed_out'])
        self.assertEqual([span['command_ids'] for span in result['credit_intervals']], [['a'], ['a', 'b'], ['b']])
        self.assertAlmostEqual(result['work_seconds'] + result['retrieval_wait_seconds'], result['wall_seconds'])
        self.assertLessEqual(result['retrieval_wait_seconds'], result['wall_seconds'])

    def test_hard_wall_stops_unfinished_retrieval(self):
        result, _ = self.monitor([self.event('search', 'jg "research"'), 5], work_seconds=4, hard_wall_seconds=1.5)
        self.assertTrue(result['timed_out'])
        self.assertEqual(result['timeout_kind'], 'hard_wall')
        self.assertTrue(result['credit_intervals'])

    def test_only_unambiguous_standalone_search_gets_credit(self):
        for command in ['jg "query with ; punctuation"', "/bin/sh -lc 'jg query'",
                        'jg --no-cache "query" /testbed', '/opt/jg-install/bin/jg "query" --max-source-bytes=0']:
            with self.subTest(command=command): self.assertTrue(runner.direct_jg_search(command))
        for command in ['jg', 'jg doctor', 'jg auth --stdin', 'jg cache clear', 'jg skill', 'jg --help',
                        'jg -h', 'jg --version', 'jg "query" --version', 'jg "query"; sleep 5',
                        'jg "query" && sleep 5', 'sleep 5 | jg "query"', 'jg "query" > out',
                        'jg "$(sleep 5)"', 'env KEY=value jg "query"', 'echo jg "query"', 'jg "query" &', 'jg doc*', 'jg auth?', 'jg {auth,doctor}',
                        'jg "query"\nsleep 5']:
            with self.subTest(command=command): self.assertFalse(runner.direct_jg_search(command))

    def test_timing_policy_drift_and_legacy_schema_require_their_archived_runner(self):
        with tempfile.TemporaryDirectory() as temporary:
            path, _ = self.fixture(Path(temporary))
            plan = json.loads(path.read_text())
            plan['timing_policy']['work_seconds'] = 901
            runner.write_json(path, plan)
            with self.assertRaisesRegex(ValueError, 'timing policy changed'): runner.load_cohort(path)
            plan['schema'] = 2
            runner.write_json(path, plan)
            with self.assertRaisesRegex(ValueError, 'archived runner'): runner.load_cohort(path)

    def fixture(self, root, all_tasks=False):
        registry = json.loads(json.dumps(runner.REGISTRY))
        entries = registry['tasks'] if all_tasks else [registry['tasks'][4]]
        cells, rows = [], []
        skill = root/'skill.md'; skill.write_text('installed skill')
        package = root/'package.tgz'; package.write_bytes(b'package')
        prefix = root/'installed-prefix.tar'; prefix.write_bytes(b'installed prefix')
        for index, entry in enumerate(entries):
            baseline = root / ('baseline-' + str(index)); baseline.mkdir()
            cell = entry['cell']
            row = {'instance_id':entry['task'],'repo':'fixture/repo','base_commit':'public-base','image':cell['source_image'],'problem_statement':'Fix behavior.'}
            rows.append(row)
            (baseline/'prompt.txt').write_text(runner.baseline_prompt(row))
            runner.write_json(baseline/'receipt.json',{'image':cell['image'],'cell':cell,'versions':runner.VERSIONS,'provider_route':'vercel-ai-gateway','prompt_sha256':runner.digest(baseline/'prompt.txt')})
            runner.write_json(baseline/'grading-receipt.json',{'resolved_instances':int(entry['resolved'])})
            entry['files']={name:runner.digest(baseline/name) for name in ['receipt.json','prompt.txt','grading-receipt.json']}
            cells.append({'baseline':str(baseline),'baseline_cost_usd':entry['cost_usd'],'baseline_resolved':entry['resolved'],
                          'cell':{**cell,'id':'installed-' + str(index),'arm':'chunks','candidate':str(prefix)},'output':str(root / ('attempt-' + str(index)))})
        registry_path = root/'fixed-baselines.json';runner.write_json(registry_path,registry)
        patcher=patch.object(runner,'REGISTRY',registry);patcher.start();self.addCleanup(patcher.stop)
        inputs = root / 'agent-inputs.json'; runner.write_json(inputs,rows)
        dataset=root/'dataset.json';dataset.write_text('fixture dataset')
        paths = [runner.PROVIDER_ROUTE,dataset,Path(runner.__file__),HERE/'gateway_broker.py',registry_path,inputs,skill,package,prefix]
        plan = {'schema':4,'timing_policy':dict(runner.TIMING_POLICY),'status':'frozen','cells':cells,'runner':str(Path(runner.__file__)),'broker':str(HERE/'gateway_broker.py'),
                'provider_preload':str(runner.PROVIDER_ROUTE),'registry':str(registry_path),'tooling':str(root/'tooling'),'dataset':str(root/'dataset.json'),
                'inputs':str(inputs),'skill':str(skill),'package':str(package),'artifacts':{str(p):runner.digest(p) for p in paths}}
        plan_path=root/'plan.json';runner.write_json(plan_path,plan)
        return plan_path,{**plan,**cells[0]}

    def receipt(self, path, plan, status='completed'):
        out=Path(plan['output']);out.mkdir(exist_ok=True)
        runner.write_json(out/'receipt.json',{'plan_sha256':runner.digest(path),'cell':plan['cell'],'status':status,
                                            'required_retrieval_observed':True,'timing_valid':True,'native_completed':True,'exit_code':0,'host_pid':os.getpid()})
        return out

    def test_timeout_with_zero_exit_retains_patch_but_cannot_complete_treatment(self):
        with tempfile.TemporaryDirectory() as temporary:
            path, plan = self.fixture(Path(temporary))
            calls, writes, elapsed, lifetime = [], {}, [0], [float('inf')]
            def docker(argv, checked=True, **kwargs):
                calls.append(argv)
                if 'input' in kwargs: writes[argv[-3]] = kwargs['input']
                if argv[:3] == ['docker', 'run', '-d'] and argv[-2] == 'sleep':
                    lifetime[0] = float(argv[-1])
                if argv[:2] == ['docker', 'exec'] and elapsed[0] >= lifetime[0]:
                    if checked:
                        raise subprocess.CalledProcessError(1, ['docker', 'exec'])
                    return subprocess.CompletedProcess(argv, 1, b'', b'container stopped')
                output = b''
                if argv[-2:] == ['rev-parse', 'HEAD']:
                    output = plan['cell']['expected_image_head'].encode()
                elif argv[-2:] == ['rev-parse', 'HEAD^{tree}']:
                    output = plan['cell']['expected_source_tree'].encode()
                elif argv[-1:] == ['--version'] and argv[-2] in runner.VERSIONS:
                    output = runner.VERSIONS[argv[-2]].encode()
                elif 'sha256sum' in argv:
                    output = (runner.digest(plan['skill']) + ' skill').encode()
                elif 'diff' in argv:
                    output = b'fixture patch'
                return subprocess.CompletedProcess(argv, 0, output, b'')
            def expired(invocation, stdout, stderr, policy):
                self.assertIn('NODE_OPTIONS=--import=/opt/jg-harness/provider-route.mjs', invocation)
                self.assertIn('JEVGREP_TEST_PROVIDER_ORIGIN=http://model-egress:3129', invocation)
                self.assertFalse(any(arg.startswith('AI_GATEWAY_') for arg in invocation))
                saved = json.loads(writes['/home/agent/.config/jevgrep/credentials.json'])
                self.assertEqual(saved['provider'], 'vercel')
                self.assertNotEqual(saved['apiKey'], 'fixture-only')
                self.assertEqual(writes['/opt/jg-harness/provider-route.mjs'], runner.PROVIDER_ROUTE.read_bytes())
                # Native completion can already be in the pipe when the work
                # deadline is noticed. A zero OS exit cannot override that clock.
                # Simulate an hour of retrieval plus expired work. Docker's
                # task container must remain available for patch extraction.
                elapsed[0] = 4501
                events = [self.event('search', 'jg "research"', True), {'type':'turn.completed'}]
                stdout.write(('\n'.join(json.dumps(e) for e in events) + '\n').encode())
                return {'exit_code':0,'timed_out':True,'timeout_kind':'work',
                        'wall_seconds':4501,'work_seconds':901,'retrieval_wait_seconds':3600,
                        'credit_intervals':[],'timing_event_errors':0}
            with patch.object(runner, 'check_image', return_value=plan['cell']['image']), \
                 patch.object(runner, 'command', side_effect=docker), \
                 patch.object(runner.subprocess, 'run', side_effect=lambda argv, **kw: docker(argv, checked=False, **kw)), \
                 patch.object(runner, 'monitor_native', side_effect=expired), \
                 patch.dict(os.environ, {'AI_GATEWAY_API_KEY':'fixture-only'}), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(SystemExit):
                    runner.run(argparse.Namespace(plan=path, dry_run=False, task=None))
            out = Path(plan['output'])
            receipt = json.loads((out/'receipt.json').read_text())
            self.assertEqual(receipt['exit_code'], 0)
            self.assertTrue(receipt['timed_out'])
            self.assertTrue(receipt['native_completed'])
            self.assertTrue(receipt['required_retrieval_observed'])
            self.assertEqual(receipt['status'], 'failed')
            self.assertFalse(runner.protocol_valid(receipt))
            self.assertEqual((out/'agent.patch').read_bytes(), b'fixture patch')
            self.assertEqual(sum(call[:3] == ['docker', 'rm', '-f'] for call in calls), 2)

    def test_dry_run_validates_pair_without_credentials_or_agent(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,plan=self.fixture(Path(temporary))
            with patch.object(runner,'check_image',return_value=plan['cell']['image']),patch.object(runner,'command',side_effect=AssertionError('No agent or paid command allowed')),patch.dict(os.environ,{},clear=True),contextlib.redirect_stdout(io.StringIO()) as stdout:
                runner.run(argparse.Namespace(plan=path,dry_run=True,task=None))
            self.assertEqual(json.loads(stdout.getvalue())['paid_calls'],0)
            self.assertFalse(Path(plan['output']).exists())
            Path(plan['cell']['candidate']).write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'Frozen artifact changed'):runner.load_plan(path)

    def test_changed_model_is_not_paired_to_the_old_baseline(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,plan=self.fixture(Path(temporary))
            cohort=json.loads(path.read_text());cohort['cells'][0]['cell']['model']='another-model';runner.write_json(path,cohort)
            with self.assertRaisesRegex(ValueError,'pairing changed'):runner.load_plan(path)

    def test_grading_rejects_a_changed_official_harness_before_execution(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);path,plan=self.fixture(root);self.receipt(path,plan)
            with patch.object(runner,'text',return_value='changed-harness'),patch.object(runner.subprocess,'run',side_effect=AssertionError('No grader launched')):
                with self.assertRaisesRegex(ValueError,'harness checkout changed'):
                    runner.grade(argparse.Namespace(plan=path,tooling=root/'tooling',dataset=root/'dataset.json',task=None))

    def test_incomplete_billing_never_counts_missing_charges_as_free(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,plan=self.fixture(Path(temporary));out=self.receipt(path,plan)
            events=[{'kind':'codex-request-start','operation':'generation','requestId':'one'},{'kind':'codex-generation','requestId':'one','generationId':'gen_one'},{'kind':'codex-gateway','requestId':'one','status':200,'streamTerminal':'response.completed'}, {'kind':'codex-request-start','operation':'generation','requestId':'missing'}]
            (out/'proxy.jsonl').write_text('\n'.join(json.dumps(e) for e in events))
            runner.write_json(out/'generation-lookups.json',[{'id':'gen_one','metadata':{'id':'gen_one','model':'openai/gpt-5.6-sol','total_cost':0.1}}])
            runner.write_json(out/'grading-receipt.json',{'resolved_instances':1})
            with patch.object(runner.urllib.request,'urlopen',side_effect=AssertionError('No network')),contextlib.redirect_stdout(io.StringIO()):runner.account(argparse.Namespace(plan=path,task=None))
            result=json.loads((out/'generation-accounting.json').read_text())
            self.assertEqual(result['known_gateway_cost_usd'],0.1)
            self.assertIsNone(result['gateway_cost_usd']);self.assertFalse(result['successful_cost_win'])

    def test_terminal_failures_are_retained_and_active_attempts_stop(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,plan=self.fixture(Path(temporary));out=self.receipt(path,plan,'failed')
            with patch.object(runner,'text',side_effect=AssertionError('Terminal attempts need no process probe')):
                self.assertTrue(runner.existing_attempt(plan))
            self.receipt(path,plan,'running')
            with patch.object(runner,'text',return_value='active-container'):
                with self.assertRaisesRegex(ValueError,'active'):runner.existing_attempt(plan)
            with patch.object(runner.os,'kill',side_effect=ProcessLookupError),patch.object(runner,'text',return_value=''):
                self.assertTrue(runner.existing_attempt(plan))
            self.assertEqual(json.loads((out/'receipt.json').read_text())['status'],'interrupted')

    def test_cohort_reports_official_results_and_incomplete_billing(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,plan=self.fixture(Path(temporary),all_tasks=True)
            for index,item in enumerate(plan['cells']):
                out=self.receipt(path,item)
                runner.write_json(out/'grading-receipt.json',{'run_id':'jg-'+item['cell']['id'],'exit_code':0,'resolved_instances':int(item['baseline_resolved'])})
                runner.write_json(out/'generation-accounting.json',{'cell':item['cell']['id'],'all_requests_accounted':index<7,'gateway_cost_usd':0.01 if index<7 else None,'known_gateway_cost_usd':0.01,'task_cost_complete':index<7,'task_cost_usd':0.02 if index<7 else None})
            with contextlib.redirect_stdout(io.StringIO()):result=runner.aggregate(argparse.Namespace(plan=path))
            self.assertEqual(result['official_solves'],8);self.assertEqual(result['baseline_solves_preserved'],8)
            self.assertEqual(result['fully_billed_solved_cost_wins'],7);self.assertIsNone(result['fully_billed_total_usd'])
            for item in plan['cells'][8:]:
                self.receipt(path,item,'failed')
            with contextlib.redirect_stdout(io.StringIO()):result=runner.aggregate(argparse.Namespace(plan=path))
            self.assertEqual(result['official_solves'],8)
            self.assertFalse(result['cells'][-1]['protocol_valid'])
            self.assertAlmostEqual(result['known_gateway_subtotal_usd'],0.1)
            last=plan['cells'][-1]
            runner.write_json(Path(last['output'])/'grading-receipt.json',{'run_id':'jg-'+last['cell']['id'],'exit_code':1})
            with contextlib.redirect_stdout(io.StringIO()):result=runner.aggregate(argparse.Namespace(plan=path))
            self.assertEqual(result['official_solves'],8)
            out=Path(plan['cells'][0]['output']);runner.write_json(out/'generation-accounting.json',{'cell':plan['cells'][0]['cell']['id'],'all_requests_accounted':False,'gateway_cost_usd':None,'successful_cost_win':True})
            with contextlib.redirect_stdout(io.StringIO()):result=runner.aggregate(argparse.Namespace(plan=path))
            self.assertIsNone(result['fully_billed_total_usd']);self.assertEqual(result['fully_billed_solved_cost_wins'],6)
            runner.write_json(out/'grading-receipt.json',{'run_id':'jg-'+plan['cells'][0]['cell']['id'],'exit_code':0,'resolved_instances':0})
            with contextlib.redirect_stdout(io.StringIO()):result=runner.aggregate(argparse.Namespace(plan=path))
            self.assertEqual(result['baseline_solves_preserved'],7)

    def test_cohort_cannot_mix_installations_or_reuse_an_attempt_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,_=self.fixture(Path(temporary),all_tasks=True)
            plan=json.loads(path.read_text())
            original=plan['cells'][1]['cell']['candidate']
            plan['cells'][1]['cell']['candidate']='different-installation';runner.write_json(path,plan)
            with self.assertRaisesRegex(ValueError,'one prefix'):runner.load_cohort(path)
            plan['cells'][1]['cell']['candidate']=original
            plan['cells'][1]['output']=plan['cells'][0]['output'];runner.write_json(path,plan)
            with self.assertRaisesRegex(ValueError,'distinct attempt'):runner.load_cohort(path)

    def test_unstarted_task_is_not_complete(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,_=self.fixture(Path(temporary))
            with contextlib.redirect_stdout(io.StringIO()):result=runner.aggregate(argparse.Namespace(plan=path))
            self.assertFalse(result['prospective_full_cohort']);self.assertFalse(result['complete'])

    def jev_fixture(self, root):
        traces=root/'jev-traces';traces.mkdir()
        events=[]
        for index,cost in enumerate(['0.01','0.02']):
            identifier=str(index)*32
            request=traces/(identifier+'.request.json');request.write_text('{}')
            response=traces/(identifier+'.response.json')
            runner.write_json(response,{'usage':{'inputTokens':10,'outputTokens':2},'providerMetadata':{'gateway':{'cost':cost,'routing':{'totalProviderAttemptCount':index+1}}}})
            events.extend([{'kind':'jev-request-start','requestId':identifier},
                           {'kind':'gateway','requestId':identifier,'status':200,'requestBytes':request.stat().st_size,'responseBytes':response.stat().st_size}])
        return events

    def test_jev_reports_response_cost_once_and_provider_retry_counts_separately(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);events=self.jev_fixture(root)
            result=runner.observed_jev(root,events,True,True)
            self.assertTrue(result['complete']);self.assertEqual(result['observed_cost_usd'],0.03)
            self.assertEqual(result['client_calls'],2);self.assertEqual(result['provider_attempts'],3)
            self.assertEqual(result['input_tokens'],20);self.assertEqual(result['output_tokens'],4)
            self.assertTrue(result['included_in_scored_task_cost'])

    def test_jev_missing_invalid_or_unfinished_responses_leave_total_unknown(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);events=self.jev_fixture(root)
            response=root/'jev-traces'/('1'*32+'.response.json')
            original=response.read_bytes()
            for value in [b'{',b'{}',b'{"providerMetadata":{"gateway":{"cost":"NaN"}}}',b'{"providerMetadata":{"gateway":{"cost":true}}}']:
                response.write_bytes(value)
                result=runner.observed_jev(root,events,True,True)
                self.assertFalse(result['complete']);self.assertIsNone(result['observed_cost_usd'])
                self.assertEqual(result['known_cost_usd'],0.01)
            response.write_bytes(original)
            for log_valid,copied,extra in [(False,True,[]),(True,False,[]),(True,True,[events[0]])]:
                result=runner.observed_jev(root,events+extra,log_valid,copied)
                self.assertFalse(result['complete']);self.assertIsNone(result['observed_cost_usd'])
            events[-1]['transportError']='Interrupted'
            self.assertIsNone(runner.observed_jev(root,events,True,True)['observed_cost_usd'])

    def test_jev_retained_bill_counts_when_client_disconnects_after_response_capture(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);events=self.jev_fixture(root)
            events[-1]['transportError']='BrokenPipeError'
            events[-1]['responseBytes']=0
            result=runner.observed_jev(root,events,True,True)
            self.assertTrue(result['complete'])
            self.assertEqual(result['observed_cost_usd'],0.03)
            self.assertEqual(result['input_tokens'],20)
            response=root/'jev-traces'/('1'*32+'.response.json')
            response.write_text('{')
            self.assertFalse(runner.observed_jev(root,events,True,True)['complete'])

    def test_retained_jev_cost_survives_missing_log_or_request_start(self):
        for missing_log in [True, False]:
            with self.subTest(missing_log=missing_log),tempfile.TemporaryDirectory() as temporary:
                path,plan=self.fixture(Path(temporary));out=self.receipt(path,plan)
                events=self.jev_fixture(out)
                if not missing_log:
                    (out/'proxy.jsonl').write_text('\n'.join(json.dumps(event) for event in events[1:]))
                receipt=json.loads((out/'receipt.json').read_text());receipt['jev_traces_copied']=True;runner.write_json(out/'receipt.json',receipt)
                with patch.object(runner.urllib.request,'urlopen',side_effect=AssertionError('No network')),contextlib.redirect_stdout(io.StringIO()):
                    runner.account(argparse.Namespace(plan=path,task=None))
                result=json.loads((out/'generation-accounting.json').read_text())['jev']
                self.assertEqual(result['known_cost_usd'],0.03)
                self.assertEqual(result['responses_with_cost'],2)
                self.assertEqual(result['known_input_tokens'],20)
                self.assertEqual(result['known_provider_attempts'],3)
                self.assertFalse(result['complete']);self.assertIsNone(result['observed_cost_usd'])

    def test_jev_cost_changes_total_task_cost_win(self):
        with tempfile.TemporaryDirectory() as temporary:
            path,plan=self.fixture(Path(temporary));out=self.receipt(path,plan)
            events=self.jev_fixture(out)
            identifier='0'*32;response=out/'jev-traces'/(identifier+'.response.json')
            body=json.loads(response.read_text());body['providerMetadata']['gateway']['cost']='100';runner.write_json(response,body)
            events[1]['responseBytes']=response.stat().st_size
            events.extend([{'kind':'codex-request-start','operation':'generation','requestId':'sol'},
                           {'kind':'codex-generation','requestId':'sol','generationId':'gen_sol'},
                           {'kind':'codex-gateway','requestId':'sol','status':200,'streamTerminal':'response.completed'}])
            (out/'proxy.jsonl').write_text('\n'.join(json.dumps(event) for event in events))
            receipt=json.loads((out/'receipt.json').read_text());receipt['jev_traces_copied']=True;runner.write_json(out/'receipt.json',receipt)
            runner.write_json(out/'generation-lookups.json',[{'id':'gen_sol','metadata':{'id':'gen_sol','model':'openai/gpt-5.6-sol','total_cost':0.1}}])
            runner.write_json(out/'grading-receipt.json',{'run_id':'jg-'+plan['cell']['id'],'exit_code':0,'resolved_instances':1})
            with patch.object(runner.urllib.request,'urlopen',side_effect=AssertionError('No network')),contextlib.redirect_stdout(io.StringIO()):
                runner.account(argparse.Namespace(plan=path,task=None))
            result=json.loads((out/'generation-accounting.json').read_text())
            self.assertEqual(result['gateway_cost_usd'],0.1);self.assertFalse(result['successful_cost_win'])
            self.assertAlmostEqual(result['task_cost_usd'],100.12)
            self.assertEqual(result['jev']['observed_cost_usd'],100.02)

    def test_native_usage_survives_missing_cost(self):
        for cost in ['0.04', None, 'NaN', True, '0']:
            with self.subTest(cost=cost), tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary);events=self.jev_fixture(root)
                for index in range(2):
                    response=root/'jev-traces'/(str(index)*32+'.response.json')
                    runner.write_json(response,{'usage':{'input_tokens':11,'output_tokens':3},'provider_metadata':{'gateway':{'cost':cost,'generationId':'fixture-generation'}}})
                    events[index*2+1]['responseBytes']=response.stat().st_size
                result=runner.observed_jev(root,events,True,True)
                self.assertEqual(result['input_tokens'],22);self.assertEqual(result['output_tokens'],6)
                self.assertEqual(result['observed_cost_usd'],float(cost)*2 if cost in ('0.04','0') else None)
                self.assertEqual(result['complete'],cost in ('0.04','0'))

    def test_native_list_price_estimate_requires_full_usage_and_known_model(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);events=self.jev_fixture(root)
            for index in range(2):
                response=root/'jev-traces'/(str(index)*32+'.response.json')
                runner.write_json(response,{'model':'jev-1.13.0','usage':{'input_tokens':1_000_000,'output_tokens':500}})
                events[index*2+1]['responseBytes']=response.stat().st_size
            result=runner.observed_jev(root,events,True,True,'typesafe')
            self.assertTrue(result['complete']);self.assertAlmostEqual(result['observed_cost_usd'],0.084)
            self.assertEqual(result['cost_kind'],'estimate')
            response.write_text('{}');events[-1]['responseBytes']=response.stat().st_size
            result=runner.observed_jev(root,events,True,True,'typesafe')
            self.assertFalse(result['complete']);self.assertIsNone(result['observed_cost_usd'])
            self.assertAlmostEqual(result['known_cost_usd'],0.042)

    def test_preload_is_required_and_identity_checked(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);path,plan=self.fixture(root)
            runner.load_cohort(path)
            plan=json.loads(path.read_text())
            plan['schema']=3;runner.write_json(path,plan)
            with self.assertRaisesRegex(ValueError,'schema-4'):runner.load_cohort(path)
            plan['schema']=4
            preload=root/'provider-route.mjs';preload.write_bytes(runner.PROVIDER_ROUTE.read_bytes())
            plan['provider_preload']=str(preload)
            runner.write_json(path,plan)
            with self.assertRaisesRegex(ValueError,'required artifact'):runner.load_cohort(path)
            plan['artifacts'][str(preload)]=runner.digest(preload);runner.write_json(path,plan)
            runner.load_cohort(path)
            preload.write_text('modified')
            with self.assertRaisesRegex(ValueError,'Frozen artifact changed'):runner.load_cohort(path)
            plan['artifacts'][str(preload)]=runner.digest(preload);runner.write_json(path,plan)
            with self.assertRaisesRegex(ValueError,'frozen provider preload'):runner.load_cohort(path)

    def test_broker_rejects_wrong_target_auth_and_body_before_capture(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);config=root/'gateway.json'
            config.write_text(json.dumps({'key':'real-key','token':'token','allow_jev':True}))
            route='/typesafe/v1/systemone'
            headers={'Authorization':'Bearer token','x-jevgrep-original-url':'https://ai-gateway.vercel.sh'+route}
            body={'model':'typesafe-ai/jev','state':{},'questions':{'q':{'type':'noul','instructions':'matches?'}}}
            cases=[('/evaluation-model',headers,body),(route+'?target=evil',headers,body),
                   (route,{**headers,'Authorization':'Bearer wrong'},body),
                   (route,{**headers,'x-jevgrep-original-url':'https://evil.example'+route},body),
                   (route,headers,{**body,'model':'other'}),(route,headers,{**body,'state':None}),
                   (route,headers,{**body,'questions':{'q':{'type':'boolean'}}}),(route,headers,[]),(route,headers,'invalid-json'),(route,{'Authorization':'Bearer token'},body)]
            with patch.object(broker,'CONFIG_PATH',str(config)),patch.object(broker,'TRACE_DIR',str(root/'traces')),patch.object(broker.urllib.request,'urlopen',side_effect=AssertionError('No forwarding')),contextlib.redirect_stdout(io.StringIO()):
                server=http.server.ThreadingHTTPServer(('127.0.0.1',0),broker.Gateway)
                thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
                try:
                    for path,auth,value in cases:
                        client=http.client.HTTPConnection('127.0.0.1',server.server_port)
                        client.request('POST',path,value if isinstance(value,str) else json.dumps(value),auth)
                        response=client.getresponse();self.assertEqual(response.status,403);response.read();client.close()
                finally:server.shutdown();server.server_close();thread.join()
            self.assertFalse((root/'traces').exists())

    def test_broker_captures_exact_jev_bodies_without_auth_headers(self):
        for provider in ('vercel', 'typesafe'):
            with tempfile.TemporaryDirectory() as temporary:
                root=Path(temporary);config=root/'gateway.json';config.write_text(json.dumps({'key':'REAL_KEY_SENTINEL','token':'BROKER_TOKEN_SENTINEL','allow_jev':True,'agent_engine':'codex','jev_provider':provider,'jev_key':'REAL_KEY_SENTINEL'}))
                request_body=b'{"model":"typesafe-ai/jev","state":{"source":"public fixture"},"questions":{"q":{"type":"noul","instructions":"matches?"}}}';response_body=b'{"answers":{},"usage":{"input_tokens":11,"output_tokens":3},"provider_metadata":{"gateway":{"cost":"0.04","generationId":"gen_fixture"}}}'
                if provider == 'typesafe':request_body=request_body.replace(b'typesafe-ai/jev',b'jev-1.13.0')
                path='/v1/systemone' if provider == 'typesafe' else '/typesafe/v1/systemone'
                origin='https://api.typesafe.ai' if provider == 'typesafe' else 'https://ai-gateway.vercel.sh'
                forwarded={}
                class Upstream(http.server.BaseHTTPRequestHandler):
                    def log_message(self,*args):pass
                    def do_POST(self):
                        forwarded.update(path=self.path,body=self.rfile.read(int(self.headers['Content-Length'])),headers=dict(self.headers))
                        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(response_body)
                upstream=http.server.ThreadingHTTPServer(('127.0.0.1',0),Upstream)
                upstream_thread=threading.Thread(target=upstream.serve_forever,daemon=True);upstream_thread.start()
                self.addCleanup(upstream_thread.join);self.addCleanup(upstream.server_close);self.addCleanup(upstream.shutdown)
                with patch.object(broker,'CONFIG_PATH',str(config)),patch.object(broker,'TRACE_DIR',str(root/'traces')),patch.object(broker,'TYPESAFE_ORIGIN' if provider == 'typesafe' else 'GATEWAY_ORIGIN','http://127.0.0.1:'+str(upstream.server_port)),contextlib.redirect_stdout(io.StringIO()):
                    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),broker.Gateway)
                    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
                    try:
                        client=http.client.HTTPConnection('127.0.0.1',server.server_port)
                        client.request('POST',path,request_body,{'Authorization':'Bearer BROKER_TOKEN_SENTINEL','x-jevgrep-original-url':origin+path})
                        response=client.getresponse();self.assertEqual(response.status,200);self.assertEqual(response.read(),response_body);client.close()
                    finally:server.shutdown();server.server_close();thread.join()
                self.assertEqual(forwarded['path'],path)
                self.assertEqual(forwarded['body'],request_body)
                self.assertEqual(forwarded['headers']['Authorization'],'Bearer REAL_KEY_SENTINEL')
                self.assertNotIn('X-Jevgrep-Original-Url',forwarded['headers'])
                requests=list((root/'traces').glob('*.request.json'));responses=list((root/'traces').glob('*.response.json'))
                self.assertEqual(requests[0].read_bytes(),request_body);self.assertEqual(responses[0].read_bytes(),response_body)
                for file in requests+responses:
                    self.assertEqual(file.stat().st_mode&0o777,0o600)
                    self.assertNotIn(b'REAL_KEY_SENTINEL',file.read_bytes());self.assertNotIn(b'BROKER_TOKEN_SENTINEL',file.read_bytes())

if __name__=='__main__':unittest.main()
