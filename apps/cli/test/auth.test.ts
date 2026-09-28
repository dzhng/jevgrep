import { expect } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { testInDocker, withCli } from "./cli";

testInDocker("installed auth saves privately, bounds stdin, and never echoes keys", async () => {
  await withCli(async ({ home, run }) => {
    const saved = await run(["auth", "--provider", "vercel", "--stdin"], "test-gateway-secret\n");
    expect(saved.code).toBe(0);
    expect(saved.stderr).toBe("");
    expect(saved.stdout).toContain("key saved");
    expect(saved.stdout).not.toContain("test-gateway-secret");
    const file = join(home, "jevgrep", "credentials.json");
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      provider: "vercel",
      apiKey: "test-gateway-secret",
    });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(join(home, "jevgrep"))).mode & 0o777).toBe(0o700);
    const whitespace = await run(["auth", "--provider", "vercel", "--stdin"], "two secrets\n");
    expect(whitespace.code).toBe(1);
    expect(whitespace.stderr).toBe("");
    expect(whitespace.stdout).not.toContain("two secrets");
    const huge = await run(["auth", "--provider", "vercel", "--stdin"], "x".repeat(8193));
    expect(huge.code).toBe(1);
    expect(huge.stderr).toBe("");
    expect(huge.stdout).toContain("exceeds");
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
      provider: "vercel",
      apiKey: "test-gateway-secret",
    });
  });
});

testInDocker(
  "custom auth saves the endpoint and doctor verifies it without echoing the key",
  async () => {
    const requests: Array<{ path: string; authorization: string; body: Record<string, unknown> }> =
      [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        requests.push({
          path: new URL(request.url).pathname,
          authorization: request.headers.get("authorization") ?? "",
          body: (await request.json()) as Record<string, unknown>,
        });
        return Response.json({ answers: { relevant: { type: "noul", noul: 0.9 } } });
      },
    });
    try {
      await withCli(async ({ home, run }) => {
        const key = "custom-endpoint-secret";
        const baseURL = `http://127.0.0.1:${server.port}/typesafe/v1`;
        const auth = await run(
          [
            "auth",
            "--provider",
            "custom",
            "--base-url",
            baseURL,
            "--model",
            "gateway/jev-2",
            "--stdin",
          ],
          `${key}\n`,
        );
        expect(auth.code).toBe(0);
        expect(auth.stderr).toBe("");
        expect(auth.stdout).toContain(`Custom endpoint (127.0.0.1:${server.port})`);
        expect(auth.stdout).toContain("key saved");
        expect(auth.stdout).not.toContain(key);
        const file = join(home, "jevgrep", "credentials.json");
        expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
          provider: "custom",
          baseURL,
          model: "gateway/jev-2",
          apiKey: key,
        });
        expect((await stat(file)).mode & 0o777).toBe(0o600);
        expect((await stat(join(home, "jevgrep"))).mode & 0o777).toBe(0o700);
        expect(requests).toHaveLength(0);

        const doctor = await run(["doctor"]);
        expect(doctor.code).toBe(0);
        expect(doctor.stderr).toBe("");
        expect(doctor.stdout).toContain(`Custom endpoint (127.0.0.1:${server.port})`);
        expect(doctor.stdout).not.toContain(key);
        expect(requests).toHaveLength(1);
        expect(requests[0]!.path).toBe("/typesafe/v1/systemone");
        expect(requests[0]!.authorization).toBe(`Bearer ${key}`);
        expect(requests[0]!.body.model).toBe("gateway/jev-2");
        expect(Object.keys(requests[0]!.body.questions as object)).toEqual(["relevant"]);
      });
    } finally {
      server.stop(true);
    }
  },
);

testInDocker("custom auth rejects insecure or incomplete endpoints before saving", async () => {
  await withCli(async ({ home, run }) => {
    const file = join(home, "jevgrep", "credentials.json");
    for (const [args, expected] of [
      [
        [
          "auth",
          "--provider",
          "custom",
          "--base-url",
          "http://gateway.example.com/v1",
          "--model",
          "jev",
          "--stdin",
        ],
        "https://",
      ],
      [
        [
          "auth",
          "--provider",
          "custom",
          "--base-url",
          "ftp://gateway.example.com/v1",
          "--model",
          "jev",
          "--stdin",
        ],
        "Base URL",
      ],
      [
        [
          "auth",
          "--provider",
          "custom",
          "--base-url",
          "https://gateway.example.com/v1",
          "--model",
          "two words",
          "--stdin",
        ],
        "model ID",
      ],
      [
        ["auth", "--provider", "custom", "--base-url", "https://gateway.example.com/v1", "--stdin"],
        "--model",
      ],
      [
        ["auth", "--provider", "vercel", "--base-url", "https://gateway.example.com/v1", "--stdin"],
        "custom",
      ],
    ] as const) {
      const result = await run([...args], "rejected-endpoint-secret\n");
      expect(result.code).toBe(1);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(expected);
      expect(result.stdout).not.toContain("rejected-endpoint-secret");
    }
    expect(await readFile(file, "utf8").catch(() => null)).toBeNull();
    const piped = await run(["auth"], "piped-secret\n");
    expect(piped.code).toBe(1);
    expect(piped.stdout).toContain("custom");
    expect(piped.stdout).not.toContain("piped-secret");
  });
});

testInDocker(
  "doctor rejects a persisted custom endpoint that violates the transport rule",
  async () => {
    await withCli(async ({ home, run }) => {
      const directory = join(home, "jevgrep");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        join(directory, "credentials.json"),
        JSON.stringify({
          provider: "custom",
          baseURL: "http://gateway.example.com/v1",
          model: "gateway/jev-2",
          apiKey: "stored-endpoint-secret",
        }),
      );
      const doctor = await run(["doctor"]);
      expect(doctor.code).toBe(1);
      expect(doctor.stderr).toBe("");
      expect(doctor.stdout).toContain("Could not read valid credentials");
      expect(doctor.stdout).not.toContain("stored-endpoint-secret");
      expect(doctor.stdout).not.toContain("gateway.example.com");
    });
  },
);
