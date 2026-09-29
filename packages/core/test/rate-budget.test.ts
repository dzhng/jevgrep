import { expect, test } from "bun:test";
import { createRateBudget } from "../src/rate-budget";

test("rolling budgets reconcile usage and enforce the stricter token or request window", () => {
  let now = 0;
  const budget = createRateBudget({ tokensPerSecond: 100, requestsPerMinute: 3 }, () => now);
  const first = budget.reserve(80);
  expect(budget.waitMs(30)).toBe(1000);
  first.reconcile(undefined);
  expect(budget.waitMs(30)).toBe(1000);
  first.reconcile(20);
  expect(budget.waitMs(30)).toBe(0);
  budget.reserve(30);
  now = 500;
  budget.reserve(40);
  expect(budget.waitMs(20)).toBe(59_500);
  now = 60_000;
  expect(budget.waitMs(100)).toBe(0);
  budget.reserve(100);
  expect(budget.waitMs(1)).toBe(1000);
});
