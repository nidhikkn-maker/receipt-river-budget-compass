import numpy as np,sys
from PIL import Image
def load(p): return np.asarray(Image.open(p).convert('RGB')).astype(int)
def ink(a,box,th=60):
    x0,y0,x1,y1=box; c=a[y0:y1,x0:x1]; border=np.concatenate([c[0],c[-1],c[:,0],c[:,-1]]); bg=np.median(border,0); d=np.abs(c-bg).sum(2); ys,xs=np.where(d>th)
    return (int(x0+xs.min()),int(y0+ys.min()),int(x0+xs.max()+1),int(y0+ys.max()+1)) if len(xs) else None
def region(a,box,color,tol=30):
    x0,y0,x1,y1=box; c=a[y0:y1,x0:x1]; m=np.abs(c-np.array(color)).sum(2)<tol; ys,xs=np.where(m)
    return (int(x0+xs.min()),int(y0+ys.min()),int(x0+xs.max()+1),int(y0+ys.max()+1)) if len(xs) else None
def hlines(a,x,y0,y1,th=8):
    col=a[y0:y1,x]; base=np.median(col,0); d=np.abs(col-base).sum(1); return [int(y0+i) for i in np.where(d>th)[0]]
def vlines(a,y,x0,x1,th=8):
    row=a[y,x0:x1]; base=np.median(row,0); d=np.abs(row-base).sum(1); return [int(x0+i) for i in np.where(d>th)[0]]
def radius(a,box,color,tol=40):
    # corner radius from top-left: first row where panel colour starts at column x0
    x0,y0,x1,y1=box
    for dy in range(0,60):
        row=a[y0+dy,x0:x0+80]; m=np.where(np.abs(row-np.array(color)).sum(1)<tol)[0]
        if len(m) and m[0]==0: return dy
    return None
