import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// This suite intentionally cannot fall back to a checkout-local executable.
const binary = process.env.JEVGREP_INSTALLED_BINARY;
const packageDirectory = process.env.JEVGREP_INSTALLED_PACKAGE;
const expectedSkill = process.env.JEVGREP_EXPECTED_SKILL;
assert.ok(
  binary && packageDirectory && expectedSkill,
  "Run scripts/test-installed.sh in the Node-only container",
);
// These independent expectations pin the public routes of the installed artifact.
const providers = {
  vercel: {
    label: "Vercel AI Gateway",
    url: "https://ai-gateway.vercel.sh/typesafe/v1/systemone",
    model: "typesafe-ai/jev",
  },
  typesafe: { label: "TypeSafe", url: "https://api.typesafe.ai/v1/systemone", model: "jev-1.13.0" },
  openrouter: {
    label: "OpenRouter",
    url: "https://openrouter.ai/api/v1/systemone",
    model: "jev-1.13",
  },
  opencode: {
    label: "OpenCode Zen",
    url: "https://opencode.ai/zen/v1/systemone",
    model: "jev-1.13",
  },
};
const fixtureKey = "installed-http-fixture-key";
const forbidden = "INSTALLED_FIXTURE_IGNORED_CONTENT_MUST_NEVER_UPLOAD";
const query = "Find event recording implementations across the nested packages.";
const branches = [
  ["alpha", "first.py", "CollectorAlpha"],
  ["beta", "second.py", "CollectorBeta"],
  ["gamma", "third.py", "CollectorGamma"],
];
const source = (branch, name) =>
  `# Synthetic installed-package fixture\nclass ${name}:\n    """Records an event in the ${branch} package."""\n    @staticmethod\n    def record_event(value):\n        return "py-evidence-${branch}:" + value\n\n    def unrelated():\n        return "unrelated"\n`;

