import { expect, test } from "bun:test";
import { installSkill } from "../src/skill";

test("skill installation rejects unsupported Node versions before launching npx", async () => {
  // This process-global override must remain in a non-concurrent test.
  const descriptor = Object.getOwnPropertyDescriptor(process.versions, "node")!;
  const controller = new AbortController();
  const aborted = new Error("supported runtime reached installer boundary");
  controller.abort(aborted);
  try {
    for (const version of ["20.20.0", "22.0.0", "22.19.9"]) {
      Object.defineProperty(process.versions, "node", { ...descriptor, value: version });
      await expect(
        installSkill({ kind: "skill", agents: [], global: false, yes: false }, controller.signal),
      ).rejects.toThrow("jg skill requires Node 22.20 or newer");
    }
    for (const version of ["22.20.0", "22.23.3", "23.0.0", "24.0.0"]) {
      Object.defineProperty(process.versions, "node", { ...descriptor, value: version });
      await expect(
        installSkill({ kind: "skill", agents: [], global: false, yes: false }, controller.signal),
      ).rejects.toBe(aborted);
    }
  } finally {
    Object.defineProperty(process.versions, "node", descriptor);
  }
});
