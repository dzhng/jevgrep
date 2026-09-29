import { Parser, Language, Query } from "web-tree-sitter";
import { fileURLToPath } from "node:url";
import { declarations } from "./parser-declarations.mjs";
import { preview } from "./parser-preview.mjs";
let initialized;
const languages = new Map();
async function parse(source, action, languageName = "python") {
  // Retrieval coordinates count LF lines; normalizing bare CR would mislabel original bytes.
  if (languageName === "python" && /\r(?!\n)/.test(source)) return null;
  await (initialized ??= Parser.init());
  if (!languages.has(languageName))
    languages.set(
      languageName,
      await Language.load(
        fileURLToPath(
          new URL(`../assets/tree-sitter/tree-sitter-${languageName}.wasm`, import.meta.url),
        ),
      ),
    );
  const parser = new Parser();
  let tree;
  try {
    parser.setLanguage(languages.get(languageName));
    tree = parser.parse(source);
    if (!tree || tree.rootNode.hasError) return null;
    // Tree-sitter queries stop reporting matches beyond 65,535 levels of nesting and slow down
    // sharply near that depth: 70,000 chained `+` took 8 s, 100,000 took 74 s. Treat such
    // generated source as unparseable, like a syntax error, before any query runs.
    if (languageName === "python" && deeperThan(tree, maxTreeDepth)) return null;
    if (languageName === "python" && !validPython(tree.rootNode)) return null;
    return action(tree.rootNode);
  } finally {
    tree?.delete();
    parser.delete();
  }
}
const field = (n, name) => n.childForFieldName(name);
// Well below the query engine's 65,535-level limit; ordinary source nests far less.
const maxTreeDepth = 50_000;
/** Visits every node with a tree cursor, which neither recurses nor allocates node objects. */
function deeperThan(tree, limit) {
  const cursor = tree.walk();
  try {
    let depth = 0;
    for (;;) {
      if (cursor.gotoFirstChild()) {
        if (++depth > limit) return true;
        continue;
      }
      while (!cursor.gotoNextSibling()) {
        if (!cursor.gotoParent()) return false;
        depth--;
      }
    }
  } finally {
    cursor.delete();
  }
}
function unparenthesized(node) {
  while (node?.type === "parenthesized_expression")
    node = node.namedChildren.find((child) => child.type !== "comment");
  return node;
}
const definition = (n) => (n.type === "decorated_definition" ? field(n, "definition") : n);
const isDefinition = (n) =>
  ["function_definition", "class_definition"].includes(definition(n)?.type);