async function context(t, mode = "healthy", executable = binary) {
  let expectedQuery = query;
  let expectedProvider = "vercel";
  let expectedKey = fixtureKey;
  const secrets = new Set([fixtureKey]);
  const scratch = await mkdtemp(join(tmpdir(), "jg-installed-"));
  const tree = join(scratch, "repository");
  const home = join(scratch, "home");
  const config = join(scratch, "config");
  const cache = join(scratch, "cache");
  const children = new Set();
  const signalChild = (child, signal) => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const requests = [];
  const protocolErrors = [];
  let malformedResponses = 0;
  let server;
  t.after(async () => {
    for (const child of children) signalChild(child, "SIGKILL");
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await rm(scratch, { recursive: true, force: true });
    assert.deepEqual(
      protocolErrors,
      [],
      "The installed SDK must satisfy the HTTP fixture contract",
    );
  });
  await Promise.all([tree, home, config, cache].map((path) => mkdir(path, { recursive: true })));
  for (const [branch, file, name] of branches) {
    const directory = join(tree, branch, "nested");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, file), source(branch, name));
  }
  await mkdir(join(tree, "ignored"));
  await writeFile(join(tree, ".ignore"), "ignored/\n*.skip.py\n");
  await writeFile(join(tree, "ignored", "should-not-upload.py"), `value = "${forbidden}"\n`);
  await writeFile(join(tree, "hidden.skip.py"), `value = "${forbidden}"\n`);
  await writeFile(join(tree, ".env"), `PRIVATE_VALUE=${forbidden}\n`);
  await writeFile(join(tree, "unrelated.md"), "This is an unrelated gardening document.\n");
  const credentialDirectory = join(config, "jevgrep");
  const credentials = join(credentialDirectory, "credentials.json");
  await mkdir(credentialDirectory, { mode: 0o700 });
  await writeFile(credentials, JSON.stringify({ provider: "vercel", apiKey: fixtureKey }) + "\n", {
    mode: 0o600,
  });
  server = createServer((request, response) => {
    void (async () => {
      assert.equal(request.method, "POST");
      const preset = providers[expectedProvider];
      assert.equal(request.url, new URL(preset.url).pathname);
      assert.equal(request.headers["x-jevgrep-original-url"], preset.url);
      assert.ok(
        request.headers.authorization === `Bearer ${expectedKey}`,
        "Saved key must authenticate the request",
      );
      assert.match(request.headers["content-type"] ?? "", /^application\/json/);
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        assert.ok(bytes <= 1_000_000, "The synthetic fixture must use bounded requests");
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      assert.ok(!raw.includes(forbidden), "Ignored/hidden source reached the provider");
      const body = JSON.parse(raw);
      assert.deepEqual(Object.keys(body).sort(), ["model", "questions", "state"]);
      assert.equal(body.model, preset.model);
      assert.equal(
        typeof body.state,
        "object",
        "state must remain native JSON, not a serialized string",
      );
      assert.ok(body.state !== null && !Array.isArray(body.state));
      assert.ok(Object.keys(body.questions).length > 0);
      for (const question of Object.values(body.questions)) {
        assert.equal(question.type, "noul");
        assert.ok(typeof question.instructions === "string" && question.instructions.length > 0);
      }
      assert.ok(requests.length < 256, "Synthetic search stopped making bounded forward progress");
      requests.push({ body, raw, provider: expectedProvider, receivedAt: performance.now() });
      if (typeof mode === "function" && (await mode({ body, raw, tree, response }))) return;
      if (mode === "rate-limit" && requests.length === 1) {
        response.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
        response.end(JSON.stringify({ error: "fixture rate limit" }));
        return;
      }
      if (mode === "disconnect" && requests.length === 1) {
        response.destroy();
        return;
      }
      if (mode === "invalid-json") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{broken");
        return;
      }
      if (mode === "stalled") return;
      if (mode === "interrupt") {
        for (const child of children) signalChild(child, "SIGINT");
        return;
      }
      if (mode === "transient" && requests.length === 1) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "temporary fixture failure" }));
        return;
      }
      if (mode === "unauthorized") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "fixture credential rejected" }));
        return;
      }
      let probabilities;
      if (Array.isArray(body.state.items)) {
        assert.equal(body.state.query, expectedQuery);
        probabilities = body.state.items.map((item) =>
          mode === "negative"
            ? 0.05
            : item.kind === "directory" || item.path.endsWith(".py")
              ? 0.95
              : 0.05,
        );
      } else if (Array.isArray(body.state.declarations)) {
        assert.equal(typeof body.state.source, "string");
        if (mode === "partial" && body.state.path === "beta/nested/second.py") {
          malformedResponses++;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ answers: {} }));
          return;
        }
        probabilities = body.state.declarations.map((declaration) => {
          assert.ok(Number.isInteger(declaration.startLine) && declaration.startLine >= 1);
          assert.ok(declaration.endLine >= declaration.startLine);
          return declaration.name.endsWith(".record_event") ? 0.95 : 0.05;
        });
      } else if (Object.hasOwn(body.questions, "implementation")) {
        probabilities = Object.keys(body.questions).map((name) =>
          name === "implementation" ? 0.95 : 0.05,
        );
      } else if (
        Object.keys(body.questions).join() === "relevant" &&
        typeof body.state.source === "string"
      ) {
        probabilities = [0.95];
      } else {
        assert.fail(`Unknown request stage: ${Object.keys(body.state).join(",")}`);
      }
      const ids = Object.keys(body.questions);
      assert.equal(probabilities.length, ids.length);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          answers: Object.fromEntries(
            ids.map((id, index) => [id, { type: "noul", noul: probabilities[index] }]),
          ),
          usage: { input_tokens: 1, output_tokens: 1 },
          warnings: [{ type: "other", message: "installed-fixture-warning" }],
        }),
      );
    })().catch((error) => {
      protocolErrors.push(error.message);
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Installed fixture contract rejected the request" }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const env = {
    PATH: process.env.JEVGREP_TEST_PATH ?? "/opt/jevgrep/bin:/usr/local/bin:/usr/bin:/bin",
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_CACHE_HOME: cache,
    TMPDIR: scratch,
    NODE_OPTIONS: `--import=${process.env.JEVGREP_TEST_PROVIDER_PRELOAD ?? new URL("./fixtures/provider-route.mjs", import.meta.url).href}`,
    JEVGREP_TEST_PROVIDER_ORIGIN: `http://127.0.0.1:${server.address().port}`,
  };
  const run = async (args, overrides = {}, head = false, input) => {
    if (input?.trim()) secrets.add(input.trim());
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        head ? "bash" : executable === binary ? binary : process.execPath,
        head
          ? ["-o", "pipefail", "-c", '"$@" | head -200', "jg-pipe", executable, ...args]
          : executable === binary
            ? args
            : [executable, ...args],
        {
          cwd: tree,
          detached: true,
          env: { ...env, ...overrides },
          stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        },
      );
      children.add(child);
      if (input !== undefined) {
        child.stdin.on("error", (error) => {
          if (error.code !== "EPIPE") reject(error);
        });
        child.stdin.end(input);
      }
      const stdout = [],
        stderr = [];
      let outputBytes = 0;
      const timer = setTimeout(
        () => signalChild(child, "SIGKILL"),
        mode === "stalled" ? 120_000 : 45_000,
      );
      for (const [stream, chunks] of [
        [child.stdout, stdout],
        [child.stderr, stderr],
      ])
        stream.on("data", (chunk) => {
          outputBytes += chunk.length;
          if (outputBytes > 2_000_000) signalChild(child, "SIGKILL");
          else chunks.push(chunk);
        });
      child.once("error", (error) => {
        clearTimeout(timer);
        children.delete(child);
        reject(error);
      });
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        children.delete(child);
        resolve({
          code,
          signal,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
      });
    });
    assert.equal(result.signal, null, "Installed command timed out or exceeded its output bound");
    assert.equal(
      result.stderr,
      "",
      "All application output, including SDK warnings, belongs on stdout",
    );
    for (const secret of secrets)
      assert.ok(!result.stdout.includes(secret), "Credential leaked in stdout");
    assert.ok(!result.stdout.includes("installed-fixture-warning"));
    assert.ok(!result.stdout.includes(forbidden));
    return result;
  };
  return {
    run,
    tree,
    credentials,
    config,
    credentialDirectory,
    requests,
    expectProvider(provider, key = fixtureKey) {
      expectedProvider = provider;
      expectedKey = key;
      secrets.add(key);
    },
    async removeCredentials() {
      await rm(credentials, { force: true });
    },
    set query(value) {
      expectedQuery = value;
    },
    set mode(value) {
      mode = value;
    },
    get malformedResponses() {
      return malformedResponses;
    },
  };
}

