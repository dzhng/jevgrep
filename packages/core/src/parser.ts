import { fork, type ChildProcess } from "node:child_process";

type Helper = "inspect" | "preview" | "neighborhood" | "calls" | "declarations";
type Pending = {
  helper: Helper;
  input: string;
  signal?: AbortSignal;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};
type Runtime = { worker: ChildProcess; pending: Map<number, Pending> };
let runtime: Runtime | undefined;
let nextId = 0;

function stop(owner: Runtime, error: Error, cancellation = false) {
  if (runtime === owner) runtime = undefined;
  for (const request of owner.pending.values()) {
    request.cleanup();
    if (cancellation && !request.signal?.aborted) {
      // Helpers have no side effects; unrelated requests can survive a cancelled worker.
      runParser(request.helper, request.input, request.signal).then(
        request.resolve,
        request.reject,
      );
    } else request.reject(error);
  }
  owner.pending.clear();
  owner.worker.kill();
}
function start(): Runtime {
  const owner: Runtime = {
    worker: fork(new URL("./parser-worker.mjs", import.meta.url), [], {
      execPath: process.versions.bun ? "node" : process.execPath,
      execArgv: [],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    }),
    pending: new Map(),
  };
  // Runtime loader diagnostics must not bypass the CLI output contract.
  owner.worker.on("message", (message: { id: number; result?: unknown; error?: string }) => {
    const request = owner.pending.get(message.id);
    if (!request) return;
    owner.pending.delete(message.id);
    request.cleanup();
    if (message.error) request.reject(new Error(`Parser helper failed: ${message.error}`));
    else request.resolve(message.result);
    if (!owner.pending.size) {
      owner.worker.unref();
      owner.worker.channel?.unref?.();
    }
  });
  owner.worker.on("error", (error) => stop(owner, error));
  owner.worker.on("exit", (code) => {
    if (runtime === owner) stop(owner, new Error(`Parser worker exited (${code})`));
  });
  owner.worker.unref();
  owner.worker.channel?.unref?.();
  return owner;
}

/** One serialized parser worker; idle workers never keep a CLI alive. Cancellation discards its state. */
export function runParser<T>(
  helper: Helper,
  input: string,
  signal?: AbortSignal,
): Promise<T | null> {
  signal?.throwIfAborted();
  const owner = (runtime ??= start());
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const abort = () =>
      stop(
        owner,
        signal?.reason instanceof Error
          ? signal.reason
          : new DOMException("Parser parsing cancelled", "AbortError"),
        true,
      );
    owner.pending.set(id, {
      helper,
      input,
      signal,
      resolve: resolve as (value: unknown) => void,
      reject,
      cleanup: () => signal?.removeEventListener("abort", abort),
    });
    signal?.addEventListener("abort", abort, { once: true });
    owner.worker.ref();
    owner.worker.channel?.ref?.();
    owner.worker.send({ id, helper, input }, (error) => {
      if (error) stop(owner, error);
    });
  });
}
