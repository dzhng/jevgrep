import { expect, test } from "bun:test";
import {
  customProviderId,
  endpointFor,
  isCredentialProvider,
  providers,
  validateBaseURL,
  validateModel,
} from "../src/providers";

test("preset endpoints keep their existing label, base URL, and model", () => {
  for (const provider of ["vercel", "typesafe", "openrouter", "opencode"] as const)
    expect(endpointFor({ provider })).toEqual(providers[provider]);
});

test("custom endpoints resolve to the saved base URL, model, and visible host", () => {
  expect(
    endpointFor({
      provider: "custom",
      baseURL: "https://gateway.example.com/typesafe/v1",
      model: "gateway/jev-2",
    }),
  ).toEqual({
    label: "Custom endpoint (gateway.example.com)",
    baseURL: "https://gateway.example.com/typesafe/v1",
    model: "gateway/jev-2",
  });
});

test("base URLs require https except for loopback development proxies", () => {
  expect(validateBaseURL(" https://gateway.example.com/v1 ")).toBe(
    "https://gateway.example.com/v1",
  );
  expect(validateBaseURL("http://localhost:8080/v1")).toBe("http://localhost:8080/v1");
  expect(validateBaseURL("http://127.0.0.1:8080/v1")).toBe("http://127.0.0.1:8080/v1");
  for (const value of [
    "http://gateway.example.com/v1",
    "http://192.168.1.10:8080/v1",
    "ftp://gateway.example.com/v1",
    "gateway.example.com/v1",
    "",
    "   ",
    undefined,
    7,
  ])
    expect(() => validateBaseURL(value)).toThrow();
});

test("model IDs must be non-empty and free of whitespace", () => {
  expect(validateModel(" gateway/jev-2 ")).toBe("gateway/jev-2");
  for (const value of ["", "  ", "two words", undefined, 7])
    expect(() => validateModel(value)).toThrow();
});

test("custom is a selectable credential provider and unknown names stay invalid", () => {
  expect(customProviderId).toBe("custom");
  expect(isCredentialProvider("custom")).toBe(true);
  expect(isCredentialProvider("vercel")).toBe(true);
  for (const value of ["unknown", "Custom", "", undefined, 7])
    expect(isCredentialProvider(value)).toBe(false);
});
