# native-scale match: python match2.py ref.png x0,y0,x1,y1 bgR,bgG,bgB spec.png spec.json [topN]
import json,sys,numpy as np
from PIL import Image
sys.path.insert(0,__file__.rsplit('/',1)[0])
from match import ink,bbox,score
def best_shift(rm,m):
    H=max(rm.shape[0],m.shape[0])+4; W=max(rm.shape[1],m.shape[1])+4
    A=np.zeros((H,W)); A[2:2+rm.shape[0],2:2+rm.shape[1]]=rm
    best=-1
    for dy in range(0,5):
        for dx in range(0,5):
            B=np.zeros((H,W)); 
            if dy+m.shape[0]>H or dx+m.shape[1]>W: continue
            B[dy:dy+m.shape[0],dx:dx+m.shape[1]]=m
            best=max(best,score(A,B))
    return best
a=sys.argv
R=np.asarray(Image.open(a[1]).convert('RGB')).astype(int); x0,y0,x1,y1=map(int,a[2].split(','))
rm=ink(R[y0:y1,x0:x1],np.array(list(map(int,a[3].split(','))))); b=bbox(rm); rm=rm[b[1]:b[3],b[0]:b[2]]
S=np.asarray(Image.open(a[4]).convert('RGB')).astype(int); rows=json.load(open(a[5])); sbg=S[2,2]; out=[]
for r in rows:
    c=S[r['top']:r['top']+r['h'],:]; m=ink(c,sbg); bb=bbox(m); m=m[bb[1]:bb[3],bb[0]:bb[2]]
    out.append((best_shift(rm,m),r['font'],r['weight'],r['size'],r.get('ls',0),m.shape[1]-rm.shape[1],m.shape[0]-rm.shape[0]))
out.sort(reverse=True); print('ref',rm.shape[::-1])
for o in out[:int(a[6]) if len(a)>6 else 15]: print('%.4f %-16s w%s s%s ls%s dW=%d dH=%d'%o)
