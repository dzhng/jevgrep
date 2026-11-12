import ts from "typescript";
import { basename, extname } from "node:path";
import { runParser } from "./parser.ts";

export type Range = { startLine: number; endLine: number };
import type { Snapshot } from "./filesystem";
export type SourceUnit = {
  id: string;
  name: string;
  range: Range;
  sourceByteStart: number;
  sourceByteEnd: number;
  partial?: boolean;
  ownerHeaders?: Range[];
  /** Structural class, impl or module source between members. The name alone cannot identify
   * it: a real member named `context` shares the `<Owner>.context` name. */
  classContext?: true;
};
export type Inspection = {
  units: SourceUnit[];
  comments: Range[];
  mode: "python" | "typescript" | "go" | "rust" | "text";
  fallback?: "unsupported" | "syntax" | "size";
};

export function resolveLanguage(
  path: string,
  source: string,
): "python" | "go" | "rust" | "TS" | "TSX" | "JS" | "JSX" | undefined {
  if (/\.pyi?$/.test(path)) return "python";
  if (path.endsWith(".tsx")) return "TSX";
  if (path.endsWith(".jsx")) return "JSX";
  if (/\.[cm]?js$/.test(path)) return "JS";
  if (/\.[cm]?ts$/.test(path)) return "TS";
  if (path.endsWith(".go")) return "go";
  if (path.endsWith(".rs")) return "rust";
  if (extname(path) !== "" || !source.startsWith("#!")) return;
  const [program = "", ...args] = source.split("\n", 1)[0]!.slice(2).trim().split(/\s+/);
  // env options, the operand of -u/-C/-P/-a and NAME=VALUE assignments come before the command.
  const command = args.find(
    (arg, index) =>
      !arg.startsWith("-") && !arg.includes("=") && !/^-[uCPa]$/.test(args[index - 1] ?? ""),
  );
  const interpreter = basename(basename(program) === "env" ? (command ?? "") : program);
  if (/^(?:python|pypy)(?:\d+(?:\.\d+)?)?$/.test(interpreter)) return "python";
  if (interpreter === "node" || interpreter === "nodejs") return "JS";
  // Bun, tsx and Deno run TypeScript by default; the TS parser also accepts plain JavaScript.
  if (interpreter === "bun" || interpreter === "tsx" || interpreter === "deno") return "TS";
}

type SourceText = { bytes: Buffer; offsets: number[]; lineCount: number };
const sourceTexts = new WeakMap<Snapshot, { source: string; text: SourceText }>();
function sourceText(snapshot: Snapshot): SourceText {
  const { source } = snapshot;
  const cached = sourceTexts.get(snapshot);
  // Readonly is a type-level promise; mutable callers must not receive stale bytes.
  if (cached?.source === source) return cached.text;
  const lines = source.split("\n"),
    offsets = [0];
  for (const line of lines) offsets.push(offsets.at(-1)! + Buffer.byteLength(line) + 1);
  const text = { bytes: Buffer.from(source), offsets, lineCount: lines.length };
  sourceTexts.set(snapshot, { source, text });
  return text;
}
function textUnits(
  text: SourceText,
  range: Range,
  name: string,
  maxBytes: number,
  partial: boolean,
): SourceUnit[] {
  const { bytes: raw, offsets, lineCount } = text;
  const units: SourceUnit[] = [];
  const first = Math.min(raw.length, offsets[range.startLine - 1] ?? raw.length);
  const end = Math.min(raw.length, offsets[range.endLine] ?? raw.length);
  let start = first,
    line = range.startLine;
  while (start < end) {
    let finish = Math.min(end, start + maxBytes);
    if (finish < end) {
      while (finish > start && (raw[finish]! & 0xc0) === 0x80) finish--;
      const newline = raw.subarray(start, finish).lastIndexOf(10);
      if (newline >= 0) finish = start + newline + 1;
    }
    const part = raw.subarray(start, finish).toString("utf8");
    const newlines = part.split("\n").length - 1;
    const endLine = line + newlines - (part.endsWith("\n") ? 1 : 0);
    units.push({
      id: `${name}:${start}:${finish}`,
      name,
      range: { startLine: line, endLine },
      sourceByteStart: start,
      sourceByteEnd: finish,
      ...(partial || first !== start || finish !== end ? { partial: true } : {}),
    });
    line += newlines;
    start = finish;
  }
  // The final empty line has no bytes but still belongs to the snapshot coordinates.
  if (raw.at(-1) === 10 && range.endLine === lineCount && units.length)
    units.at(-1)!.range.endLine = lineCount;
  return units;
}

