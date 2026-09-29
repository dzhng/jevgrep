const field = (node, name) => node.childForFieldName(name);
const comment = (node) => node.type === "comment" || node.type.endsWith("_comment");
const range = (node) => ({
  startLine: node.startPosition.row + 1,
  endLine: node.endPosition.row + (node.endPosition.column ? 1 : 0),
});

export function declarations(root, language) {
  const comments = [],
    stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (comment(node)) comments.push(range(node));
    else for (const child of node.namedChildren) stack.push(child);
  }
  const units = [];
  if (language === "go")
    for (const node of root.namedChildren) {
      if (comment(node)) continue;
      let name = field(node, "name")?.text ?? node.type;
      if (node.type === "method_declaration") {
        const receiver = field(node, "receiver")?.namedChildren.find(
          (child) => child.type === "parameter_declaration",
        );
        const owner = receiver && field(receiver, "type")?.text.replace(/^\*/, "");
        if (owner) name = `${owner}.${name}`;
      } else if (["type_declaration", "var_declaration", "const_declaration"].includes(node.type)) {
        // Keep groups intact: iota and omitted constant values depend on earlier specs.
        const specs = node.namedChildren.flatMap((child) =>
          child.type === "var_spec_list" ? child.namedChildren : [child],
        );
        name =
          specs
            .flatMap((spec) =>
              spec
                .childrenForFieldName("name")
                .filter((child) => child.type === "identifier" || child.type === "type_identifier")
                .map((child) => child.text),
            )
            .join(", ") || node.type;
      } else if (node.type === "package_clause")
        name = `package ${node.namedChildren.find((child) => child.type === "package_identifier").text}`;
      units.push({ name, range: range(node) });
    }
  else {
    function startWithAttributes(node) {
      let start = node;
      while (
        start.previousNamedSibling &&
        (start.previousNamedSibling.type === "attribute_item" ||
          comment(start.previousNamedSibling))
      ) {
        const previous = start.previousNamedSibling;
        const before = previous.previousNamedSibling;
        if (
          comment(previous) &&
          before &&
          !comment(before) &&
          before.type !== "attribute_item" &&
          before.endPosition.row === previous.startPosition.row
        )
          break;
        start = start.previousNamedSibling;
      }
      return range(start).startLine;
    }
    function visit(nodes, prefix = "", headers = []) {
      const ownedHeaders = [
        ...headers,
        ...nodes.filter((node) => node.type === "inner_attribute_item").map(range),
      ];
      for (const node of nodes) {
        if (comment(node) || ["attribute_item", "inner_attribute_item"].includes(node.type))
          continue;
        const body =
          ["impl_item", "trait_item", "mod_item", "foreign_mod_item"].includes(node.type) &&
          field(node, "body");
        const owner =
          field(node, "name")?.text ||
          field(node, "type")?.text ||
          field(node, "macro")?.text ||
          node.type;
        const startLine = startWithAttributes(node);
        if (
          body &&
          body.namedChildren.some(
            (child) =>
              !comment(child) && !["attribute_item", "inner_attribute_item"].includes(child.type),
          )
        ) {
          const header = { startLine, endLine: body.startPosition.row + 1 };
          units.push({
            name: prefix + owner + ".context",
            range: header,
            ownerHeaders: [...ownedHeaders, header],
            classContext: true,
          });
          visit(
            body.namedChildren,
            node.type === "foreign_mod_item" ? prefix : prefix + owner + ".",
            [...ownedHeaders, header],
          );
        } else
          units.push({
            name: prefix + owner,
            range: { ...range(node), startLine },
            ownerHeaders: ownedHeaders,
          });
      }
    }
    visit(root.namedChildren);
  }
  return { units, comments };
}
