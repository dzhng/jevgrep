"""Disposable structural context around positively selected Python method ranges."""
import ast,json,sys
request=json.load(sys.stdin)
tree=ast.parse(request['source'])
parents={child:node for node in ast.walk(tree) for child in ast.iter_child_nodes(node)}
ranges=request['ranges']
extra=[]
def start(node):
    return min([node.lineno,*[d.lineno for d in getattr(node,'decorator_list',[])]])
def add(first,last):
    if first<=last:extra.append(dict(startLine=first,endLine=last))
for node in ast.walk(tree):
    if not isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):
        continue
    owner=parents.get(node)
    if not isinstance(owner,ast.ClassDef):
        continue
    if not any(r['startLine']<=node.end_lineno and r['endLine']>=start(node) for r in ranges):
        continue
    siblings=[n for n in owner.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef,ast.ClassDef))]
    header_end=min([start(n)-1 for n in siblings],default=owner.end_lineno)
    add(start(owner),min(header_end,start(owner)+39))
    index=siblings.index(node)
    for neighbor in siblings[max(0,index-1):index+2]:
        if neighbor is not node and neighbor.end_lineno-start(neighbor)+1<=40:
            add(start(neighbor),neighbor.end_lineno)
print(json.dumps(extra))