function complete(result) {
  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /^Jevgrep: \d+ relevant files\.\n/);
  assert.match(result.stdout, /^Jevgrep: 3 relevant files\.\n/);
  for (const [branch, file] of branches) {
    assert.ok(
      result.stdout.includes(`"${branch}/nested/${file}"`),
      `Missing ${branch} file location`,
    );
    assert.ok(
      result.stdout.includes(`py-evidence-${branch}:`),
      `Missing ${branch} implementation source`,
    );
  }
}

function assertCachedRequestsAreReused(requests, before) {
  const previous = requests.slice(0, before);
  const seen = new Set(previous.map(({ raw }) => raw));
  const withoutEvidence = ({ state, ...rest }) =>
    JSON.stringify({ ...rest, state: { ...state, selectedEvidence: undefined } });
  for (const { raw, body } of requests.slice(before)) {
    assert.ok(!seen.has(raw), "An identical successful native request bypassed the cache");
    seen.add(raw);
    // Completion order is part of the frozen input; warm reads can create a genuinely new order.
    assert.ok(Array.isArray(body.state.selectedEvidence));
    const evidenceContents = (value) =>
      JSON.stringify(value.state.selectedEvidence.map((item) => JSON.stringify(item)).sort());
    assert.ok(
      previous.some(
        ({ body: value }) =>
          withoutEvidence(value) === withoutEvidence(body) &&
          Array.isArray(value.state.selectedEvidence) &&
          evidenceContents(value) === evidenceContents(body),
      ),
      "Warm retrieval changed more than the selected-evidence order",
    );
  }
}

function assertCachedRequestIsResent(requests, before) {
  const previous = new Set(requests.slice(0, before).map(({ raw }) => raw));
  assert.ok(
    requests.slice(before).some(({ raw }) => previous.has(raw)),
    "Bypassing or clearing cache must resend a previously cached exact request",
  );
}

test("installed runtime has no checkout or Python/Bun/compiler prerequisites", async () => {
  for (const executable of ["python3", "bun", "cc", "gcc", "clang", "make"]) {
    const result = spawnSync(executable, ["--version"], { encoding: "utf8" });
    assert.equal(result.error?.code, "ENOENT", `${executable} must be absent from final runtime`);
  }
  await assert.rejects(access("/checkout"), { code: "ENOENT" });
  assert.ok((await realpath(binary)).startsWith(`${packageDirectory}/`));
});

test("installed local commands match the package without credentials", async (t) => {
  const fixture = await context(t);
  const metadata = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
  assert.equal(metadata.name, "@dzhng/jevgrep");
  t.diagnostic(
    `Runtime ${process.version} ${process.platform}/${process.arch}; installed ${metadata.name}@${metadata.version}`,
  );
  await fixture.removeCredentials();
  const noCredentials = {};
  const help = await fixture.run(["--help"], noCredentials);
  assert.equal(help.code, 0, help.stdout);
  assert.match(help.stdout, /Usage: jg /);
  const version = await fixture.run(["--version"], noCredentials);
  assert.equal(version.code, 0, version.stdout);
  assert.equal(version.stdout, `${metadata.version}\n`);
  assert.equal(
    await readFile(join(packageDirectory, "dist/skills/jevgrep/SKILL.md"), "utf8"),
    await readFile(expectedSkill, "utf8"),
  );
  assert.equal(fixture.requests.length, 0, "Local commands must not contact a provider");
});

test("skill command delegates installation to npx without credentials", async (t) => {
  const fixture = await context(t);
  await fixture.removeCredentials();
  const bin = join(fixture.tree, "installer-bin");
  await mkdir(bin);
  await symlink(process.execPath, join(bin, "node"));
  const npx = join(bin, "npx");
  await symlink(new URL("./fixtures/skill-installer.mjs", import.meta.url), npx);
  const result = await fixture.run(
    ["skill", "--agent", "codex", "--agent", "claude-code", "--global", "--yes"],
    { PATH: bin },
  );
  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /Installer completed/);
  assert.deepEqual(JSON.parse(await readFile(join(fixture.tree, "installed-skill.json"), "utf8")), [
    "--yes",
    "skills",
    "add",
    "dzhng/jevgrep",
    "--skill",
    "jevgrep",
    "--agent",
    "codex",
    "--agent",
    "claude-code",
    "--global",
    "--yes",
  ]);
  assert.equal(fixture.requests.length, 0);
  const failed = await fixture.run(["skill"], {
    PATH: bin,
    JEVGREP_INSTALLER_EXIT: "7",
  });
  assert.equal(failed.code, 7, failed.stdout);
  assert.deepEqual(JSON.parse(await readFile(join(fixture.tree, "installed-skill.json"), "utf8")), [
    "--yes",
    "skills",
    "add",
    "dzhng/jevgrep",
    "--skill",
    "jevgrep",
  ]);
  await rm(npx);
  const unavailable = await fixture.run(["skill"], { PATH: bin });
  assert.equal(unavailable.code, 1);
  assert.match(unavailable.stdout, /requires npx/);
});

test("actual installed search parses Python and returns every relevant hierarchy branch", async (t) => {
  const fixture = await context(t);
  const result = await fixture.run([query, fixture.tree, "--no-cache"]);
  complete(result);
  const items = fixture.requests.flatMap(({ body }) => body.state.items ?? []);
  assert.ok(
    items.some((item) => item.kind === "directory"),
    "The test must cross a classified directory frontier",
  );
  const declarations = fixture.requests.flatMap(({ body }) => body.state.declarations ?? []);
  for (const [, , name] of branches)
    assert.ok(
      declarations.some(
        (d) => d.name === `${name}.record_event` && d.startLine === 4 && d.endLine === 6,
      ),
      "Packaged Python parser must produce decorated method coordinates",
    );
  t.diagnostic(
    `Parsed Python methods: ${JSON.stringify(declarations.filter((declaration) => declaration.name.endsWith(".record_event")))}`,
  );
  assert.ok(!result.stdout.includes("unrelated.md"));
  const before = fixture.requests.length;
  complete(await fixture.run([query, fixture.tree]));
  assert.ok(
    fixture.requests.length > before,
    "A preceding --no-cache search must not populate reusable answers",
  );
});

