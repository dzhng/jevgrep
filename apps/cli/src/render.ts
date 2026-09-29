import type { RetrievalResult } from "@repo/core";

function quote(value: string): string {
  return JSON.stringify(value).replace(
    /[\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export const DEFAULT_MAX_SOURCE_BYTES = 0;

/** Present source before detailed reading leads so truncated output remains useful. */
export function renderResult(
  result: RetrievalResult,
  maxSourceBytes = DEFAULT_MAX_SOURCE_BYTES,
): string {
  let remaining = maxSourceBytes || Infinity;
  const files = [...result.files]
    .sort(
      (a, b) =>
        (b.priority ?? b.score) - (a.priority ?? a.score) ||
        b.score - a.score ||
        a.path.localeCompare(b.path),
    )
    .map((file) => {
      let omitted = file.sourceOmitted;
      const excerpts = (file.presentationExcerpts ?? file.excerpts).filter(({ source }) => {
        const bytes = Buffer.byteLength(source);
        if (bytes > remaining) {
          omitted = true;
          return false;
        }
        remaining -= bytes;
        return true;
      });
      return { file, excerpts, omitted };
    });
  const context = result.repositoryContext;
  const omittedCount = files.filter(({ omitted }) => omitted).length;
  const lines = [
    `Jevgrep: ${files.length} relevant files${result.status !== "complete" ? "; discovery incomplete" : ""}.`,
    "Symbols use name@start-end. Roles are estimates; locations-only files remain reading leads.",
    `AGENTS.md lookup (root and returned-file ancestors): ${context.instructionFiles.length ? context.instructionFiles.map(quote).join(", ") : "none found"}${context.instructionLookupIncomplete ? "; lookup incomplete" : ""}.`,
    ...(result.status === "interrupted" ? ["Interrupted."] : []),
    ...(omittedCount ? [`Source omitted: ${omittedCount} file(s).`] : []),
    ...(result.warnings ?? []).map(({ kind, count }) => `Warning: ${quote(kind)}: ${count}`),
    ...result.issues.map(({ kind, count }) => `Issue: ${quote(kind)}: ${count}`),
    ...(result.providerFailure ? [`Provider error: ${quote(result.providerFailure)}`] : []),
    ...files.flatMap(({ file, excerpts, omitted }) => [
      `- ${quote(file.path)} — ${file.roles.join(", ") || "relevant; role uncertain"}; ${excerpts.length ? "source below" : omitted ? "source omitted" : "locations only"}`,
    ]),
    "End file list. Declaration locations follow source.",
  ];
  for (const { file, excerpts } of files)
    for (const { range, source, partial, sourceByteStart, sourceByteEnd } of excerpts) {
      const bytes =
        sourceByteStart === undefined ? "" : `; UTF-8 bytes [${sourceByteStart}, ${sourceByteEnd})`;
      const annotation =
        partial || sourceByteStart !== undefined ? ` (partial excerpt${bytes})` : "";
      const sourceLines = source.split("\n");
      if (
        (partial || sourceByteStart !== undefined) &&
        sourceLines.length > range.endLine - range.startLine + 1 &&
        sourceLines.at(-1) === ""
      )
        sourceLines.pop();
      lines.push(
        "",
        `Source block ${quote(file.path)} lines ${range.startLine}-${range.endLine}${annotation}:`,
      );
      let fenceLength = 3;
      for (const match of source.matchAll(/`+/g))
        fenceLength = Math.max(fenceLength, match[0].length + 1);
      const fence = "`".repeat(fenceLength);
      lines.push(fence);
      for (const line of sourceLines) lines.push(line);
      lines.push(fence);
    }
  lines.push("", "Declaration locations:");
  for (const { file, omitted } of files) {
    lines.push(
      `- ${quote(file.path)}`,
      ...[...file.leads]
        .sort((a, b) => a.range.startLine - b.range.startLine)
        .map((lead) => `  ${lead.name}@${lead.range.startLine}-${lead.range.endLine}`),
      ...(file.callLeads ?? []).map(
        (call) =>
          `  Possible local call ${call.caller} -> ${call.name}: lines ${call.range.startLine}-${call.range.endLine}${call.unknownEarlierBases.length ? `; earlier base(s) ${call.unknownEarlierBases.map(quote).join(", ")} not inspected` : ""}; runtime dispatch not verified.`,
      ),
      ...(omitted ? ["  Some source omitted; locations remain available."] : []),
    );
  }
  return lines.join("\n") + "\n\nEnd context.\n";
}
