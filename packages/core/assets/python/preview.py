"""Query-assisted source windows, paired with a declaration index for discovery."""
import ast,json,sys,unicodedata

def preview(query,path,text,budget=16384):
    if not isinstance(budget,int) or budget<256:raise ValueError('Preview allowance must be at least 256 bytes')
    lines=text.split('\n');source_bytes=len(text.encode())
    line_offsets=[];offset=0
    for line in lines:line_offsets.append(offset);offset+=len(line.encode())+1
    if source_bytes<=budget:
        return {'text':text,'spans':[{'startLine':1,'endLine':len(lines),'text':text,'basis':'complete source','sourceByteStart':0,'sourceByteEnd':source_bytes}],'truncated':False,'sourceBytes':source_bytes,'previewBytes':source_bytes,'method':'complete source','matchedDeclarations':0,'unrepresentedMatches':0}
    tokens=set();token=''
    for char in unicodedata.normalize('NFKC',query)+' ':
        if ('_'+char).isidentifier():token+=char
        else:
            if token.isidentifier():tokens.add(token)
            token=''
    matches=[];parse_error=False
    if path.endswith(('.py','.pyi')):
        try:
            tree=ast.parse(text);parents={c:p for p in ast.walk(tree) for c in ast.iter_child_nodes(p)}
            for node in ast.walk(tree):
                if not isinstance(node,(ast.ClassDef,ast.FunctionDef,ast.AsyncFunctionDef)) or node.name not in tokens:continue
                start=min([node.lineno,*[d.lineno for d in node.decorator_list]])
                owner=parents.get(node);context=None
                while owner is not None:
                    if isinstance(owner,ast.ClassDef):
                        context=(min([owner.lineno,*[d.lineno for d in owner.decorator_list]]),owner.body[0].lineno-1);break
                    owner=parents.get(owner)
                first=node.body[0];body=first;body_column=0
                if isinstance(first,ast.Expr) and isinstance(getattr(first.value,'value',None),str) and len(node.body)>1:
                    body=node.body[1]
                    if body.lineno==first.lineno:body_column=body.col_offset
                matches.append({'start':start,'end':node.end_lineno,'context':context,'header_end':first.lineno-1,'header_line':node.lineno,'header_column_end':first.col_offset if first.lineno==node.lineno else 0,'body_start':body.lineno,'body_column':body_column})
        except (SyntaxError,ValueError,RecursionError,AttributeError):parse_error=True
    matches.sort(key=lambda m:(m['start'],m['end']))
    spans=[];parts=[];used=0;seen=set()
    def add(start,end,allowance,basis,from_end=False):
        nonlocal used
        if start>end:return False
        start=max(1,start);end=min(end,len(lines));allowance=min(allowance,budget-used)
        header=f'--- source lines {start}-{end}; {basis}; may be clipped ---\n'
        remaining=allowance-len(header.encode())-1
        if remaining<=0:return False
        selected=[];size=0;partial=False
        source_lines=lines[start-1:end]
        for line in reversed(source_lines) if from_end else source_lines:
            cost=len(line.encode())+(1 if selected else 0)
            if size+cost>remaining:
                if not selected:
                    raw=line.encode();line=(raw[-remaining:] if from_end else raw[:remaining]).decode('utf-8',errors='ignore')
                    if line:selected=[line];partial=True
                break
            selected.append(line);size+=cost
        if not selected:return False
        if from_end:selected.reverse();start=end-len(selected)+1
        actual_end=start+len(selected)-1;body='\n'.join(selected)
        identity=(start,actual_end,body)
        if identity in seen:return True
        # The actual range replaces the requested range; clipping is explicit.
        label=f'--- source lines {start}-{actual_end}; {basis}'+('; partial line' if partial else '')+' ---\n'
        rendered=label+body+'\n'
        if len(rendered.encode())>allowance:return False
        byte_start=line_offsets[start-1]+(len(lines[start-1].encode())-len(body.encode()) if partial and from_end else 0)
        seen.add(identity);spans.append({'sourceByteStart':byte_start,'sourceByteEnd':byte_start+len(body.encode()),'startLine':start,'endLine':actual_end,'text':body,'basis':basis,'partialLine':partial});parts.append(rendered);used+=len(rendered.encode());return True
    def add_inline(line_number,start_byte,end_byte,allowance,basis):
        nonlocal used
        raw=lines[line_number-1].encode();end_byte=min(end_byte,len(raw));allowance=min(allowance,budget-used)
        longest=f'--- source line {line_number}, bytes {start_byte}-{end_byte}; {basis}; partial line ---\n'
        room=allowance-len(longest.encode())-1
        if room<=0:return False
        body=raw[start_byte:end_byte][:room].decode('utf-8',errors='ignore')
        if not body:return False
        actual_end=start_byte+len(body.encode())
        label=f'--- source line {line_number}, bytes {start_byte}-{actual_end}; {basis}; partial line ---\n'
        rendered=label+body+'\n';assert len(rendered.encode())<=allowance
        identity=(line_number,start_byte,actual_end,body)
        if identity in seen:return True
        seen.add(identity);parts.append(rendered);used+=len(rendered.encode());spans.append({'sourceByteStart':line_offsets[line_number-1]+start_byte,'sourceByteEnd':line_offsets[line_number-1]+actual_end,'startLine':line_number,'endLine':line_number,'columnStartByte':start_byte,'columnEndByte':actual_end,'text':body,'basis':basis,'partialLine':True});return True
    add(1,len(lines),budget//4,'opening context')
    unrepresented=0
    if matches:
        per_match=max(1,int((budget-used)*.75)//len(matches))
        for match in matches:
            context=match['context'];context_cost=0
            if context:
                before=used;add(context[0],context[1],min(per_match//3,512),'enclosing class context');context_cost=used-before
            before=used
            add(match['start'],match['header_end'],min((per_match-context_cost)//3,512),'query-named declaration header')
            if match['header_column_end']:add_inline(match['header_line'],0,match['header_column_end'],min((per_match-context_cost)//3,512),'query-named declaration header')
            header_cost=used-before;remaining=per_match-context_cost-header_cost
            if match['body_column']:
                before=used;represented=add_inline(match['body_start'],match['body_column'],len(lines[match['body_start']-1].encode()),remaining,'query-named implementation')
                if match['end']>match['body_start']:add(match['body_start']+1,match['end'],remaining-(used-before),'query-named implementation continuation')
            else:represented=add(match['body_start'],match['end'],remaining,'query-named implementation')
            if not represented:unrepresented+=1
    # Non-matching files still have real content previews; the query never excludes them.
    positions=sorted(set([len(lines)//3+1,2*len(lines)//3+1,max(1,len(lines)-31)]))
    for i,start in enumerate(positions):add(start,min(start+31,len(lines)),(budget-used)//(len(positions)-i),'distributed context',from_end=i==len(positions)-1)
    return {'text':''.join(parts),'spans':spans,'truncated':True,'sourceBytes':source_bytes,'previewBytes':used,'method':'query-assisted source windows','matchedDeclarations':len(matches),'unrepresentedMatches':unrepresented,'parseUnavailable':parse_error,'scope':'Sampled content only; missing terms or unseen ranges do not establish irrelevance. No additional source files read.'}

if __name__=='__main__':
    data=json.load(sys.stdin);json.dump(preview(data['query'],data['path'],data['text'],data.get('budget',16384)),sys.stdout)
