import { expect, test } from "bun:test";
import { createRateBudget } from "../src/rate-budget";

test("rolling budgets reconcile usage and enforce the stricter token or request window", () => {
  let now = 0;
  const budget = createRateBudget({ tokensPerSecond: 100, requestsPerSecond: 3 }, () => now);
  const first = budget.reserve(80);
  expect(budget.waitMs(30)).toBe(1000);
  first.reconcile(undefined);
  expect(budget.waitMs(30)).toBe(1000);
  first.reconcile(20);
  expect(budget.waitMs(30)).toBe(0);
  budget.reserve(30);
  now = 500;
  budget.reserve(40);
  expect(budget.waitMs(20)).toBe(500);
  now = 1000;
  expect(budget.waitMs(60)).toBe(0);
  expect(budget.waitMs(61)).toBe(500);
  now = 1500;
  budget.reserve(100);
  expect(budget.waitMs(1)).toBe(1000);
});

test("request reservations expire individually at the one-second boundary", () => {
  let now = 0;
  const budget = createRateBudget({ tokensPerSecond: 100, requestsPerSecond: 3 }, () => now);
  budget.reserve(0);
  now = 200;
  budget.reserve(0);
  now = 500;
  budget.reserve(0);
  now = 999;
  expect(budget.waitMs(0)).toBe(1);
  now = 1000;
  expect(budget.waitMs(0)).toBe(0);
  budget.reserve(0);
  expect(budget.waitMs(0)).toBe(200);
  now = 1200;
  expect(budget.waitMs(0)).toBe(0);
});