export async function inspect(
  snapshot: Snapshot,
  options: { maxUnitBytes?: number; maxParseBytes?: number; signal?: AbortSignal } = {},
): Promise<Inspection> {
  const maxUnitBytes = options.maxUnitBytes ?? 24_000;
  const maxParseBytes = options.maxParseBytes ?? 1_000_000;
  if (
    !Number.isSafeInteger(maxUnitBytes) ||
    maxUnitBytes < 4 ||
    !Number.isSafeInteger(maxParseBytes) ||
    maxParseBytes < 1
  )
    throw new Error(
      "Source bounds must be integers; unit bytes at least 4 and parse bytes positive",
    );
  const { source, path } = snapshot;
  const language = resolveLanguage(path, source);
  const text = sourceText(snapshot);
  // Context windows use conservative whole-line Python comments, including inside multiline strings.
  const pythonComments =
    language === "python"
      ? source
          .split("\n")
          .flatMap((line, index) =>
            /^\s*#/.test(line) ? [{ startLine: index + 1, endLine: index + 1 }] : [],
          )
      : [];
  const fallback = (reason: Inspection["fallback"]): Inspection => ({
    mode: "text",
    fallback: reason,
    comments: pythonComments,
    units: source
      ? textUnits(text, { startLine: 1, endLine: text.lineCount }, "source", maxUnitBytes, true)
      : [],
  });
  if (Buffer.byteLength(source) > maxParseBytes) return fallback("size");
  let units: { name: string; range: Range; ownerHeaders?: Range[]; classContext?: true }[] = [],
    comments: Range[] = [],
    mode: Inspection["mode"];
  let syntaxFallback = false;
  if (language === "python") {
    // A missing/incompatible packaged parser is a setup failure, never syntax fallback.
    const parsed = await runParser<
      Array<Range & { name: string; ownerHeaders: Range[]; classContext?: boolean }>
    >("inspect", source, options.signal);
    if (parsed === null) return fallback("syntax");
    units = parsed.map(({ name, startLine, endLine, ownerHeaders, classContext }) => ({
      name,
      range: { startLine, endLine },
      ownerHeaders,
      ...(classContext === true ? { classContext: true as const } : {}),
    }));
    comments = pythonComments;
    mode = "python";
  } else if (language === "TS" || language === "TSX" || language === "JS" || language === "JSX") {
    let file: ts.SourceFile;
    try {
      file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind[language]);
    } catch (error) {
      // Deeply nested source can exhaust the parser's call stack: unparseable here, like a syntax error.
      if (error instanceof RangeError) return fallback("syntax");
      throw error;
    }
    syntaxFallback = !!(file as ts.SourceFile & { parseDiagnostics?: unknown[] }).parseDiagnostics
      ?.length;
    const line = (position: number) => file.getLineAndCharacterOfPosition(position).line + 1;
    const add = (node: ts.Node, prefix = "", ownerHeaders: Range[] = []) => {
      const named = node as ts.Node & { name?: ts.Node };
      const name =
        prefix +
        (named.name?.getText(file) ||
          (ts.isVariableStatement(node)
            ? node.declarationList.declarations.map((d) => d.name.getText(file)).join(", ")
            : "source"));
      if (ts.isClassDeclaration(node) && node.members.length) {
        const start = line(node.getStart(file)),
          first = line(node.members[0]!.getStart(file));
        const header = first > start ? { startLine: start, endLine: first - 1 } : undefined;
        const headers = header ? [...ownerHeaders, header] : ownerHeaders;
        if (header)
          units.push({
            name: name + ".context",
            range: header,
            ownerHeaders: headers,
            classContext: true,
          });
        for (const member of node.members) add(member, name + ".", headers);
      } else
        units.push({
          name,
          ownerHeaders,
          range: {
            startLine: line(node.getStart(file)),
            endLine: line(Math.max(node.getStart(file), node.end - 1)),
          },
        });
    };
    if (!syntaxFallback) for (const statement of file.statements) add(statement);
    // Pre-order walk with an explicit stack: long generated expressions nest deeper than the call
    // stack allows. Children are pushed in reverse so they are visited in source order.
    const walk: ts.Node[] = [file];
    while (walk.length) {
      const node = walk.pop()!;
      for (const comment of [
        ...(ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []),
        ...(ts.getTrailingCommentRanges(source, node.end) ?? []),
      ])
        comments.push({ startLine: line(comment.pos), endLine: line(comment.end - 1) });
      const children: ts.Node[] = [];
      // The callback must return undefined: a truthy result stops forEachChild early.
      ts.forEachChild(node, (child) => {
        children.push(child);
      });
      for (let index = children.length - 1; index >= 0; index--) walk.push(children[index]!);
    }
    mode = "typescript";
  } else if (language === "go" || language === "rust") {
    const parsed = await runParser<{ units: typeof units; comments: Range[] }>(
      "declarations",
      JSON.stringify({ source, language }),
      options.signal,
    );
    if (!parsed) return fallback("syntax");
    units = parsed.units.map(({ classContext, ...unit }) => ({
      ...unit,
      ...(classContext === true ? { classContext: true as const } : {}),
    }));
    comments = parsed.comments;
    mode = language;
  } else return fallback("unsupported");
  comments = [...new Map(comments.map((r) => [`${r.startLine}:${r.endLine}`, r])).values()].sort(
    (a, b) => a.startLine - b.startLine,
  );
  // Invalid declarations fall back to text, but comments still own the context-window boundaries.
  if (syntaxFallback) return { ...fallback("syntax"), comments };
  if (!units.length && source)
    return {
      units: textUnits(
        text,
        { startLine: 1, endLine: text.lineCount },
        "source",
        maxUnitBytes,
        true,
      ),
      comments,
      mode,
    };
  return {
    mode,
    comments,
    units: units.flatMap((unit) => {
      // Parser ranges and returned byte spans must remain tied to the original snapshot.
      const start = Math.min(
        text.bytes.length,
        text.offsets[unit.range.startLine - 1] ?? text.bytes.length,
      );
      const end = Math.min(
        text.bytes.length,
        text.offsets[unit.range.endLine] ?? text.bytes.length,
      );
      const marker = unit.classContext ? { classContext: true as const } : {};
      if (end - start <= maxUnitBytes)
        return [
          {
            id: `${unit.name}:${start}:${end}`,
            name: unit.name,
            range: unit.range,
            ownerHeaders: unit.ownerHeaders,
            sourceByteStart: start,
            sourceByteEnd: end,
            ...marker,
          },
        ];
      return textUnits(text, unit.range, unit.name, maxUnitBytes, true).map((part) => ({
        ...part,
        ownerHeaders: unit.ownerHeaders,
        ...marker,
      }));
    }),
  };
}

