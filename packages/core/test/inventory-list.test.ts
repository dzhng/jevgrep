import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventory } from "../src/inventory";

test("inventory optionally retains eligible paths and respects exclusions and entry bounds", async () => {
  const root = await mkdtemp(join(tmpdir(), "jevgrep-inventory-list-"));
  try {
    const files = {
      ".gitignore": "ignored/\n",
      "terraform.tfvars": 'db_password = "synthetic fixture"',
      "config/database.yml": "password: synthetic fixture",
      "src/z.ts": "export const z = 1;",
      "src/line\nbreak.ts": "export const a = 1;",
      "ignored/output.ts": "ignored",
      ".env": "hidden",
      "server.pem": "sensitive",
      "node_modules/a.ts": "dependency",
      "protected/a.ts": "protected",
    };
    for (const [path, content] of Object.entries(files)) {
      await mkdir(join(root, path, ".."), { recursive: true });
      await writeFile(join(root, path), content);
    }
    const input = {
      root,
      signal: new AbortController().signal,
      protectedPaths: [join(root, "protected")],
    };
    const summary = await inventory(input);
    expect(summary).not.toHaveProperty("paths");
    const listed = await inventory({ ...input, includePaths: true });
    expect(listed.paths).toEqual([
      "config/database.yml",
      "src/line\nbreak.ts",
      "src/z.ts",
      "terraform.tfvars",
    ]);
    const { paths, ...counts } = listed;
    expect(counts).toEqual(summary);
    expect(paths?.length).toBe(listed.files);
    const narrowed = await inventory({
      ...input,
      includePaths: true,
      policy: { exclude: ["config/", "*.tfvars"] },
    });
    expect(narrowed.paths).toEqual(["src/line\nbreak.ts", "src/z.ts"]);
    const bounded = await inventory({ ...input, includePaths: true, maxEntries: 2 });
    expect(bounded.status).toBe("incomplete");
    expect(bounded.paths?.length).toBe(bounded.files);
    const controller = new AbortController();
    controller.abort();
    expect(
      await inventory({ ...input, includePaths: true, signal: controller.signal }),
    ).toMatchObject({
      status: "interrupted",
      files: 0,
      paths: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
