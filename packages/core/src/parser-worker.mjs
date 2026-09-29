import { execute } from "./parser-helpers.mjs";
// A serial queue also covers asynchronous grammar initialization.
let queue = Promise.resolve();
process.on("message", ({ id, helper, input }) => {
  queue = queue.then(async () => {
    try {
      process.send?.({ id, result: await execute(helper, input) });
    } catch (error) {
      process.send?.({ id, error: String(error) });
    }
  });
});
process.on("disconnect", () => process.exit(0));
