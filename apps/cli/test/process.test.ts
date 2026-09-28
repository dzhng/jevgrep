import { expect } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { testInDocker, withCli } from "./cli";

const execute = promisify(execFile);
const cli =
  process.env.JEVGREP_TEST_CLI ?? fileURLToPath(new URL("../dist/bin/index.js", import.meta.url));

testInDocker("a closed stdout pipe exits quietly", async () => {
  await withCli(async ({ home }) => {
    const { stdout } = await execute(
      "python3",
      [
        "-c",
        `
import json, os, subprocess, sys
reader, writer = os.pipe()
os.close(reader)
process = subprocess.Popen(["node", sys.argv[1], "--help"], stdout=writer, stderr=subprocess.PIPE)
os.close(writer)
try:
    _, errors = process.communicate(timeout=5)
    print(json.dumps({"code": process.returncode, "stderr": errors.decode()}))
finally:
    if process.poll() is None:
        process.kill()
        process.wait()
`,
        cli,
      ],
      { env: { ...process.env, HOME: home } },
    );
    expect(JSON.parse(stdout)).toEqual({ code: 0, stderr: "" });
  });
});

testInDocker("interactive auth hides input and exits 130 on interruption", async () => {
  await withCli(async ({ home }) => {
    for (const mode of [
      "save",
      "save-kilo",
      "save-kilo-org",
      "interrupt-provider",
      "interrupt-key",
      "cancel-provider",
      "cancel-key",
    ]) {
      const file = join(home, "jevgrep", "credentials.json");
      const previous = mode === "save" ? undefined : await readFile(file, "utf8");
      const { stdout } = await execute(
        "python3",
        [
          "-c",
          `
import json, os, pty, select, signal, subprocess, sys, time
master, slave = pty.openpty()
process = subprocess.Popen(["node", sys.argv[1], "auth"], stdin=slave, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
os.close(slave)
output = b""
try:
    def wait_for(marker):
        global output
        deadline = time.monotonic() + 5
        while marker not in output:
            if time.monotonic() >= deadline:
                raise RuntimeError("Auth prompt did not appear")
            if select.select([process.stdout], [], [], 0.1)[0]:
                part = os.read(process.stdout.fileno(), 4096)
                if not part: raise RuntimeError("Auth exited before prompt")
                output += part
    wait_for(b"Choose your Jev provider")
    mode = sys.argv[2]
    if not mode.endswith("provider"):
        os.write(master, (b"\\x1b[B" * (4 if mode.startswith("save-kilo") else 2)) + b"\\r")
        wait_for(b"API key")
    if mode.startswith("save"):
        os.write(master, b"pty-fixture-secret\\r")
        if mode.startswith("save-kilo"):
            wait_for(b"Organization ID")
            os.write(master, (b"123e4567-e89b-42d3-a456-426614174000" if mode == "save-kilo-org" else b"") + b"\\r")
    elif mode.startswith("cancel"):
        os.write(master, b"\\x03")
    else:
        process.send_signal(signal.SIGINT)
    rest, errors = process.communicate(timeout=5)
    output += rest
    echo = b""
    while select.select([master], [], [], 0)[0]:
        try:
            part = os.read(master, 4096)
            if not part: break
            echo += part
        except OSError: break
    print(json.dumps({"code": process.returncode, "stdout": output.decode(), "stderr": errors.decode(), "echo": echo.decode()}))
finally:
    if process.poll() is None:
        process.kill()
        process.wait()
    os.close(master)
`,
          cli,
          mode,
        ],
        { env: { ...process.env, HOME: home, XDG_CONFIG_HOME: home } },
      );
      const result = JSON.parse(stdout);
      expect(result.code).toBe(mode.startsWith("save") ? 0 : 130);
      expect(result.stderr).toBe("");
      expect(result.stdout + result.echo).not.toContain("pty-fixture-secret");
      expect(result.stdout).toContain(mode.startsWith("save") ? "key saved" : "Interrupted");
      if (mode.startsWith("save")) {
        expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
          provider: mode.startsWith("save-kilo") ? "kilo" : "openrouter",
          apiKey: "pty-fixture-secret",
          ...(mode === "save-kilo-org"
            ? { organizationId: "123e4567-e89b-42d3-a456-426614174000" }
            : {}),
        });
        expect(result.stdout.indexOf("Vercel AI Gateway")).toBeLessThan(
          result.stdout.indexOf("TypeSafe"),
        );
        expect(result.stdout.indexOf("TypeSafe")).toBeLessThan(result.stdout.indexOf("OpenRouter"));
      } else expect(await readFile(file, "utf8")).toBe(previous);
      expect(await readdir(join(home, "jevgrep"))).toEqual(["credentials.json"]);
    }
  });
});
