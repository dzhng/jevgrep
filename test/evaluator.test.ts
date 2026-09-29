import { routeProviderFetch } from "./fixtures/provider-route.mjs";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEvaluationCache } from "../packages/core/src/cache";
import { createEvaluator, EvaluationFailure } from "../packages/core/src/evaluator";

test("Jev uses native state and validated boolean probabilities through real HTTP", async () => {
  const state = {
    query: "find event recording",
    items: [{ path: "events.ts", source: "recordEvent()" }],
  };
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      expect(await request.json()).toEqual({
        model: "typesafe-ai/jev",
        state,
        questions: { useful: { type: "noul", instructions: "Is the source useful?" } },
      });
      return Response.json({ answers: { useful: { type: "noul", noul: 0.8 } } });
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture",
      provider: "vercel",
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      signal: new AbortController().signal,
    });
    const result = await evaluator.evaluate({
      state,
      questions: { useful: { type: "boolean", instructions: "Is the source useful?" } },
    });
    expect(result).toEqual({ useful: 0.8 });
    expect(evaluator.requests).toBe(1);
  } finally {
    server.stop(true);
  }
});

test("transient failures retry within the shared request guard and never become scores", async () => {
  let calls = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      calls++;
      return calls === 1
        ? Response.json({ error: "retry" }, { status: 503 })
        : Response.json({ answers: { q: { type: "noul", noul: 0.2 } } });
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture",
      provider: "vercel",
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      signal: new AbortController().signal,
      requestLimit: 2,
    });
    const request = {
      state: "test",
      questions: { q: { type: "boolean" as const, instructions: "Relevant?" } },
    };
    expect(await evaluator.evaluate(request)).toEqual({ q: 0.2 });
    await expect(evaluator.evaluate(request)).rejects.toMatchObject({ kind: "request-limit" });
    expect(calls).toBe(2);
    expect(evaluator.requests).toBe(2);
  } finally {
    server.stop(true);
  }
});

test("cancellation of a rate-limited request prevents further attempts", async () => {
  const controller = new AbortController();
  let calls = 0;
  let firstResponse!: () => void;
  const received = new Promise<void>((resolve) => {
    firstResponse = resolve;
  });
  const server = Bun.serve({
    port: 0,
    fetch() {
      calls++;
      firstResponse();
      return Response.json(
        { error: "rate limited" },
        { status: 429, headers: { "retry-after": "30" } },
      );
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture",
      provider: "vercel",
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      signal: controller.signal,
    });
    const result = evaluator.evaluate({
      state: "test",
      questions: { q: { type: "boolean", instructions: "Relevant?" } },
    });
    await received;
    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: "cancelled" });
    expect(calls).toBe(1);
    expect(evaluator.requests).toBe(1);
  } finally {
    controller.abort();
    server.stop(true);
  }
}, 2000);

test("Retry-After delays a retry before the provider can recover", async () => {
  const received: number[] = [];
  const server = Bun.serve({
    port: 0,
    fetch() {
      received.push(performance.now());
      return received.length === 1
        ? Response.json(
            { error: "rate limited" },
            { status: 429, headers: { "retry-after": "0.1" } },
          )
        : Response.json({ answers: { q: { type: "noul", noul: 0.8 } } });
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture",
      provider: "vercel",
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      signal: new AbortController().signal,
    });
    expect(
      await evaluator.evaluate({
        state: "test",
        questions: { q: { type: "boolean", instructions: "Relevant?" } },
      }),
    ).toEqual({ q: 0.8 });
    expect(received.length).toBe(2);
    expect(received[1]! - received[0]!).toBeGreaterThanOrEqual(95);
    expect(evaluator.requests).toBe(2);
  } finally {
    server.stop(true);
  }
});

test("stalled HTTP attempts time out without exceeding the evaluator attempt limit", async () => {
  let calls = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      calls++;
      return new Promise<Response>(() => {});
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture",
      provider: "vercel",
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      signal: new AbortController().signal,
      timeoutMs: 100,
    });
    await expect(
      evaluator.evaluate({
        state: "test",
        questions: { q: { type: "boolean", instructions: "Relevant?" } },
      }),
    ).rejects.toMatchObject({
      kind: "provider",
      message: expect.stringContaining("timed out after 100 ms"),
    });
    expect(calls).toBe(2);
    expect(evaluator.requests).toBe(2);
  } finally {
    server.stop(true);
  }
}, 2000);

