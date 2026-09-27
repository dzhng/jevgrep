import { referenceTransport, wireResponse, type Provider } from "./transport";
import { resolve } from "node:path";
export async function replay(
  mode: "healthy" | "missing" | "invalid" = "healthy",
  production = false,
  provider: Provider = "vercel",
) {
  const requests: unknown[] = [];
  const transport = await referenceTransport(provider, "reference-fixture");
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = transport.decode(request, await request.json(), production) as {
        state: {
          items?: Array<{ path: string }>;
          path?: string;
          declarations?: unknown[];
          selectedEvidence?: unknown[];
          relationAnchor?: unknown;
        };
        questions: Record<string, unknown>;
      };
      requests.push(body);
      if (mode === "missing")
        return Response.json(wireResponse({ answers: {} }, production, provider));
      if (mode === "invalid")
        return Response.json(
          wireResponse(
            {
              answers: Object.fromEntries(
                Object.keys(body.questions).map((id) => [id, { type: "boolean", probability: 2 }]),
              ),
            },
            production,
            provider,
          ),
        );
      return Response.json(
        wireResponse(
          {
            answers: Object.fromEntries(
              Object.keys(body.questions).map((id, i) => [
                id,
                {
                  type: "boolean",
                  probability:
                    body.state.items?.[i]?.path === "unrelated.md"
                      ? 0.05
                      : body.state.items?.[i]?.path === "src/backend" && !body.state.relationAnchor
                        ? 0.1
                        : body.state.declarations &&
                            !body.state.selectedEvidence &&
                            body.state.path !== "src/telemetry.ts"
                          ? 0.4
                          : 0.9,
                },
              ]),
            ),
            warnings: [{ type: "other", message: "fixture warning" }],
          },
          production,
          provider,
        ),
      );
    },
  });
  try {
    const child = Bun.spawn(
      production
        ? [
            "node",
            resolve("apps/cli/dist/bin/index.js"),
            "research how telemetry records event names",
            resolve("test/reference/tree"),
            "--no-cache",
          ]
        : [
            "node",
            "/opt/jevgrep-reference.mjs",
            "--root",
            resolve("test/reference/tree"),
            "--query",
            "research how telemetry records event names",
          ],
      {
        env: transport.env(production, `http://127.0.0.1:${server.port}`),
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return {
      requests: requests.map((value) => JSON.stringify(value)).sort(),
      stdout,
      stderr,
      code,
    };
  } finally {
    server.stop(true);
    await transport.cleanup();
  }
}
