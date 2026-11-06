"""Render docs/MASTER_REQUIREMENTS.md from .lovable/requirements/register.json (the single source of truth)."""
import json, collections
d=json.load(open('.lovable/requirements/register.json')); r=d['requirements']
c=collections.Counter(x['status'] for x in r)
out=['# Ledgerline v6.0 + v6.1 master requirements register','',
 'Generated from `.lovable/requirements/register.json`; edit the register, then run `python3 scripts/requirements/render_docs.py`.',
 'Status rule: COMPLETE only with connected code, enforced security, executed tests and recorded evidence. "NOT IMPLEMENTED" here means *not yet re-verified against code*, not proven absent.','',
 '| Status | Count |','|---|---|']+[f'| {k} | {v} |' for k,v in sorted(c.items())]+['']
cur=None
for x in r:
  s=x['source']; key=f"{s['document']} — {s['section']}"
  if key!=cur: out+=['',f'## {key}','','| ID | Line | Requirement | Status | Code | Tests / evidence |','|---|---|---|---|---|---|']; cur=key
  ev='; '.join(x.get('evidence',[]) if isinstance(x.get('evidence'),list) else [])+'; '.join(x['finalTestResult'].get('evidence',[]))
  t=x['original'].replace('|','/').replace('\n',' ')[:160]
  out.append(f"| {x['id']} | {s['line']} | {t} | {x['status']} | {', '.join(x.get('modules',[]))} | {ev.replace('|','/')} |")
open('docs/MASTER_REQUIREMENTS.md','w').write('\n'.join(out)+'\n')
print(c)
