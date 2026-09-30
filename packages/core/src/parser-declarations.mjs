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
    // `siblings` are the parent's named children and `index` is the node's position in them.
    // previousNamedSibling costs time proportional to the node's position, so walking back
    // through a long comment run with it was quadratic: 20,000 comment lines took 19 s.
    function startWithAttributes(siblings, index) {
      let start = index;
      while (
        start > 0 &&
        (siblings[start - 1].type === "attribute_item" || comment(siblings[start - 1]))
      ) {
        const previous = siblings[start - 1];
        const before = start > 1 ? siblings[start - 2] : undefined;
        if (
          comment(previous) &&
          before &&
          !comment(before) &&
          before.type !== "attribute_item" &&
          before.endPosition.row === previous.startPosition.row
        )
          break;
        start--;
      }
      return range(siblings[start]).startLine;
    }
    function visit(nodes, prefix = "", headers = []) {
      const ownedHeaders = [
        ...headers,
        ...nodes.filter((node) => node.type === "inner_attribute_item").map(range),
      ];
      for (const [index, node] of nodes.entries()) {
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
        const startLine = startWithAttributes(nodes, index);
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