test("authentication failure stops other in-flight and subsequent query requests", async () => {
  let calls = 0;
  const server = Bun.serve({
    port: 0,
    fetch() {
      calls++;
      if (calls === 1) return new Promise<Response>(() => {});
      if (calls === 2) return Response.json({ error: "unauthorized" }, { status: 401 });
      return Response.json({ answers: { q: { type: "noul", noul: 0.8 } } });
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture",
      provider: "vercel",
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      signal: new AbortController().signal,
      timeoutMs: 1000,
    });
    const request = {
      state: "test",
      questions: { q: { type: "boolean" as const, instructions: "Relevant?" } },
    };
    const outcomes = await Promise.allSettled([
      evaluator.evaluate(request),
      evaluator.evaluate(request),
    ]);
    expect(outcomes).toMatchObject([
      { status: "rejected", reason: { kind: "authentication" } },
      { status: "rejected", reason: { kind: "authentication" } },
    ]);
    await expect(evaluator.evaluate(request)).rejects.toMatchObject({ kind: "authentication" });
    expect(calls).toBe(2);
  } finally {
    server.stop(true);
  }
}, 2000);

test("authentication failure interrupts a sibling Retry-After wait", async () => {
  let calls = 0;
  let releaseAuthentication!: () => void;
  const authenticationReady = new Promise<void>((resolve) => {
    releaseAuthentication = resolve;
  });
  const server = Bun.serve({
    port: 0,
    async fetch() {
      calls++;
      if (calls === 1) {
        await authenticationReady;
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      setTimeout(releaseAuthentication, 50);
      return Response.json({ error: "limited" }, { status: 429, headers: { "retry-after": "30" } });
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture",
      provider: "vercel",
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      signal: new AbortController().signal,
    });
    const request = {
      state: "test",
      questions: { q: { type: "boolean" as const, instructions: "Relevant?" } },
    };
    const outcomes = await Promise.allSettled([
      evaluator.evaluate(request),
      evaluator.evaluate(request),
    ]);
    expect(outcomes).toMatchObject([
      { status: "rejected", reason: { kind: "authentication" } },
      { status: "rejected", reason: { kind: "authentication" } },
    ]);
    expect(calls).toBe(2);
  } finally {
    server.stop(true);
  }
}, 2000);

for (const status of [409, 422, 503]) {
  test(`navigation HTTP ${status} preserves retry and split policy`, async () => {
    let calls = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        calls++;
        return Response.json({ message: "synthetic failure" }, { status });
      },
    });
    try {
      const evaluator = createEvaluator({
        provider: "openrouter",
        apiKey: "fixture",
        fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
        signal: new AbortController().signal,
      });
      await expect(
        evaluator.evaluate(
          {
            state: { source: "code" },
            questions: {
              q0: { type: "boolean", instructions: "Relevant?" },
              q1: { type: "boolean", instructions: "Related?" },
            },
          },
          { navigation: true },
        ),
      ).rejects.toMatchObject({ kind: "provider", splitEligible: status === 503 });
      expect(calls).toBe(1);
      expect(evaluator.requests).toBe(1);
    } finally {
      server.stop(true);
    }
  });
}

test("native HTTP-date Retry-After is honored before another attempt", async () => {
  const retryAt = new Date(Math.ceil(Date.now() / 1000) * 1000 + 1000);
  const arrivals: number[] = [];
  const server = Bun.serve({
    port: 0,
    fetch() {
      arrivals.push(Date.now());
      return arrivals.length === 1
        ? Response.json(
            { message: "rate limited" },
            { status: 429, headers: { "retry-after": retryAt.toUTCString() } },
          )
        : Response.json({ answers: { q: { type: "noul", noul: 0.8 } } });
    },
  });
  try {
    const evaluator = createEvaluator({
      provider: "typesafe",
      apiKey: "fixture",
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      signal: new AbortController().signal,
    });
    expect(
      await evaluator.evaluate({
        state: "code",
        questions: { q: { type: "boolean", instructions: "Relevant?" } },
      }),
    ).toEqual({ q: 0.8 });
    expect(arrivals.length).toBe(2);
    expect(arrivals[1]!).toBeGreaterThanOrEqual(retryAt.getTime());
  } finally {
    server.stop(true);
  }
}, 5000);

