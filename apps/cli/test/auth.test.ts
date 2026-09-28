import { expect } from "bun:test";
import { readFile, stat } from "node:fs/promises";
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
  "installed Kilo auth saves an optional organization without echoing the key",
  async () => {
    await withCli(async ({ home, run }) => {
      const id = "123e4567-e89b-42d3-a456-426614174000";
      const result = await run(
        ["auth", "--provider", "kilo", "--org-id", id, "--stdin"],
        "kilo-fixture-secret\n",
      );
      expect(result.code).toBe(0);
      expect(result.stdout).not.toContain("kilo-fixture-secret");
      const file = join(home, "jevgrep", "credentials.json");
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
        provider: "kilo",
        apiKey: "kilo-fixture-secret",
        organizationId: id,
      });
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    });
  },
);
