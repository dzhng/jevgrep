"""Disposable Python declaration boundaries; no query-specific symbol selection."""
import ast,json,sys
source=sys.stdin.read()
tree=ast.parse(source)
lines=source.splitlines(keepends=True)
units=[]
def visit(nodes,prefix='',owner_headers=()):
    for node in nodes:
        if not isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef)):
            continue
        start=min([node.lineno,*[d.lineno for d in node.decorator_list]])
        end=node.end_lineno
        name=prefix+node.name
        text=''.join(lines[start-1:end])
        children=[n for n in node.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))]
        if isinstance(node,ast.ClassDef) and children:
            first=children[0]
            first_start=min([first.lineno,*[n.lineno for n in first.decorator_list]])
            headers=(*owner_headers, dict(startLine=start,endLine=first_start-1)) if first_start>start else owner_headers
            cursor=start
            for child in children:
                child_start=min([child.lineno,*[d.lineno for d in child.decorator_list]])
                if cursor<child_start:
                    units.append(dict(name=name+'.context',startLine=cursor,endLine=child_start-1,ownerHeaders=headers))
                visit([child],name+'.',headers)
                cursor=child.end_lineno+1
            if cursor<=end:
                units.append(dict(name=name+'.context',startLine=cursor,endLine=end,ownerHeaders=headers))
        else:
            units.append(dict(name=name,startLine=start,endLine=end,ownerHeaders=owner_headers))
visit(tree.body)
print(json.dumps(units))