/** Additive policy only: callers retain selected ranges separately. */
export async function pythonNeighborhood(
  snapshot: Snapshot,
  selected: Range[],
  signal?: AbortSignal,
): Promise<Range[]> {
  if (
    resolveLanguage(snapshot.path, snapshot.source) !== "python" ||
    Buffer.byteLength(snapshot.source) > 1_000_000
  )
    return [];
  return (
    (await runParser<Range[]>(
      "neighborhood",
      JSON.stringify({ source: snapshot.source, ranges: selected }),
      signal,
    )) ?? []
  );
}

export type PreviewSpan = Range & {
  text: string;
  basis: string;
  sourceByteStart: number;
  sourceByteEnd: number;
  partialLine?: boolean;
  columnStartByte?: number;
  columnEndByte?: number;
};
export type SourcePreview = {
  text: string;
  spans: PreviewSpan[];
  truncated: boolean;
  sourceBytes: number;
  previewBytes: number;
  method: string;
  matchedDeclarations: number;
  unrepresentedMatches: number;
  parseUnavailable?: boolean;
  scope?: string;
};
/** The preview worker handles Python declarations and generic text windows. */
export async function pythonPreview(
  snapshot: Snapshot,
  query: string,
  budget = 16_384,
  signal?: AbortSignal,
): Promise<SourcePreview | null> {
  if (!Number.isSafeInteger(budget) || budget < 256)
    throw new Error("Preview allowance must be at least 256 bytes");
  const result = await runParser<SourcePreview>(
    "preview",
    JSON.stringify({
      text: snapshot.source,
      language: resolveLanguage(snapshot.path, snapshot.source),
      query,
      budget,
    }),
    signal,
  );
  if (result?.truncated) {
    const raw = Buffer.from(snapshot.source),
      lines = snapshot.source.split("\n");
    if (
      !result.spans.length ||
      result.spans.some((span) => {
        if (
          !Number.isInteger(span.startLine) ||
          !Number.isInteger(span.endLine) ||
          span.startLine < 1 ||
          span.endLine < span.startLine ||
          span.endLine > lines.length
        )
          return true;
        if (
          !Number.isInteger(span.sourceByteStart) ||
          !Number.isInteger(span.sourceByteEnd) ||
          span.sourceByteStart < 0 ||
          span.sourceByteEnd < span.sourceByteStart ||
          span.sourceByteEnd > raw.length ||
          raw.subarray(span.sourceByteStart, span.sourceByteEnd).toString() !== span.text
        )
          return true;
        const original = lines.slice(span.startLine - 1, span.endLine).join("\n");
        if (span.columnStartByte !== undefined)
          return (
            span.startLine !== span.endLine ||
            !Number.isInteger(span.columnStartByte) ||
            !Number.isInteger(span.columnEndByte) ||
            span.columnStartByte < 0 ||
            span.columnEndByte! < span.columnStartByte ||
            Buffer.from(original).subarray(span.columnStartByte, span.columnEndByte).toString() !==
              span.text
          );
        return span.partialLine ? !original.includes(span.text) : original !== span.text;
      })
    )
      return null;
  }
  return result;
}

/** Byte spans include original line endings; never widen a partial unit to whole lines. */
export function sourceForUnit(snapshot: Snapshot, unit: SourceUnit): string {
  return sourceText(snapshot)
    .bytes.subarray(unit.sourceByteStart, unit.sourceByteEnd)
    .toString("utf8");
}

/** Complete-file fragments keep admission independent of declaration-name sampling. */
export function splitSource(snapshot: Snapshot, maxBytes = 12_000): SourceUnit[] {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 4)
    throw new Error("Invalid source byte allowance");
  const text = sourceText(snapshot);
  return textUnits(text, { startLine: 1, endLine: text.lineCount }, "source", maxBytes, false);
}