test("healthy negative evaluations produce a complete empty result", async (t) => {
  const fixture = await context(t, "negative");
  const result = await fixture.run([query, fixture.tree, "--no-cache"]);
  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /^Jevgrep: \d+ relevant files\.\n/);
  assert.match(result.stdout, /^Jevgrep: 0 relevant files\.\n/);
  assert.ok(fixture.requests.length > 0);
});

test("malformed provider answers preserve useful source and return incomplete exit 2", async (t) => {
  const fixture = await context(t, "partial");
  const result = await fixture.run([query, fixture.tree, "--no-cache"]);
  assert.ok(
    fixture.malformedResponses > 0,
    "The installed SDK must actually receive malformed answers",
  );
  assert.equal(result.code, 2, result.stdout);
  assert.match(result.stdout, /^Jevgrep: \d+ relevant files; discovery incomplete\.\n/);
  assert.ok(result.stdout.includes("py-evidence-alpha:"));
  assert.ok(result.stdout.includes("py-evidence-gamma:"));
  assert.match(result.stdout, /^Issue: /m);
});

test("warm cache reuses identical requests, no-cache bypasses reuse, and edits invalidate answers", async (t) => {
  const fixture = await context(t);
  const first = await fixture.run([query, fixture.tree]);
  complete(first);
  assert.ok(fixture.requests.length > 0);
  let before = fixture.requests.length;
  const warm = await fixture.run([query, fixture.tree]);
  complete(warm);
  assert.equal(warm.stdout, first.stdout);
  assertCachedRequestsAreReused(fixture.requests, before);
  t.diagnostic(
    `Cold HTTP requests: ${before}; novel warm evidence orders: ${fixture.requests.length - before}; identical requests reused and stdout identical.`,
  );
  const beforeBypass = fixture.requests.length;
  complete(await fixture.run([query, fixture.tree, "--no-cache"]));
  assertCachedRequestIsResent(fixture.requests, beforeBypass);
  const edited = join(fixture.tree, "alpha/nested/first.py");
  await writeFile(
    edited,
    source("alpha", "CollectorAlpha").replace("py-evidence-alpha:", "edited-alpha-evidence:"),
  );
  before = fixture.requests.length;
  const changed = await fixture.run([query, fixture.tree]);
  assert.equal(changed.code, 0, changed.stdout);
  assert.ok(changed.stdout.includes("edited-alpha-evidence:"));
  assert.ok(!changed.stdout.includes("py-evidence-alpha:"));
  assert.ok(
    fixture.requests.slice(before).some(({ raw }) => raw.includes("edited-alpha-evidence:")),
    "Changed source must reach the provider instead of stale cache evidence",
  );
  before = fixture.requests.length;
  assert.equal((await fixture.run([query, fixture.tree])).stdout, changed.stdout);
  assertCachedRequestsAreReused(fixture.requests, before);
  const saved = await readFile(fixture.credentials);
  await fixture.removeCredentials();
  const cleared = await fixture.run(["cache", "clear"]);
  await writeFile(fixture.credentials, saved, { mode: 0o600 });
  assert.equal(cleared.code, 0, cleared.stdout);
  before = fixture.requests.length;
  assert.equal((await fixture.run([query, fixture.tree])).code, 0);
  assertCachedRequestIsResent(fixture.requests, before);
});

test("doctor uses the installed SDK while missing credentials fail cleanly", async (t) => {
  const fixture = await context(t);
  const doctor = await fixture.run(["doctor"]);
  assert.equal(doctor.code, 0, doctor.stdout);
  assert.ok(fixture.requests.length > 0);
  const before = fixture.requests.length;
  await fixture.removeCredentials();
  const missing = await fixture.run([query, fixture.tree]);
  assert.equal(missing.code, 1, missing.stdout);
  assert.ok(missing.stdout.trim().length > 0);
  assert.equal(fixture.requests.length, before);
});

test("provider authentication failure stops immediately with fatal exit 1", async (t) => {
  const fixture = await context(t, "unauthorized");
  const result = await fixture.run([query]);
  assert.equal(result.code, 1);
  assert.equal(fixture.requests.length, 1);
  assert.ok(!/^Jevgrep: \d+ relevant files\.\n/.test(result.stdout));
  assert.ok(!result.stdout.includes("py-evidence-"));
});

test("a transient navigation failure splits the batch and recovers installed retrieval", async (t) => {
  const fixture = await context(t, "transient");
  const result = await fixture.run([query]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Jevgrep: \d+ relevant files\.\n/);
  const original = fixture.requests[0].body.state.items;
  assert.ok(original.length > 1);
  const recovered = fixture.requests.slice(1, 3).flatMap(({ body }) => body.state.items);
  const withoutIds = (items) => items.map(({ id, ...item }) => JSON.stringify(item)).sort();
  assert.deepEqual(withoutIds(recovered), withoutIds(original));
  for (const [branch] of branches) assert.ok(result.stdout.includes(`py-evidence-${branch}:`));
});

