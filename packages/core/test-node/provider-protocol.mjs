import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { experimental_evaluate as evaluate } from "ai";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { routeProviderFetch } from "../../../test/fixtures/provider-route.mjs";

const state = {
  query: "event recording",
  declarations: [{ id: "u0", source: "function record() {}" }],
};
const questions = {
  q1: { type: "boolean", instructions: "Does u0 record events?" },
  q0: { type: "boolean", instructions: "Does u0 delete events?" },
};
const presets = [
  ["https://ai-gateway.vercel.sh/typesafe/v1", "typesafe-ai/jev"],
  ["https://api.typesafe.ai/v1", "jev-1.13.0"],
  ["https://openrouter.ai/api/v1", "typesafe/jev-1.13"],
];
async function fixture(t, handler) {
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    void handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, calls: () => calls };
}
function model(baseURL, modelId, origin) {
  return createTypeSafeAi({
    apiKey: "synthetic-key",
    baseURL,
    fetch: routeProviderFetch(fetch, origin),
  }).evaluationModel(modelId);
}
for (const [baseURL, modelId] of presets) {
  test(`structured state and ordered questions survive ${baseURL}`, async (t) => {
    let observed;
    const http = await fixture(t, async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      observed = { path: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks)) };
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          model: modelId,
          answers: { q1: { type: "noul", noul: 0.83 }, q0: { type: "noul", noul: 0.12 } },
          usage: { input_tokens: 12, output_tokens: 2 },
        }),
      );
    });
    const result = await evaluate({
      model: model(baseURL, modelId, http.origin),
      state,
      questions,
      maxRetries: 0,
    });
    assert.deepEqual(observed.body, {
      model: modelId,
      state,
      questions: {
        q1: { type: "noul", instructions: questions.q1.instructions },
        q0: { type: "noul", instructions: questions.q0.instructions },
      },
    });
    assert.deepEqual(Object.keys(observed.body.questions), ["q1", "q0"]);
    assert.equal(observed.path, `${new URL(baseURL).pathname}/systemone`);
    assert.equal(observed.headers.authorization, "Bearer synthetic-key");
    assert.equal(observed.headers["x-jevgrep-original-url"], `${baseURL}/systemone`);
    assert.match(observed.headers["content-type"], /^application\/json/);
    assert.deepEqual(result.answers, {
      q1: { type: "boolean", probability: 0.83 },
      q0: { type: "boolean", probability: 0.12 },
    });
    assert.equal(http.calls(), 1);
  });
}

for (const status of [401, 403, 408, 409, 429, 500, 503]) {
  test(`native status ${status} remains observable without SDK retry`, async (t) => {
    const http = await fixture(t, (_req, res) => {
      res.writeHead(status, { "content-type": "application/json", "retry-after": "2" });
      res.end(JSON.stringify({ message: "synthetic rejection", error_type: "fixture" }));
    });
    await assert.rejects(
      evaluate({ model: model(...presets[0], http.origin), state, questions, maxRetries: 0 }),
      (error) => {
        assert.equal(error.name, "AI_APICallError");
        assert.equal(error.statusCode, status);
        assert.equal(error.responseHeaders["retry-after"], "2");
        return true;
      },
    );
    assert.equal(http.calls(), 1);
  });
}
for (const [label, body] of [
  ["malformed JSON", "{broken"],
  ["missing answer", JSON.stringify({ answers: {} })],
  [
    "out of range",
    JSON.stringify({
      answers: { q1: { type: "noul", noul: 2 }, q0: { type: "noul", noul: 0.12 } },
    }),
  ],
]) {
  test(`${label} is rejected rather than clamped`, async (t) => {
    const http = await fixture(t, (_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(body);
    });
    await assert.rejects(
      evaluate({ model: model(...presets[0], http.origin), state, questions, maxRetries: 0 }),
      (error) => {
        assert.equal(
          error.name,
          label === "malformed JSON" ? "AI_APICallError" : "AI_InvalidResponseDataError",
        );
        if (label === "malformed JSON") {
          assert.equal(error.statusCode, 200);
          assert.equal(error.isRetryable, false);
        }
        t.diagnostic(`${label}: ${error.name}`);
        return true;
      },
    );
    assert.equal(http.calls(), 1);
  });
}
test("disconnect remains a status-less transport failure", async (t) => {
  const http = await fixture(t, (_req, res) => res.destroy());
  await assert.rejects(
    evaluate({ model: model(...presets[0], http.origin), state, questions, maxRetries: 0 }),
    (error) => {
      assert.equal(error.name, "AI_APICallError");
      assert.equal(error.statusCode, undefined);
      assert.equal(error.cause?.code, "UND_ERR_SOCKET");
      assert.equal(error.isRetryable, true);
      return true;
    },
  );
  assert.equal(http.calls(), 1);
});
for (const kind of ["timeout", "cancel"]) {
  test(`${kind} cancels actual HTTP without hidden retries`, { timeout: 5000 }, async (t) => {
    let received;
    const started = new Promise((resolve) => {
      received = resolve;
    });
    const http = await fixture(t, () => received());
    const controller = new AbortController();
    const result = evaluate({
      model: model(...presets[0], http.origin),
      state,
      questions,
      maxRetries: 0,
      abortSignal: controller.signal,
    });
    const rejected = assert.rejects(result, (error) => {
      assert.equal(error.name, kind === "timeout" ? "TimeoutError" : "AbortError");
      return true;
    });
    await started;
    if (kind === "cancel") controller.abort();
    else {
      const deadline = AbortSignal.timeout(30);
      deadline.addEventListener("abort", () => controller.abort(deadline.reason), { once: true });
    }
    await rejected;
    assert.equal(http.calls(), 1);
  });
}

test("routing rejects unknown destinations before HTTP", async (t) => {
  const http = await fixture(t, (_req, res) => res.end("{}"));
  const routed = routeProviderFetch(fetch, http.origin);
  await assert.rejects(
    routed("https://unapproved.invalid/v1/systemone"),
    /Unexpected provider destination/,
  );
  assert.equal(http.calls(), 0);
});

test("Node preload routes SDK-shaped fetches and rejects any other host", async (t) => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const run = promisify(execFile);
  const bodies = [];
  const http = await fixture(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    bodies.push(Buffer.concat(chunks).toString());
    res.end("fixture-ok");
  });
  const preload = fileURLToPath(
    new URL("../../../test/fixtures/provider-route.mjs", import.meta.url),
  );
  const options = { env: { JEVGREP_TEST_PROVIDER_ORIGIN: http.origin }, timeout: 5000 };
  const args = ["--import", preload, "--input-type=module", "-e"];
  const result = await run(
    process.execPath,
    [
      ...args,
      `console.log(await (await fetch('https://api.typesafe.ai/v1/systemone', {method: 'POST', body: 'synthetic'})).text())`,
    ],
    options,
  );
  assert.equal(result.stdout, "fixture-ok\n");
  assert.equal(result.stderr, "");
  assert.deepEqual(bodies, ["synthetic"]);
  await assert.rejects(
    run(
      process.execPath,
      [...args, `await fetch('https://unapproved.invalid/v1/systemone')`],
      options,
    ),
    /Unexpected provider destination/,
  );
  assert.equal(http.calls(), 1);
});
