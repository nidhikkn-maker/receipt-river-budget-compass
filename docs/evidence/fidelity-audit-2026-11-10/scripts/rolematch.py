# For each reference text role: search font/weight/size/letter-spacing/numeral settings by rendering specimens in
# Chromium and correlating at native scale with the reference crop. Writes work/roles.json
import json,subprocess,sys,os,numpy as np
from PIL import Image
D=os.path.dirname(os.path.abspath(__file__)); W=os.path.join(D,'..','work'); REF='/home/user/thapal-uixb/docs/evidence/signature-flow-reference/'
def ink(a,bg,fg):
    d=np.abs(a-bg).sum(2)/max(np.abs(fg-bg).sum(),1); return np.clip(d,0,1)
def bbox(m,th=0.3):
    ys,xs=np.where(m>th); return xs.min(),ys.min(),xs.max()+1,ys.max()+1
def corr(a,b):
    a=a-a.mean();b=b-b.mean();den=np.sqrt((a*a).sum()*(b*b).sum());return float((a*b).sum()/den) if den else 0
def best(rm,m):
    H=max(rm.shape[0],m.shape[0])+4; Wd=max(rm.shape[1],m.shape[1])+4
    A=np.zeros((H,Wd)); A[2:2+rm.shape[0],2:2+rm.shape[1]]=rm; b=-1
    for dy in range(5):
        for dx in range(5):
            if dy+m.shape[0]>H or dx+m.shape[1]>Wd: continue
            B=np.zeros((H,Wd)); B[dy:dy+m.shape[0],dx:dx+m.shape[1]]=m; b=max(b,corr(A,B))
    return b
ROLES=json.load(open(sys.argv[1])); out={}
only=sys.argv[2].split(',') if len(sys.argv)>2 else None
for r in ROLES:
    if only and r['name'] not in only: continue
    R=np.asarray(Image.open(REF+r['ref']).convert('RGB')).astype(int)
    x0,y0,x1,y1=r['box']; crop=R[y0:y1,x0:x1]
    border=np.concatenate([crop[0],crop[-1],crop[:,0],crop[:,-1]]); bg=np.median(border,0).astype(int)
    dist=np.abs(crop-bg).sum(2); fg=crop[np.unravel_index(dist.argmax(),dist.shape)]
    if 'bg' in r: bg=np.array(r['bg'])
    if 'fg' in r: fg=np.array(r['fg'])
    r['_bg']=bg.tolist(); r['_fg']=fg.tolist()
    rm=ink(R[y0:y1,x0:x1],bg,fg); bb=bbox(rm); rm=rm[bb[1]:bb[3],bb[0]:bb[2]]
    specs=[]
    for f in r.get('fonts',['Manrope']):
        for w in r['weights']:
            for s in r['sizes']:
                for ls in r['ls']:
                    for fvn in r.get('fvn',['normal']):
                        specs.append(dict(font=f,system=f in ('Inter','Inter Display','Liberation Sans','DejaVu Sans'),weight=w,size=s,ls=ls,fvn=fvn,text=r['text']))
    sp=os.path.join(W,'role-%s.json'%r['name']); json.dump(specs,open(sp,'w'))
    env=dict(os.environ,BG='rgb(%d,%d,%d)'%tuple(bg),FG='rgb(%d,%d,%d)'%tuple(fg),W='1400')
    subprocess.run(['node',os.path.join(D,'render-rows.cjs'),sp,sp.replace('.json','.png')],check=True,env=env)
    S=np.asarray(Image.open(sp.replace('.json','.png')).convert('RGB')).astype(int); rows=json.load(open(sp)); res=[]
    for q in rows:
        c=S[q['top']:q['top']+q['h'],:]; m=ink(c,bg,fg)
        try: b2=bbox(m)
        except ValueError: continue
        m=m[b2[1]:b2[3],b2[0]:b2[2]]
        res.append(dict(score=round(best(rm,m),4),font=q['font'],weight=q['weight'],size=q['size'],ls=q['ls'],fvn=q['fvn'],dW=int(m.shape[1]-rm.shape[1]),dH=int(m.shape[0]-rm.shape[0])))
    res.sort(key=lambda z:-z['score']); out[r['name']]=dict(bg=r['_bg'],fg=r['_fg'],ref_ink=[int(rm.shape[1]),int(rm.shape[0])],top=res[:6])
    t=res[0]; print('%-16s ink=%sx%s best %.3f %s w%s %spx ls%s %s dW=%d dH=%d | 2nd %.3f w%s %spx ls%s %s'%(r['name'],rm.shape[1],rm.shape[0],t['score'],t['font'],t['weight'],t['size'],t['ls'],t['fvn'],t['dW'],t['dH'],res[1]['score'],res[1]['weight'],res[1]['size'],res[1]['ls'],res[1]['fvn']),flush=True)
prev={}
p=os.path.join(W,'roles.json')
if os.path.exists(p): prev=json.load(open(p))
prev.update(out); json.dump(prev,open(p,'w'),indent=1)