test("interrupting an in-flight installed search exits 130 and stops requests", async (t) => {
  const fixture = await context(t, "interrupt");
  const result = await fixture.run([query]);
  assert.equal(result.code, 130);
  assert.match(result.stdout, /Interrupted\./);
  assert.equal(fixture.requests.length, 1);
});

test("invalid navigation JSON remains incomplete without retrying or splitting", async (t) => {
  const fixture = await context(t, "invalid-json");
  const result = await fixture.run([query]);
  assert.equal(result.code, 2);
  assert.match(result.stdout, /^Jevgrep: \d+ relevant files; discovery incomplete\.\n/);
  const attempts = new Map();
  for (const { raw } of fixture.requests) attempts.set(raw, (attempts.get(raw) ?? 0) + 1);
  assert.ok(attempts.size > 0);
  for (const count of attempts.values()) assert.equal(count, 1);
  assert.ok(!result.stdout.includes("py-evidence-"));
});

test("a disconnected navigation request recovers through reference-compatible splitting", async (t) => {
  const fixture = await context(t, "disconnect");
  const result = await fixture.run([query]);
  complete(result);
  const original = fixture.requests[0].body.state.items;
  assert.ok(original.length > 1);
  const recovered = fixture.requests.slice(1, 3).flatMap(({ body }) => body.state.items);
  const withoutIds = (items) => items.map(({ id, ...item }) => JSON.stringify(item)).sort();
  assert.deepEqual(withoutIds(recovered), withoutIds(original));
});

test("failed provider answers are retried after recovery rather than reused from cache", async (t) => {
  const fixture = await context(t, "invalid-json");
  assert.equal((await fixture.run([query])).code, 2);
  const failedRequests = fixture.requests.length;
  fixture.mode = "healthy";
  const recovered = await fixture.run([query]);
  assert.equal(recovered.code, 0);
  assert.ok(fixture.requests.length > failedRequests);
  for (const [branch] of branches) assert.ok(recovered.stdout.includes(`py-evidence-${branch}:`));
});

test("cache observes additions, deletions, ignore changes, and same-size edits with restored mtime", async (t) => {
  const fixture = await context(t);
  complete(await fixture.run([query]));
  const added = "delta/nested/fourth.py";
  await mkdir(join(fixture.tree, "delta/nested"), { recursive: true });
  await writeFile(join(fixture.tree, added), source("delta", "CollectorDelta"));
  let before = fixture.requests.length;
  const addition = await fixture.run([query]);
  assert.equal(addition.code, 0);
  assert.ok(addition.stdout.includes("py-evidence-delta:"));
  assert.ok(fixture.requests.slice(before).some(({ raw }) => raw.includes("py-evidence-delta:")));

  await rm(join(fixture.tree, "alpha/nested/first.py"));
  const deletion = await fixture.run([query]);
  assert.equal(deletion.code, 0);
  assert.ok(!deletion.stdout.includes("alpha/nested/first.py"));
  assert.ok(!deletion.stdout.includes("py-evidence-alpha:"));

  await writeFile(join(fixture.tree, ".ignore"), "ignored/\n*.skip.py\nbeta/\n");
  before = fixture.requests.length;
  const ignored = await fixture.run([query]);
  assert.equal(ignored.code, 0);
  assert.ok(!ignored.stdout.includes("py-evidence-beta:"));
  assert.ok(!fixture.requests.slice(before).some(({ raw }) => raw.includes("py-evidence-beta:")));

  const path = join(fixture.tree, "gamma/nested/third.py");
  const original = await stat(path);
  await writeFile(
    path,
    source("gamma", "CollectorGamma").replace("py-evidence-gamma:", "py-evidence-GAMMA:"),
  );
  await utimes(path, original.atime, original.mtime);
  before = fixture.requests.length;
  const edited = await fixture.run([query]);
  assert.equal(edited.code, 0);
  assert.ok(edited.stdout.includes("py-evidence-GAMMA:"));
  assert.ok(!edited.stdout.includes("py-evidence-gamma:"));
  assert.ok(fixture.requests.slice(before).some(({ raw }) => raw.includes("py-evidence-GAMMA:")));
});

