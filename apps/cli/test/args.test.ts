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