test("queued requests validate fresh source only after a provider slot is available", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let seen!: () => void;
  const received = new Promise<void>((resolve) => {
    seen = resolve;
  });
  let calls = 0;
  let stale = false;
  const server = Bun.serve({
    port: 0,
    async fetch() {
      calls++;
      seen();
      await gate;
      return Response.json({ answers: { q: { type: "noul", noul: 0.8 } } });
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture",
      provider: "vercel",
      concurrency: 1,
      signal: new AbortController().signal,
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
    });
    const request = {
      state: "test",
      questions: { q: { type: "boolean" as const, instructions: "Relevant?" } },
    };
    const first = evaluator.evaluate(request);
    await received;
    const queued = evaluator
      .evaluate(request, {
        beforeAttempt: async () => {
          if (stale) throw new EvaluationFailure("source-invalid");
        },
      })
      .catch((error) => error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    stale = true;
    release();
    expect(await first).toEqual({ q: 0.8 });
    expect(await queued).toMatchObject({ kind: "source-invalid" });
    expect(calls).toBe(1);
  } finally {
    release();
    server.stop(true);
  }
});

for (const kind of ["cancelled", "authentication"] as const)
  test(`${kind} rejects every queued request without sending it`, async () => {
    const controller = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let seen!: () => void;
    const received = new Promise<void>((resolve) => {
      seen = resolve;
    });
    let calls = 0;
    const server = Bun.serve({
      port: 0,
      async fetch() {
        calls++;
        seen();
        await gate;
        return kind === "authentication"
          ? Response.json({ error: "invalid key" }, { status: 401 })
          : Response.json({ answers: { q: { type: "noul", noul: 0.8 } } });
      },
    });
    try {
      const evaluator = createEvaluator({
        apiKey: "fixture",
        provider: "vercel",
        concurrency: 1,
        signal: controller.signal,
        fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
      });
      const results = Promise.allSettled(
        Array.from({ length: 20 }, (_, i) =>
          evaluator.evaluate({
            state: String(i),
            questions: { q: { type: "boolean", instructions: "Relevant?" } },
          }),
        ),
      );
      await received;
      if (kind === "authentication") release();
      else controller.abort();
      const settled = await results;
      for (const result of settled)
        expect(result).toMatchObject({ status: "rejected", reason: { kind } });
      expect(calls).toBe(1);
      expect(evaluator.requests).toBe(1);
    } finally {
      release();
      server.stop(true);
    }
  });

test("a custom provider uses its saved base URL and model through the same protocol", async () => {
  const observed: Array<{ path: string; authorization: string; body: Record<string, unknown> }> =
    [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      observed.push({
        path: new URL(request.url).pathname,
        authorization: request.headers.get("authorization") ?? "",
        body: (await request.json()) as Record<string, unknown>,
      });
      return Response.json({ answers: { q: { type: "noul", noul: 0.7 } } });
    },
  });
  try {
    const evaluator = createEvaluator({
      apiKey: "fixture-key",
      provider: "custom",
      baseURL: `http://127.0.0.1:${server.port}/gateway/v1`,
      model: "gateway/jev-2",
      signal: new AbortController().signal,
    });
    expect(
      await evaluator.evaluate({
        state: "test",
        questions: { q: { type: "boolean", instructions: "Relevant?" } },
      }),
    ).toEqual({ q: 0.7 });
    expect(observed).toEqual([
      {
        path: "/gateway/v1/systemone",
        authorization: "Bearer fixture-key",
        body: {
          model: "gateway/jev-2",
          state: "test",
          questions: { q: { type: "noul", instructions: "Relevant?" } },
        },
      },
    ]);
  } finally {
    server.stop(true);
  }
});

