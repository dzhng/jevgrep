// Rendering only; all offsets refer to the original UTF-8 source, never normalized text.
export function preview({ text, budget }, matches) {
  if (!Number.isSafeInteger(budget) || budget < 256)
    throw new Error("Preview allowance must be at least 256 bytes");
  const lines = text.split("\n"),
    sourceBytes = Buffer.byteLength(text),
    offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += Buffer.byteLength(line) + 1;
  }
  if (sourceBytes <= budget)
    return {
      text,
      spans: [
        {
          startLine: 1,
          endLine: lines.length,
          text,
          basis: "complete source",
          sourceByteStart: 0,
          sourceByteEnd: sourceBytes,
        },
      ],
      truncated: false,
      sourceBytes,
      previewBytes: sourceBytes,
      method: "complete source",
      matchedDeclarations: 0,
      unrepresentedMatches: 0,
    };
  const spans = [],
    parts = [],
    seen = new Set();
  let used = 0;
  function clip(raw, limit, fromEnd = false) {
    let start = fromEnd ? Math.max(0, raw.length - limit) : 0,
      end = fromEnd ? raw.length : Math.min(raw.length, limit);
    while (start < end && (raw[start] & 0xc0) === 0x80) start++;
    while (end < raw.length && end > start && (raw[end] & 0xc0) === 0x80) end--;
    return raw.subarray(start, end).toString("utf8");
  }
  function add(start, end, allowance, basis, fromEnd = false) {
    if (start > end) return false;
    start = Math.max(1, start);
    end = Math.min(end, lines.length);
    allowance = Math.min(allowance, budget - used);
    const header = `--- source lines ${start}-${end}; ${basis}; may be clipped ---\n`;
    const remaining = Math.floor(allowance - Buffer.byteLength(header) - 1);
    if (remaining <= 0) return false;
    let selected = [],
      size = 0,
      partial = false;
    const candidates = lines.slice(start - 1, end);
    if (fromEnd) candidates.reverse();
    for (let line of candidates) {
      const cost = Buffer.byteLength(line) + (selected.length ? 1 : 0);
      if (size + cost > remaining) {
        if (!selected.length) {
          line = clip(Buffer.from(line), remaining, fromEnd);
          if (line) {
            selected = [line];
            partial = true;
          }
        }
        break;
      }
      selected.push(line);
      size += cost;
    }
    if (!selected.length) return false;
    if (fromEnd) {
      selected.reverse();
      start = end - selected.length + 1;
    }
    const actualEnd = start + selected.length - 1,
      body = selected.join("\n"),
      identity = JSON.stringify([start, actualEnd, body]);
    if (seen.has(identity)) return true;
    const label = `--- source lines ${start}-${actualEnd}; ${basis}${partial ? "; partial line" : ""} ---\n`,
      rendered = label + body + "\n";
    if (Buffer.byteLength(rendered) > allowance) return false;
    const byteStart =
      offsets[start - 1] +
      (partial && fromEnd ? Buffer.byteLength(lines[start - 1]) - Buffer.byteLength(body) : 0);
    seen.add(identity);
    spans.push({
      sourceByteStart: byteStart,
      sourceByteEnd: byteStart + Buffer.byteLength(body),
      startLine: start,
      endLine: actualEnd,
      text: body,
      basis,
      partialLine: partial,
    });
    parts.push(rendered);
    used += Buffer.byteLength(rendered);
    return true;
  }
  function inline(line, startColumn, endColumn, allowance, basis) {
    const raw = Buffer.from(lines[line - 1]);
    const start = Buffer.byteLength(lines[line - 1].slice(0, startColumn)),
      end = Math.min(raw.length, Buffer.byteLength(lines[line - 1].slice(0, endColumn)));
    allowance = Math.min(allowance, budget - used);
    const longest = `--- source line ${line}, bytes ${start}-${end}; ${basis}; partial line ---\n`,
      room = Math.floor(allowance - Buffer.byteLength(longest) - 1);
    if (room <= 0) return false;
    const body = clip(raw.subarray(start, end), room);
    if (!body) return false;
    const actualEnd = start + Buffer.byteLength(body),
      label = `--- source line ${line}, bytes ${start}-${actualEnd}; ${basis}; partial line ---\n`,
      rendered = label + body + "\n";
    const identity = JSON.stringify([line, start, actualEnd, body]);
    if (seen.has(identity)) return true;
    seen.add(identity);
    parts.push(rendered);
    used += Buffer.byteLength(rendered);
    spans.push({
      sourceByteStart: offsets[line - 1] + start,
      sourceByteEnd: offsets[line - 1] + actualEnd,
      startLine: line,
      endLine: line,
      columnStartByte: start,
      columnEndByte: actualEnd,
      text: body,
      basis,
      partialLine: true,
    });
    return true;
  }
  add(1, lines.length, Math.floor(budget / 4), "opening context");
  let unrepresented = 0;
  if (matches?.length) {
    const perMatch = Math.max(1, Math.floor(Math.floor((budget - used) * 0.75) / matches.length));
    for (const m of matches) {
      let contextCost = 0;
      if (m.context) {
        const before = used;
        add(
          m.context.startLine,
          m.context.endLine,
          Math.min(Math.floor(perMatch / 3), 512),
          "enclosing class context",
        );
        contextCost = used - before;
      }
      const before = used;
      add(
        m.start,
        m.header_end,
        Math.min(Math.floor((perMatch - contextCost) / 3), 512),
        "query-named declaration header",
      );
      if (m.header_column_end)
        inline(
          m.header_line,
          0,
          m.header_column_end,
          Math.min(Math.floor((perMatch - contextCost) / 3), 512),
          "query-named declaration header",
        );
      const remaining = perMatch - contextCost - (used - before);
      let represented;
      if (m.body_column) {
        const before = used;
        represented = inline(
          m.body_start,
          m.body_column,
          lines[m.body_start - 1].length,
          remaining,
          "query-named implementation",
        );
        if (m.end > m.body_start)
          add(
            m.body_start + 1,
            m.end,
            remaining - (used - before),
            "query-named implementation continuation",
          );
      } else represented = add(m.body_start, m.end, remaining, "query-named implementation");
      if (!represented) unrepresented++;
    }
  }
  const positions = [
    ...new Set([
      Math.floor(lines.length / 3) + 1,
      Math.floor((2 * lines.length) / 3) + 1,
      Math.max(1, lines.length - 31),
    ]),
  ].sort((a, b) => a - b);
  positions.forEach((start, i) =>
    add(
      start,
      Math.min(start + 31, lines.length),
      Math.floor((budget - used) / (positions.length - i)),
      "distributed context",
      i === positions.length - 1,
    ),
  );
  return {
    text: parts.join(""),
    spans,
    truncated: true,
    sourceBytes,
    previewBytes: used,
    method: "query-assisted source windows",
    matchedDeclarations: matches?.length ?? 0,
    unrepresentedMatches: unrepresented,
    parseUnavailable: matches === null,
    scope:
      "Sampled content only; missing terms or unseen ranges do not establish irrelevance. No additional source files read.",
  };
}
