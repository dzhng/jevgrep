import { testIfDocker as test } from "../../../test/helpers/docker";
import { afterEach, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventory } from "../src/inventory";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "jevgrep-inventory-"));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

test("inventory totals eligible files by top-level directory without reading content", async () => {
  const root = await fixture({
    ".gitignore": "out/\n",
    "readme.md": "12",
    "src/a.ts": "1234",
    "src/deep/b.ts": "123456",
    "test/a.test.ts": "1",
    "out/bundle.js": "ignored",
    "node_modules/x/index.js": "dependency",
  });
  const signal = new AbortController().signal;
  expect(await inventory({ root, signal })).toEqual({
    status: "complete",
    files: 4,
    bytes: 13,
    directories: [
      { path: "src", files: 2, bytes: 10 },
      { path: ".", files: 1, bytes: 2 },
      { path: "test", files: 1, bytes: 1 },
    ],
    excluded: { hidden: 1, ignored: 1, dependency: 1 },
    issues: [],
  });
  const broad = await inventory({
    root,
    signal,
    policy: { noIgnore: true, includeDependencies: true },
  });
  expect(broad.files).toBe(6);
  expect(broad.excluded).toEqual({ hidden: 1 });
});

test("inventory stops at the entry bound and on cancellation", async () => {
  const root = await fixture({ "a.ts": "a", "b.ts": "b", "c/d.ts": "d" });
  const bounded = await inventory({ root, signal: new AbortController().signal, maxEntries: 2 });
  expect(bounded.status).toBe("incomplete");
  expect(bounded.issues).toEqual([{ kind: "resource_limit", count: 1 }]);
  const controller = new AbortController();
  controller.abort();
  expect(await inventory({ root, signal: controller.signal })).toMatchObject({
    status: "interrupted",
    files: 0,
  });
});