test("filesystem policy survives wide and deep installed traversal with excluded sentinels", async (t) => {
  const fixture = await context(t);
  const wide = join(fixture.tree, "wide");
  await mkdir(wide);
  for (let index = 0; index < 129; index++) {
    await writeFile(join(wide, `${index}.skip.py`), forbidden);
  }
  const relative = ["wide", ...Array.from({ length: 12 }, (_, i) => `d${i}`), "odd\nname.py"].join(
    "/",
  );
  const parent = join(fixture.tree, relative.slice(0, relative.lastIndexOf("/")));
  await mkdir(parent, { recursive: true });
  await writeFile(join(fixture.tree, relative), source("wide", "CollectorWide"));
  await writeFile(join(wide, ".hidden.py"), forbidden);
  await writeFile(join(wide, "binary.py"), Buffer.from(`\0${forbidden}`));
  await writeFile(join(wide, "key.txt"), `-----BEGIN PRIVATE KEY-----\n${forbidden}`);
  const outside = join(fixture.tree, "..", "outside.py");
  await writeFile(outside, forbidden);
  await symlink(outside, join(wide, "escape.py"));
  await symlink(wide, join(wide, "cycle"));
  assert.equal(spawnSync("mkfifo", [join(wide, "pipe")]).status, 0);
  await writeFile(join(wide, "unreadable.py"), forbidden);
  await chmod(join(wide, "unreadable.py"), 0);

  const nested = join(fixture.tree, "nested-repo");
  await mkdir(nested);
  await writeFile(join(fixture.tree, ".gitignore"), "nested-repo/*.py\n");
  await writeFile(join(nested, ".git"), "gitdir: elsewhere\n");
  await writeFile(join(nested, ".gitignore"), "blocked_local.py\n");
  await writeFile(
    join(fixture.tree, ".ignore"),
    "ignored/\n*.skip.py\nnested-repo/blocked_parent.py\n",
  );
  await writeFile(join(nested, "allowed.py"), source("nested", "CollectorNested"));
  await writeFile(join(nested, "blocked_local.py"), forbidden);
  await writeFile(join(nested, "blocked_parent.py"), forbidden);

  const result = await fixture.run([query]);
  assert.equal(result.code, 2);
  assert.match(result.stdout, /Issue: "unreadable"/);
  assert.ok(result.stdout.includes("py-evidence-nested:"));
  assert.ok(result.stdout.includes(JSON.stringify(relative)));
  assert.ok(result.stdout.includes("py-evidence-wide:"));
  for (const [branch] of branches) assert.ok(result.stdout.includes(`py-evidence-${branch}:`));
  assert.ok(fixture.requests.some(({ raw }) => raw.includes("py-evidence-wide:")));
});

test("a changed query cannot reuse another query's cached evaluations", async (t) => {
  const fixture = await context(t);
  complete(await fixture.run([query]));
  const before = fixture.requests.length;
  const changedQuery = "Find recording methods and their event return values.";
  fixture.query = changedQuery;
  complete(await fixture.run([changedQuery]));
  assert.ok(fixture.requests.length > before);
  assert.ok(fixture.requests.slice(before).every(({ body }) => body.state.query === changedQuery));
});

test(
  "a stalled provider response exhausts bounded installed timeouts",
  { timeout: 130_000 },
  async (t) => {
    const fixture = await context(t, "stalled");
    await rm(fixture.tree, { recursive: true });
    await mkdir(fixture.tree);
    await writeFile(join(fixture.tree, "only.py"), source("only", "CollectorOnly"));
    const result = await fixture.run([query]);
    assert.equal(result.code, 2);
    assert.match(result.stdout, /^Jevgrep: \d+ relevant files; discovery incomplete\.\n/);
    assert.equal(fixture.requests.length, 2);
  },
);

test("a head -200 consumer closes the stdout pipe without leaving jg running", async (t) => {
  const fixture = await context(t);
  await rm(fixture.tree, { recursive: true });
  await mkdir(fixture.tree);
  const large = Array.from(
    { length: 500 },
    (_, i) =>
      `class Collector${i}${"A".repeat(96)}:\n    def record_event(self):\n        return "py-evidence-pipe"\n`,
  ).join("\n");
  await writeFile(join(fixture.tree, "only.py"), large);
  const result = await fixture.run([query], {}, true);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^Jevgrep: \d+ relevant files\.\n/);
  assert.equal(result.stdout.trimEnd().split("\n").length, 200);
  assert.ok(!result.stdout.includes("End context."));
});

test("a rate-limited provider retry waits and recovers the installed evidence", async (t) => {
  const fixture = await context(t, "rate-limit");
  const result = await fixture.run([query]);
  complete(result);
  assert.deepEqual(fixture.requests[0].body, fixture.requests[1].body);
  assert.ok(fixture.requests[1].receivedAt - fixture.requests[0].receivedAt >= 950);
  assert.equal(fixture.requests.filter(({ raw }) => raw === fixture.requests[0].raw).length, 2);
});

test("source budget preserves every file and lead while explicitly omitting source", async (t) => {
  const fixture = await context(t);
  const unlimited = await fixture.run([query, "--max-source-bytes", "0"]);
  complete(unlimited);
  const before = fixture.requests.length;
  const bounded = await fixture.run([query, "--max-source-bytes", "1"]);
  assert.equal(bounded.code, 0);
  assert.match(bounded.stdout, /Source omitted: [1-9]/);
  assert.ok(!bounded.stdout.includes("py-evidence-"));
  const locations = (stdout) =>
    stdout.split("\n").flatMap((line) => {
      const file = /^- ("(?:[^"\\]|\\.)*") —/.exec(line);
      if (file) return [file[1]];
      return line.startsWith("  Reading lead ") ? [line] : [];
    });
  const expectedLocations = locations(unlimited.stdout);
  assert.equal(expectedLocations.filter((line) => line.startsWith('"')).length, branches.length);
  assert.ok(expectedLocations.some((line) => line.startsWith("  Reading lead ")));
  assert.deepEqual(locations(bounded.stdout), expectedLocations);
  assertCachedRequestsAreReused(fixture.requests, before);
});