const body = (n) => field(n, "body")?.namedChildren.filter((n) => n.type !== "comment") ?? [];
const name = (n) => field(n, "name")?.text.normalize("NFKC") ?? "";
function* walk(root) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    yield n;
    for (const c of n.namedChildren.toReversed()) stack.push(c);
  }
}
// Tree-sitter deliberately recognizes some Python 2 syntax. Reject those forms, but
// accept modern Python syntax: this is structural recognition, not ast.compile validation.
let syntaxChecks;
function validPython(root) {
  // Let the native query engine skip nodes that cannot affect this compatibility policy.
  syntaxChecks ??= new Query(
    languages.get("python"),
    `[
    (exec_statement) (print_statement) (except_clause) (raise_statement) (for_in_clause)
    (concatenated_string) (function_definition) (class_definition) (integer)
    (comparison_operator) (string_start) (string) (parameters) (lambda_parameters) (delete_statement)
  ] @check`,
  );
  for (const { node: n } of syntaxChecks.captures(root)) {
    if (
      n.type === "exec_statement" ||
      (n.type === "print_statement" && n.namedChildren[0]?.type !== "chevron")
    )
      return false;
    if (n.type === "except_clause" && n.childrenForFieldName("value").length > 1) return false;
    if (n.type === "raise_statement" && n.namedChildren[0]?.type === "expression_list")
      return false;
    if (n.type === "for_in_clause" && n.childrenForFieldName("right").length > 1) return false;
    if (
      n.type === "concatenated_string" &&
      new Set(
        n.namedChildren.filter((c) => c.type === "string").map((c) => /^[ru]*b/i.test(c.text)),
      ).size > 1
    )
      return false;
    if (["function_definition", "class_definition"].includes(n.type) && !body(n).length)
      return false;
    if (n.type === "integer" && (/L$/i.test(n.text) || /^0[0-9_]*[1-9][0-9_]*$/.test(n.text)))
      return false;
    if (n.type === "comparison_operator" && n.children.some((c) => c.text === "<>")) return false;
    if (n.type === "string_start" && /^(?:ur|ru)/i.test(n.text)) return false;
    if (n.type === "string" && n.text.startsWith("`")) return false;
    if (
      ["parameters", "lambda_parameters"].includes(n.type) &&
      n.namedChildren.some(
        (c) => c.type === "tuple_pattern" || field(c, "name")?.type === "tuple_pattern",
      )
    )
      return false;
    if (
      n.type === "delete_statement" &&
      n.namedChildren.some(
        (c) =>
          !["identifier", "attribute", "subscript", "expression_list", "tuple", "list"].includes(
            unparenthesized(c).type,
          ),
      )
    )
      return false;
  }
  return true;
}
// Python AST ends exclude trailing comments. Tree-sitter includes them in blocks.
function endLine(n) {
  let last = n;
  while (last.children.length) {
    const child = last.children.filter((c) => c.type !== "comment").at(-1);
    if (!child) break;
    last = child;
  }
  return last.endPosition.row + 1;
}
function startLine(n) {
  if (n.type === "decorated_definition") {
    const decorator = n.namedChildren.find((c) => c.type === "decorator");
    const expression = unparenthesized(decorator?.namedChildren[0]);
    return (expression ?? decorator ?? n).startPosition.row + 1;
  }
  return n.startPosition.row + 1;
}
const range = (n) => ({ startLine: startLine(n), endLine: endLine(n) });
function inspectPython(root) {
  const units = [];
  function visit(nodes, prefix = "", headers = []) {
    for (const wrapped of nodes) {
      if (!isDefinition(wrapped)) continue;
      const n = definition(wrapped),
        named = prefix + name(n),
        r = range(wrapped);
      const children = body(n).filter(isDefinition);
      if (n.type === "class_definition" && children.length) {
        const first = startLine(children[0]);
        const own =
          first > r.startLine
            ? [...headers, { startLine: r.startLine, endLine: first - 1 }]
            : headers;
        let cursor = r.startLine;
        for (const child of children) {
          const start = startLine(child);
          if (cursor < start)
            units.push({
              name: named + ".context",
              startLine: cursor,
              endLine: start - 1,
              ownerHeaders: own,
              classContext: true,
            });
          visit([child], named + ".", own);
          cursor = endLine(child) + 1;
        }
        if (cursor <= r.endLine)
          units.push({
            name: named + ".context",
            startLine: cursor,
            endLine: r.endLine,
            ownerHeaders: own,
            classContext: true,
          });
      } else units.push({ name: named, ...r, ownerHeaders: headers });
    }
  }
  visit(root.namedChildren);
  return units;
}
function neighborhood(root, ranges) {
  const extra = [];
  for (const wrapped of walk(root)) {
    if (wrapped.type === "function_definition" && wrapped.parent?.type === "decorated_definition")
      continue;
    const n = definition(wrapped);
    if (n?.type !== "function_definition") continue;
    const block = wrapped.parent,
      owner = block?.parent;
    if (owner?.type !== "class_definition") continue;
    const r = range(wrapped);
    if (!ranges.some((s) => s.startLine <= r.endLine && s.endLine >= r.startLine)) continue;
    const siblings = body(owner).filter(isDefinition);
    const ownerWrapper = owner.parent?.type === "decorated_definition" ? owner.parent : owner;
    const start = startLine(ownerWrapper),
      end = Math.min(...siblings.map((s) => startLine(s) - 1), start + 39);
    if (start <= end) extra.push({ startLine: start, endLine: end });
    const index = siblings.findIndex((s) => s.id === wrapped.id);
    for (const sibling of siblings.slice(Math.max(0, index - 1), index + 2)) {
      const rr = range(sibling);
      if (sibling.id !== wrapped.id && rr.endLine - rr.startLine + 1 <= 40) extra.push(rr);
    }
  }
  return extra;
}
function previewMatches(root, tokens) {
  const matches = [];
  for (const n of walk(root)) {
    if (!["class_definition", "function_definition"].includes(n.type) || !tokens.has(name(n)))
      continue;
    const wrapped = n.parent?.type === "decorated_definition" ? n.parent : n;
    const statements = body(n),
      first = statements[0];
    if (!first) continue;
    let implementation = first,
      expr = unparenthesized(
        first.type === "expression_statement" ? first.namedChildren[0] : undefined,
      );
    const stringNodes =
      expr?.type === "concatenated_string"
        ? expr.namedChildren.filter((c) => c.type === "string")
        : [expr];
    if (
      stringNodes.length &&
      stringNodes.every((s) => s?.type === "string" && !/^[rub]*[fb]/i.test(s.text)) &&
      statements.length > 1
    )
      implementation = statements[1];
    let owner = n.parent;
    while (owner && owner.type !== "class_definition") owner = owner.parent;
    const context = owner
      ? {
          startLine: startLine(
            owner.parent?.type === "decorated_definition" ? owner.parent : owner,
          ),
          endLine: body(owner)[0].startPosition.row,
        }
      : null;
    matches.push({
      start: startLine(wrapped),
      end: endLine(n),
      context,
      header_end: first.startPosition.row,
      header_line: n.startPosition.row + 1,
      header_column_end:
        first.startPosition.row === n.startPosition.row ? first.startPosition.column : 0,
      body_start: implementation.startPosition.row + 1,
      body_column:
        implementation !== first && implementation.startPosition.row === first.startPosition.row
          ? implementation.startPosition.column
          : 0,
    });
  }
  return matches.sort((a, b) => a.start - b.start || a.end - b.end);
}
function assignsSelf(target) {
  if (!target) return false;
  if (target.type === "identifier") return target.text.normalize("NFKC") === "self";
  if (["attribute", "subscript"].includes(target.type)) return false;
  return target.namedChildren.some(assignsSelf);
}
function uniqueDefinitions(nodes) {
  const map = new Map(),
    duplicates = new Set();
  for (const node of nodes) {
    const key = name(definition(node));
    if (map.has(key)) duplicates.add(key);
    map.set(key, node);
  }
  for (const key of duplicates) map.delete(key);
  return map;
}
function calls(root, source, ranges) {
  const definitions = root.namedChildren
    .map(definition)
    .filter((n) => n?.type === "class_definition");
  const classes = uniqueDefinitions(definitions);
  const methods = new Map(),
    bases = new Map();
  for (const [key, n] of classes) {
    const defs = body(n).filter((c) => definition(c)?.type === "function_definition");
    methods.set(key, uniqueDefinitions(defs));
    // Only bare identifiers can resolve to local classes. Other bases remain explicitly unknown.
    bases.set(
      key,
      (field(n, "superclasses")?.namedChildren ?? [])
        .filter((c) => c.type !== "keyword_argument" && c.type !== "comment")
        .map((c) => unparenthesized(c).text.normalize("NFKC")),
    );
  }
  const memo = new Map();
  function mro(key, seen = new Set()) {
    if (seen.has(key)) throw new Error("cyclic inheritance");
    if (memo.has(key)) return [...memo.get(key)];
    const parents = bases.get(key) ?? [],
      next = new Set([...seen, key]);
    const sequences = [...parents.map((p) => mro(p, next)), [...parents]],
      result = [key];
    while (sequences.some((s) => s.length)) {
      const active = sequences.filter((s) => s.length),
        head = active.map((s) => s[0]).find((h) => !active.some((s) => s.slice(1).includes(h)));
      if (head === undefined) throw new Error("inconsistent inheritance");
      result.push(head);
      for (const s of active) if (s[0] === head) s.shift();
    }
    memo.set(key, result);
    return [...result];
  }
  function bodyNodes(n) {
    const result = [],
      stack = [n];
    while (stack.length) {
      const node = stack.pop();
      result.push(node);
      for (const c of node.namedChildren.toReversed())
        if (
          !["function_definition", "class_definition", "lambda", "decorated_definition"].includes(
            c.type,
          )
        )
          stack.push(c);
    }
    return result;
  }
  const result = [],
    seen = new Set(),
    lines = source.split("\n");
  for (const [owner, defs] of methods)
    for (const [method, wrapped] of defs) {
      const fn = definition(wrapped),
        params = field(fn, "parameters")?.namedChildren.filter((n) => n.type !== "comment") ?? [];
      const first = params[0],
        parameter =
          first?.type === "identifier"
            ? first
            : (field(first ?? fn, "name") ??
              first?.namedChildren.find((n) => n.type === "identifier"));
      if (
        wrapped.type === "decorated_definition" ||
        parameter?.text.normalize("NFKC") !== "self" ||
        first?.text.startsWith("*")
      )
        continue;
      const nodes = bodyNodes(fn);
      // Conservatively suppress leads whenever this scope writes self, including destructuring.
      if (
        nodes.some(
          (n) =>
            (n.type === "case_pattern" &&
              [...walk(n)].some(
                (c) => c.type === "identifier" && c.text.normalize("NFKC") === "self",
              )) ||
            (n.type === "import_statement" &&
              n.namedChildren.some(
                (c) =>
                  c.type === "dotted_name" && c.text.split(".")[0].normalize("NFKC") === "self",
              )) ||
            (n.type === "import_from_statement" &&
              n
                .childrenForFieldName("name")
                .some((c) => c.type === "dotted_name" && c.text.normalize("NFKC") === "self")),
        ) ||
        nodes.some(
          (n) =>
            [
              "assignment",
              "augmented_assignment",
              "named_expression",
              "for_statement",
              "for_in_clause",
              "as_pattern",
              "aliased_import",
            ].includes(n.type) &&
            assignsSelf(field(n, "alias") ?? field(n, "left") ?? field(n, "name")),
        )
      )
        continue;
      for (const n of nodes) {
        if (n.type !== "call") continue;
        const func = unparenthesized(field(n, "function"));
        if (
          func?.type !== "attribute" ||
          unparenthesized(field(func, "object"))?.text.normalize("NFKC") !== "self"
        )
          continue;
        if (
          !ranges.some(
            (r) => r.startLine <= n.startPosition.row + 1 && r.endLine >= n.startPosition.row + 1,
          )
        )
          continue;
        const unknown = [];
        let order;
        try {
          order = mro(owner);
        } catch {
          return [];
        }
        for (const ancestor of order) {
          if (!classes.has(ancestor)) {
            unknown.push(ancestor);
            continue;
          }
          const target = methods
            .get(ancestor)
            .get(field(func, "attribute")?.text.normalize("NFKC"));
          if (!target) continue;
          if (ancestor === owner) break;
          const rr = range(target);
          if (ranges.some((r) => r.startLine <= rr.startLine && r.endLine >= rr.endLine)) break;
          const identity = JSON.stringify([owner, method, ancestor, name(definition(target))]);
          if (seen.has(identity)) break;
          seen.add(identity);
          while (rr.startLine > 1 && lines[rr.startLine - 2].trimStart().startsWith("#"))
            rr.startLine--;
          const cls = classes.get(ancestor);
          result.push({
            caller: owner + "." + method,
            name: ancestor + "." + name(definition(target)),
            ...rr,
            unknownEarlierBases: unknown,
            ownerHeader: {
              startLine: cls.startPosition.row + 1,
              endLine: body(cls)[0].startPosition.row,
            },
          });
          break;
        }
      }
    }
  return result;
}
export async function execute(helper, input) {
  if (helper === "inspect") return parse(input, inspectPython);
  const data = JSON.parse(input);
  if (helper === "declarations")
    return parse(data.source, (root) => declarations(root, data.language), data.language);
  if (helper === "neighborhood")
    return parse(data.source, (root) => neighborhood(root, data.ranges));
  if (helper === "calls")
    return parse(data.source, (root) => calls(root, data.source, data.ranges));
  if (helper === "preview") {
    const tokens = new Set(
      data.query.normalize("NFKC").match(/[_\p{ID_Start}][_\p{ID_Continue}]*/gu) ?? [],
    );
    let matches = [];
    if (/\.pyi?$/.test(data.path) && Buffer.byteLength(data.text) > data.budget)
      matches = await parse(data.text, (root) => previewMatches(root, tokens));
    return preview(data, matches);
  }
  throw new Error("Unknown parser operation");
}
