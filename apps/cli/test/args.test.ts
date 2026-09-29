import { expect, test } from "bun:test";
import { parseCommand } from "../src/args";

test("search accepts independent policy flags and a dash-prefixed root after --", () => {
  expect(
    parseCommand([
      "find behavior",
      "--hidden",
      "--no-cache",
      "--max-source-bytes",
      "12",
      "--",
      "-tree",
    ]),
  ).toEqual({
    kind: "search",
    query: "find behavior",
    root: "-tree",
    noCache: true,
    maxSourceBytes: 12,
    policy: { hidden: true },
  });
  expect(() => parseCommand(["question", "a", "b"])).toThrow();
  expect(() => parseCommand(["question", "--max-source-bytes", "-1"])).toThrow();
  expect(() => parseCommand(["question", "--secret-mistake"])).toThrow("Unknown option");
});

test("source allocation is independent of the filesystem policy used for retrieval and cache identity", () => {
  const unlimited = parseCommand([
    "question",
    "tree",
    "--hidden",
    "--no-ignore",
    "--max-source-bytes",
    "0",
  ]);
  const bounded = parseCommand([
    "question",
    "tree",
    "--hidden",
    "--no-ignore",
    "--max-source-bytes",
    "1500",
  ]);
  if (unlimited.kind !== "search" || bounded.kind !== "search") throw new Error("Expected search");
  expect(unlimited.maxSourceBytes).toBe(0);
  expect(bounded.maxSourceBytes).toBe(1500);
  expect(unlimited.policy).toEqual({ hidden: true, noIgnore: true });
  expect(bounded.policy).toEqual(unlimited.policy);
});

test("auth requires explicit provider for stdin and keeps provider selection out of search", () => {
  expect(parseCommand(["auth"])).toEqual({ kind: "auth" });
  expect(parseCommand(["auth", "--provider", "openrouter", "--stdin"])).toEqual({
    kind: "auth",
    provider: "openrouter",
  });
  expect(parseCommand(["auth", "--provider", "opencode", "--stdin"])).toEqual({
    kind: "auth",
    provider: "opencode",
  });
  for (const args of [
    ["auth", "--stdin"],
    ["auth", "--provider", "vercel"],
    ["auth", "--provider", "unknown", "--stdin"],
    ["query", "--provider", "typesafe"],
    ["doctor", "--provider", "vercel"],
    ["skill", "--provider", "vercel"],
    ["cache", "clear", "--provider", "vercel"],
  ])
    expect(() => parseCommand(args)).toThrow();
});

test("custom auth carries an explicit base URL and model while presets reject them", () => {
  expect(
    parseCommand([
      "auth",
      "--provider",
      "custom",
      "--base-url",
      "https://gateway.example.com/typesafe/v1",
      "--model",
      "gateway/jev-2",
      "--stdin",
    ]),
  ).toEqual({
    kind: "auth",
    provider: "custom",
    baseURL: "https://gateway.example.com/typesafe/v1",
    model: "gateway/jev-2",
  });
  for (const args of [
    ["auth", "--provider", "custom", "--stdin"],
    ["auth", "--provider", "custom", "--base-url", "https://gateway.example.com/v1", "--stdin"],
    ["auth", "--provider", "custom", "--model", "gateway/jev-2", "--stdin"],
    ["auth", "--provider", "vercel", "--base-url", "https://gateway.example.com/v1", "--stdin"],
    ["auth", "--provider", "vercel", "--model", "gateway/jev-2", "--stdin"],
    ["auth", "--base-url", "https://gateway.example.com/v1", "--model", "gateway/jev-2", "--stdin"],
    ["doctor", "--base-url", "https://gateway.example.com/v1"],
    ["doctor", "--model", "gateway/jev-2"],
    ["question", "--base-url", "https://gateway.example.com/v1"],
    ["cache", "clear", "--model", "gateway/jev-2"],
  ])
    expect(() => parseCommand(args)).toThrow();
});

test("concurrency is a positive search-only limit and does not change cache policy", () => {
  const command = parseCommand(["question", "--concurrency", "2"]);
  expect(command).toMatchObject({ kind: "search", concurrency: 2, policy: {} });
  for (const value of ["0", "-1", "1.5", "NaN", "1e2", "9007199254740992"])
    expect(() => parseCommand(["question", `--concurrency=${value}`])).toThrow("positive integer");
  for (const args of [["doctor"], ["auth"], ["skill"], ["cache", "clear"]])
    expect(() => parseCommand([...args, "--concurrency", "2"])).toThrow();
});

test("files takes an optional root and only the filesystem policy flags", () => {
  expect(parseCommand(["files"])).toEqual({ kind: "files", root: process.cwd(), policy: {} });
  expect(parseCommand(["files", "src", "--hidden", "--no-ignore"])).toEqual({
    kind: "files",
    root: "src",
    policy: { hidden: true, noIgnore: true },
  });
  for (const args of [
    ["files", "a", "b"],
    ["files", "--no-cache"],
    ["files", "--concurrency", "2"],
    ["files", "--max-source-bytes", "1"],
    ["files", "--provider", "vercel"],
  ])
    expect(() => parseCommand(args)).toThrow("Usage: jg files");
});

test("exclude patterns are repeatable, normalized for cache identity, and limited to search or files", () => {
  expect(
    parseCommand([
      "question",
      "--exclude",
      "src/**/*.test.ts",
      "--exclude",
      "admin/",
      "--exclude=admin/",
    ]),
  ).toMatchObject({ kind: "search", policy: { exclude: ["admin/", "src/**/*.test.ts"] } });
  expect(parseCommand(["question", "--no-ignore", "--exclude", "docs"])).toMatchObject({
    policy: { noIgnore: true, exclude: ["docs"] },
  });
  for (const pattern of ["", " ", "!keep.ts", "#note", "a\nb", "secrets\\", "\\"])
    expect(() => parseCommand(["question", "--exclude", pattern])).toThrow("--exclude");
  for (const args of [["doctor"], ["auth"], ["skill"], ["cache", "clear"]])
    expect(() => parseCommand([...args, "--exclude", "docs"])).toThrow();
});

test("exclude rejects odd trailing backslash runs but preserves escaped backslashes", () => {
  for (const command of ["question", "files"]) {
    for (const count of [1, 3, 5])
      expect(() => parseCommand([command, "--exclude", "secrets" + "\\".repeat(count)])).toThrow(
        "--exclude",
      );
    for (const count of [2, 4]) {
      const pattern = "secrets" + "\\".repeat(count);
      expect(parseCommand([command, "--exclude", pattern])).toMatchObject({
        policy: { exclude: [pattern] },
      });
    }
  }
});