test("custom cache identity keeps endpoints and models separate from presets", async () => {
  const models: string[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as { model: string };
      models.push(body.model);
      return Response.json({ answers: { q: { type: "noul", noul: 0.6 } } });
    },
  });
  const directory = await mkdtemp(join(tmpdir(), "jevgrep-custom-cache-"));
  try {
    const request = {
      state: "test",
      questions: { q: { type: "boolean" as const, instructions: "Relevant?" } },
    };
    const signal = new AbortController().signal;
    const origin = `http://127.0.0.1:${server.port}`;
    const evaluator = (options: Record<string, unknown>) =>
      createEvaluator({
        apiKey: "fixture-key",
        signal,
        cache: createEvaluationCache({ directory }),
        ...options,
      } as Parameters<typeof createEvaluator>[0]);

    expect(
      await evaluator({
        provider: "vercel",
        fetch: routeProviderFetch(fetch, origin),
      }).evaluate(request),
    ).toEqual({ q: 0.6 });
    expect(
      await evaluator({
        provider: "custom",
        baseURL: `${origin}/gateway/v1`,
        model: "gateway/jev-2",
      }).evaluate(request),
    ).toEqual({ q: 0.6 });
    expect(models).toEqual(["typesafe-ai/jev", "gateway/jev-2"]);

    expect(
      await evaluator({
        provider: "custom",
        baseURL: `${origin}/gateway/v1`,
        model: "gateway/jev-2",
      }).evaluate(request),
    ).toEqual({ q: 0.6 });
    expect(models).toEqual(["typesafe-ai/jev", "gateway/jev-2"]);

    expect(
      await evaluator({
        provider: "custom",
        baseURL: `${origin}/gateway/v1`,
        model: "gateway/jev-3",
      }).evaluate(request),
    ).toEqual({ q: 0.6 });
    expect(
      await evaluator({
        provider: "custom",
        baseURL: `${origin}/other/v1`,
        model: "gateway/jev-2",
      }).evaluate(request),
    ).toEqual({ q: 0.6 });
    expect(models).toEqual(["typesafe-ai/jev", "gateway/jev-2", "gateway/jev-3", "gateway/jev-2"]);
  } finally {
    server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
});

test("native token pacing preserves concurrent small calls and excludes queue time from timeout", async () => {
  const arrivals: Array<{ at: number; tokens: number }> = [];
  let active = 0;
  let peak = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as { state: string };
      const tokens = body.state.length > 1000 ? 60_000 : 100;
      arrivals.push({ at: performance.now(), tokens });
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 80));
      active--;
      return Response.json({
        answers: { q: { type: "noul", noul: 0.8 } },
        usage: { input_tokens: tokens, output_tokens: 1 },
      });
    },
  });
  try {
    const evaluator = createEvaluator({
      provider: "typesafe",
      apiKey: "fixture",
      signal: new AbortController().signal,
      timeoutMs: 500,
      fetch: routeProviderFetch(fetch, `http://127.0.0.1:${server.port}`),
    });
    const values = await Promise.all(
      Array.from({ length: 32 }, (_, i) =>
        evaluator.evaluate({
          state: i < 24 ? "small" : "x".repeat(65_000),
          questions: { q: { type: "boolean", instructions: "Relevant?" } },
        }),
      ),
    );
    expect(values.every((value) => value.q === 0.8)).toBe(true);
    expect(peak).toBeGreaterThan(4);
    expect(arrivals).toHaveLength(32);
    for (const start of arrivals) {
      // Leave a few milliseconds for loopback transport scheduling jitter.
      const tokens = arrivals
        .filter((entry) => entry.at >= start.at && entry.at < start.at + 990)
        .reduce((sum, entry) => sum + entry.tokens, 0);
      expect(tokens).toBeLessThanOrEqual(250_000);
    }
  } finally {
    server.stop(true);
  }
}, 10_000);

test("token-queued requests revalidate source after waiting", async () => {
  let calls = 0;
  let stale = false;
  const evaluator = createEvaluator({
    provider: "typesafe",
    apiKey: "fixture",
    signal: new AbortController().signal,
    fetch: async () => {
      calls++;
      stale = true;
      return Response.json({ answers: { q: { type: "noul", noul: 0.8 } } });
    },
  });
  const request = {
    state: "x".repeat(65_000),
    questions: { q: { type: "boolean" as const, instructions: "Relevant?" } },
  };
  const running = Array.from({ length: 3 }, () => evaluator.evaluate(request));
  const queued = evaluator
    .evaluate(request, {
      beforeAttempt: async () => {
        if (stale) throw new EvaluationFailure("source-invalid");
      },
    })
    .catch((error) => error);
  await Promise.all(running);
  expect(await queued).toMatchObject({ kind: "source-invalid" });
  expect(calls).toBe(3);
});
