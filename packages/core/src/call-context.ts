import { runParser } from "./parser";
import type { Snapshot } from "./filesystem";
import type { FileEvidence, Range } from "./types";
type Call = Range & {
  caller: string;
  name: string;
  unknownEarlierBases: string[];
  ownerHeader: Range;
};
export async function localCallContext(
  snapshot: Snapshot,
  file: FileEvidence,
  signal: AbortSignal,
) {
  const original = file.presentationExcerpts ?? file.excerpts;
  if (
    !/\.pyi?$/.test(snapshot.path) ||
    Buffer.byteLength(snapshot.source) > 1_000_000 ||
    file.sourceOmitted ||
    original.some((e) => e.partial || e.sourceByteStart !== undefined)
  )
    return;
  const selected = file.selected.filter((r) => r.sourceByteStart === undefined);
  if (!selected.length) return;
  const calls = await runParser<Call[]>(
    "calls",
    JSON.stringify({ source: snapshot.source, ranges: selected }),
    signal,
  );
  if (!calls?.length) return;
  const lines = snapshot.source.split("\n");
  const valid = (r: Range) =>
    Number.isSafeInteger(r.startLine) &&
    Number.isSafeInteger(r.endLine) &&
    r.startLine >= 1 &&
    r.endLine >= r.startLine &&
    r.endLine <= lines.length;
  if (
    calls.some(
      (c) =>
        !valid(c) ||
        !valid(c.ownerHeader) ||
        !Array.isArray(c.unknownEarlierBases) ||
        c.unknownEarlierBases.some((b) => typeof b !== "string"),
    )
  )
    return;
  const source = (r: Range) => lines.slice(r.startLine - 1, r.endLine).join("\n");
  const kept = calls.filter((c) => Buffer.byteLength(source(c)) <= 24_000);
  if (!kept.length) return;
  const ranges = [
    ...original.map((e) => ({ ...e.range })),
    ...kept.flatMap((c) => [{ startLine: c.startLine, endLine: c.endLine }, c.ownerHeader]),
  ].sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r.startLine <= last.endLine + 1) last.endLine = Math.max(last.endLine, r.endLine);
    else merged.push({ ...r });
  }
  return {
    presentationExcerpts: merged.map((range) => ({ range, source: source(range) })),
    callLeads: kept.map((c) => ({
      caller: c.caller,
      name: c.name,
      range: { startLine: c.startLine, endLine: c.endLine },
      unknownEarlierBases: c.unknownEarlierBases,
    })),
  };
}
