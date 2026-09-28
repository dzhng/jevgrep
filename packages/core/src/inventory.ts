import { createFilesystem, type FilesystemPolicy } from "./filesystem";

export type InventoryInput = {
  root: string;
  policy?: FilesystemPolicy;
  signal: AbortSignal;
  protectedPaths?: string[];
  /** Matches the entry bound search discovery applies in retrieve.ts. */
  maxEntries?: number;
};
export type Inventory = {
  status: "complete" | "incomplete" | "interrupted";
  files: number;
  bytes: number;
  /** Eligible files grouped by top-level directory; "." holds files directly under the root. */
  directories: Array<{ path: string; files: number; bytes: number }>;
  excluded: Record<string, number>;
  issues: Array<{ kind: string; count: number }>;
};

/** Walk every eligible path; only ignore rules are read, never source content, and no provider is contacted. */
export async function inventory(input: InventoryInput): Promise<Inventory> {
  const maxEntries = input.maxEntries ?? 100_000;
  const reader = await createFilesystem({
    root: input.root,
    policy: input.policy,
    signal: input.signal,
    protectedPaths: input.protectedPaths,
  });
  const groups = new Map<string, { files: number; bytes: number }>();
  const excluded: Record<string, number> = {};
  const issues = new Map<string, number>();
  const issue = (kind: string) => issues.set(kind, (issues.get(kind) ?? 0) + 1);
  let files = 0;
  let bytes = 0;
  let seen = 0;
  const pending = ["."];
  try {
    walk: for (let next = 0; next < pending.length; next++) {
      let cursor: string | undefined;
      try {
        do {
          if (input.signal.aborted) break walk;
          const page = await reader.listPage(pending[next], cursor);
          cursor = page.nextCursor;
          for (const { kind } of page.issues) issue(kind);
          for (const [reason, count] of Object.entries(page.excluded))
            excluded[reason] = (excluded[reason] ?? 0) + count;
          for (const entry of page.entries) {
            if (++seen > maxEntries) {
              issue("resource_limit");
              break walk;
            }
            if (entry.kind === "directory") {
              pending.push(entry.path);
              continue;
            }
            const slash = entry.path.indexOf("/");
            const top = slash === -1 ? "." : entry.path.slice(0, slash);
            const group = groups.get(top) ?? { files: 0, bytes: 0 };
            group.files++;
            group.bytes += entry.bytes ?? 0;
            groups.set(top, group);
            files++;
            bytes += entry.bytes ?? 0;
          }
        } while (cursor);
      } finally {
        if (cursor) await reader.closeCursor(cursor);
      }
    }
  } finally {
    await reader.close();
  }
  return {
    status: input.signal.aborted ? "interrupted" : issues.size ? "incomplete" : "complete",
    files,
    bytes,
    directories: [...groups]
      .map(([path, group]) => ({ path, ...group }))
      .sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)),
    excluded,
    issues: [...issues].map(([kind, count]) => ({ kind, count })),
  };
}