test("missing or corrupt packaged Python assets fail closed without downloads", async (t) => {
  const scratch = await mkdtemp(join(tmpdir(), "jg-missing-python-"));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  for (const [asset, corrupt] of [
    ["dist/bin/python-worker.mjs", false],
    ["dist/assets/python/inspect.py", false],
    ["node_modules/pyodide/pyodide.asm.wasm", false],
    ["node_modules/pyodide/python_stdlib.zip", false],
    ["node_modules/pyodide/pyodide.asm.wasm", true],
  ]) {
    const copy = join(scratch, "package");
    await cp(packageDirectory, copy, { recursive: true, dereference: true });
    await access(join(copy, asset));
    if (corrupt) await writeFile(join(copy, asset), "corrupt runtime fixture");
    else await rm(join(copy, asset));
    const fixture = await context(t, "healthy", join(copy, "dist/bin/index.js"));
    const result = await fixture.run([query, fixture.tree, "--no-cache"]);
    assert.equal(result.code, 1, `${asset} (corrupt=${corrupt}): ${result.stdout}`);
    assert.ok(result.stdout.trim(), "Asset failure must produce a diagnostic");
    assert.ok(
      !fixture.requests.some(({ body }) => body.state.declarations),
      "Unavailable parser assets must not fabricate declaration evidence",
    );
    await fixture.removeCredentials();
    assert.equal((await fixture.run(["--help"])).code, 0);
    await rm(copy, { recursive: true, force: true });
  }
});

for (const mutation of ["changed", "ignored"])
  test(`installed final freshness discards ${mutation} source after role evaluation`, async (t) => {
    let sawRole = false;
    const fixture = await context(t, async ({ body, tree, response }) => {
      if (body.questions.implementation) {
        sawRole = true;
        await writeFile(
          join(tree, mutation === "ignored" ? ".ignore" : "a.ts"),
          mutation === "ignored" ? "a.ts\n" : "export function replacement() { return 2; }\n",
        );
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          answers: Object.fromEntries(
            Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.9 }]),
          ),
        }),
      );
      return true;
    });
    await rm(fixture.tree, { recursive: true });
    await mkdir(fixture.tree);
    await writeFile(
      join(fixture.tree, "a.ts"),
      'export function selected() { return "FINAL_STALE_SENTINEL"; }\n',
    );
    const result = await fixture.run([query, fixture.tree, "--no-cache"]);
    assert.ok(sawRole);
    assert.equal(result.code, 2, result.stdout);
    assert.match(result.stdout, /incomplete/);
    assert.match(result.stdout, /a\.ts/);
    assert.ok(!result.stdout.includes("FINAL_STALE_SENTINEL"));
    assert.ok(!result.stdout.includes('Source block "a.ts"'));
  });

test("installed queued freshness withholds excluded source uploads", async (t) => {
  let uploads = 0;
  const releases = [];
  const fixture = await context(t, async ({ body, raw, tree, response }) => {
    if (raw.includes("QUEUED_INSTALLED_SENTINEL")) {
      uploads++;
      if (uploads <= 8)
        await new Promise((resolve) => {
          releases.push(resolve);
          if (releases.length === 8)
            void writeFile(join(tree, ".ignore"), "large.txt\n").then(() =>
              releases.forEach((release) => release()),
            );
        });
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        answers: Object.fromEntries(
          Object.keys(body.questions).map((id) => [id, { type: "noul", noul: 0.1 }]),
        ),
      }),
    );
    return true;
  });
  t.after(() => releases.forEach((release) => release()));
  await rm(fixture.tree, { recursive: true });
  await mkdir(fixture.tree);
  await writeFile(
    join(fixture.tree, "large.txt"),
    "QUEUED_INSTALLED_SENTINEL line\n".repeat(18000),
  );
  const result = await fixture.run([query, fixture.tree, "--no-cache"]);
  assert.equal(uploads, 8);
  assert.equal(result.code, 2, result.stdout);
  assert.match(result.stdout, /incomplete/);
  assert.ok(!result.stdout.includes("QUEUED_INSTALLED_SENTINEL"));
});

for (const [provider, preset] of Object.entries(providers))
  test(`installed saved-provider journey: ${provider} auth doctor search cache replacement`, async (t) => {
    const fixture = await context(t);
    await fixture.removeCredentials();
    const key = `installed-${provider}-saved-key`;
    fixture.expectProvider(provider, key);
    const auth = await fixture.run(
      ["auth", "--provider", provider, "--stdin"],
      {},
      false,
      key + "\n",
    );
    assert.equal(auth.code, 0, auth.stdout);
    assert.ok(auth.stdout.includes(preset.label));
    assert.match(auth.stdout, /doctor/);
    assert.equal(fixture.requests.length, 0, "Auth must not contact any provider");
    assert.deepEqual(JSON.parse(await readFile(fixture.credentials, "utf8")), {
      provider,
      apiKey: key,
    });
    assert.equal((await stat(fixture.credentials)).mode & 0o777, 0o600);
    assert.equal((await stat(fixture.credentialDirectory)).mode & 0o777, 0o700);
    const doctor = await fixture.run(["doctor"]);
    assert.equal(doctor.code, 0, doctor.stdout);
    assert.ok(doctor.stdout.includes(preset.label));
    assert.equal(fixture.requests.length, 1);
    assert.deepEqual(Object.keys(fixture.requests[0].body.questions), ["relevant"]);
    assert.ok(
      !fixture.requests[0].raw.includes("py-evidence-"),
      "Doctor must use only synthetic source",
    );
    const cold = await fixture.run([query]);
    complete(cold);
    const before = fixture.requests.length;
    const warm = await fixture.run([query]);
    complete(warm);
    assert.equal(warm.stdout, cold.stdout);
    assertCachedRequestsAreReused(fixture.requests, before);

    const replacement = provider === "vercel" ? "typesafe" : "vercel";
    const replacementKey = `installed-${replacement}-replacement-key`;
    const beforeAuth = fixture.requests.length;
    const replaced = await fixture.run(
      ["auth", "--provider", replacement, "--stdin"],
      {},
      false,
      replacementKey + "\n",
    );
    assert.equal(replaced.code, 0, replaced.stdout);
    assert.equal(fixture.requests.length, beforeAuth);
    assert.deepEqual(JSON.parse(await readFile(fixture.credentials, "utf8")), {
      provider: replacement,
      apiKey: replacementKey,
    });
    fixture.expectProvider(replacement, replacementKey);
    const search = await fixture.run([query]);
    complete(search);
    assert.equal(search.stdout, cold.stdout);
    assert.ok(
      fixture.requests.length > beforeAuth,
      "Provider replacement must not reuse another provider's cache",
    );
    assert.ok(
      fixture.requests.slice(beforeAuth).every((request) => request.provider === replacement),
    );
    fixture.mode = "unauthorized";
    const beforeFailure = fixture.requests.length;
    const failed = await fixture.run(["doctor"]);
    assert.equal(failed.code, 1, failed.stdout);
    assert.equal(
      fixture.requests.length,
      beforeFailure + 1,
      "Authentication failure must not retry or fall back",
    );
    assert.ok(failed.stdout.includes(providers[replacement].label));
    assert.equal(fixture.requests.at(-1).provider, replacement);
  });

