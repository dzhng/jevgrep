"""Inherited same-file self-method reading leads, not runtime dispatch proofs."""
import ast
import json
import sys
from collections import Counter


def extract(source, ranges):
    if '\r' in source.replace('\r\n', ''):
        return []
    tree = ast.parse(source)
    lines = source.splitlines()
    declared = [n for n in tree.body if isinstance(n, ast.ClassDef)]
    counts = Counter(n.name for n in declared)
    classes = {n.name: n for n in declared if counts[n.name] == 1}
    methods = {}
    for name, cls in classes.items():
        definitions = [n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        duplicates = Counter(n.name for n in definitions)
        methods[name] = {n.name: n for n in definitions if duplicates[n.name] == 1}
    bases = {name: [ast.unparse(b) for b in cls.bases] for name, cls in classes.items()}

    linearizations = {}

    def mro(name, seen=()):
        if name in seen:
            raise ValueError('cycle')
        if name in linearizations:
            return list(linearizations[name])
        parents = bases.get(name, [])
        sequences = [mro(p, (*seen, name)) for p in parents] + [parents.copy()]
        result = [name]
        while any(sequences):
            sequences = [s for s in sequences if s]
            head = next((s[0] for s in sequences if not any(s[0] in t[1:] for t in sequences)), None)
            if head is None:
                raise ValueError('inconsistent MRO')
            result.append(head)
            for s in sequences:
                if s[0] == head:
                    s.pop(0)
        # Merging consumes lists; cached paths must remain immutable.
        linearizations[name] = tuple(result)
        return result

    def body_nodes(node):
        yield node
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
                continue
            yield from body_nodes(child)

    result, seen = [], set()
    for owner, definitions in methods.items():
        for name, fn in definitions.items():
            args = [*fn.args.posonlyargs, *fn.args.args]
            if not args or args[0].arg != 'self' or fn.decorator_list:
                continue
            nodes = list(body_nodes(fn))
            if any(isinstance(n, ast.Name) and n.id == 'self' and isinstance(n.ctx, ast.Store) for n in nodes):
                continue
            for node in nodes:
                if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute) or not isinstance(node.func.value, ast.Name) or node.func.value.id != 'self':
                    continue
                if not any(r['startLine'] <= node.lineno <= r['endLine'] for r in ranges):
                    continue
                unknown = []
                for ancestor in mro(owner):
                    if ancestor not in classes:
                        unknown.append(ancestor)
                        continue
                    target = methods[ancestor].get(node.func.attr)
                    if target is None:
                        continue
                    if ancestor == owner:
                        break  # Same-owner helpers remain under relevance selection.
                    if any(r['startLine'] <= target.lineno and r['endLine'] >= target.end_lineno for r in ranges):
                        break
                    identity = (owner, name, ancestor, target.name)
                    if identity in seen:
                        break
                    seen.add(identity)
                    start = min([target.lineno, *[d.lineno for d in target.decorator_list]])
                    while start > 1 and lines[start-2].lstrip().startswith('#'):
                        start -= 1
                    cls = classes[ancestor]
                    result.append(dict(caller=owner+'.'+name, name=ancestor+'.'+target.name,
                        startLine=start, endLine=target.end_lineno, unknownEarlierBases=unknown,
                        ownerHeader=dict(startLine=cls.lineno, endLine=cls.body[0].lineno-1)))
                    break
    return result


request = json.loads(sys.stdin.read())
print(json.dumps(extract(request['source'], request['ranges'])))
