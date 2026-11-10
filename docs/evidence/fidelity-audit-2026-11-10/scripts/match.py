import json,sys,numpy as np
from PIL import Image
def ink(a,bg):  # a: HxWx3 int, returns darkness 0..1 relative to bg
    d=np.abs(a-bg).sum(2)/ (np.abs(np.array([0,0,0])-bg).sum()+1e-9)
    return np.clip(d,0,1)
def bbox(m,th=0.25):
    ys,xs=np.where(m>th); return xs.min(),ys.min(),xs.max()+1,ys.max()+1
def norm(m,w,h):
    return np.asarray(Image.fromarray((m*255).astype(np.uint8)).resize((w,h),Image.BILINEAR)).astype(float)/255
def score(a,b):
    a=a-a.mean();b=b-b.mean();return float((a*b).sum()/np.sqrt((a*a).sum()*(b*b).sum()))
def run(ref_png,box,bgref,spec_png,spec_json,fg_on_dark=False):
    R=np.asarray(Image.open(ref_png).convert('RGB')).astype(int)
    x0,y0,x1,y1=box; rc=R[y0:y1,x0:x1]; rm=ink(rc,np.array(bgref))
    bx=bbox(rm); rm=rm[bx[1]:bx[3],bx[0]:bx[2]]; H,W=rm.shape
    S=np.asarray(Image.open(spec_png).convert('RGB')).astype(int)
    rows=json.load(open(spec_json)); out=[]
    sbg=S[2,2]
    for r in rows:
        c=S[r['top']:r['top']+r['h'],:]; m=ink(c,sbg); b=bbox(m); m=m[b[1]:b[3],b[0]:b[2]]
        h,w=m.shape; scale=H/h; implied_w=w*scale
        out.append((score(norm(m,W,H),rm),r['font'],r['weight'],r['size'],r.get('ls',0),h,w,round(r['size']*scale,1),round(implied_w-W,1)))
    out.sort(reverse=True)
    print('ref ink box',W,H)
    for o in out: print('%.4f %-18s w%d s%s ls%s specHxW=%dx%d impliedSize=%s widthDelta@scale=%s'%o)
if __name__=='__main__':
    a=sys.argv; run(a[1],tuple(map(int,a[2].split(','))),tuple(map(int,a[3].split(','))),a[4],a[5])