test("installed legacy credentials use Vercel without rewriting saved bytes", async (t) => {
  const fixture = await context(t);
  const original = '  { "apiKey": "' + fixtureKey + '" }\n';
  await writeFile(fixture.credentials, original);
  const before = await stat(fixture.credentials);
  const doctor = await fixture.run(["doctor"]);
  assert.equal(doctor.code, 0, doctor.stdout);
  assert.ok(doctor.stdout.includes(providers.vercel.label));
  complete(await fixture.run([query]));
  assert.ok(fixture.requests.every((request) => request.provider === "vercel"));
  assert.equal(await readFile(fixture.credentials, "utf8"), original);
  const after = await stat(fixture.credentials);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(after.ino, before.ino);
});

test("installed saved credentials defeat conflicting environment and environment-only auth fails", async (t) => {
  const fixture = await context(t);
  const conflicts = {
    AI_GATEWAY_API_KEY: "environment-gateway-key",
    TYPESAFE_API_KEY: "environment-typesafe-key",
    TYPESAFE_AI_API_KEY: "environment-sdk-typesafe-key",
    OPENROUTER_API_KEY: "environment-openrouter-key",
    AI_GATEWAY_BASE_URL: "http://127.0.0.1:1/forbidden",
    TYPESAFE_BASE_URL: "http://127.0.0.1:1/forbidden",
    OPENROUTER_BASE_URL: "http://127.0.0.1:1/forbidden",
    AI_GATEWAY_MODEL: "environment-model",
    TYPESAFE_MODEL: "environment-model",
    OPENROUTER_MODEL: "environment-model",
  };
  for (const provider of Object.keys(providers)) {
    await writeFile(fixture.credentials, JSON.stringify({ provider, apiKey: fixtureKey }));
    fixture.expectProvider(provider);
    const doctor = await fixture.run(["doctor"], conflicts);
    assert.equal(doctor.code, 0, doctor.stdout);
    assert.ok(doctor.stdout.includes(providers[provider].label));
    complete(await fixture.run([query, "--no-cache"], conflicts));
  }
  await fixture.removeCredentials();
  const before = fixture.requests.length;
  for (const args of [["doctor"], [query]]) {
    const result = await fixture.run(args, conflicts);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stdout, /jg auth/);
    assert.ok(!result.stdout.includes("environment-"));
  }
  assert.equal(fixture.requests.length, before);
});

test("installed invalid saved providers fail before HTTP without rewriting credentials", async (t) => {
  const fixture = await context(t);
  for (const provider of [null, "", "unknown", false, 0, {}, []]) {
    const original = JSON.stringify({ provider, apiKey: fixtureKey }) + "\n";
    await writeFile(fixture.credentials, original);
    for (const args of [["doctor"], [query]]) {
      const result = await fixture.run(args);
      assert.equal(result.code, 1, result.stdout);
      assert.match(result.stdout, /auth/);
      assert.equal(await readFile(fixture.credentials, "utf8"), original);
    }
  }
  assert.equal(fixture.requests.length, 0);
});

test("installed invalid auth preserves saved bytes and leaves no temporary credentials", async (t) => {
  const fixture = await context(t);
  const original = await readFile(fixture.credentials, "utf8");
  for (const [args, input] of [
    [["auth", "--stdin"], "invalid-provider-key\n"],
    [["auth", "--provider", "typesafe"], undefined],
    [["auth", "--provider", "unknown", "--stdin"], "invalid-provider-key\n"],
    [["auth", "--provider", "vercel", "--stdin"], "\n"],
    [["auth", "--provider", "typesafe", "--stdin"], "key with spaces\n"],
    [["auth", "--provider", "openrouter", "--stdin"], "x".repeat(8193)],
    [["doctor", "--provider", "vercel"], undefined],
    [[query, "--provider", "typesafe"], undefined],
  ]) {
    const result = await fixture.run(args, {}, false, input);
    assert.equal(result.code, 1, result.stdout);
    assert.equal(await readFile(fixture.credentials, "utf8"), original);
    assert.deepEqual(await readdir(fixture.credentialDirectory), ["credentials.json"]);
  }
  assert.equal(fixture.requests.length, 0);
});
