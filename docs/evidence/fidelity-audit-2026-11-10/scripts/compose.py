# Side-by-side, onion-skin and difference heatmaps: reference crop (app frame) vs implementation capture.
import numpy as np, os, json
from PIL import Image, ImageDraw, ImageFont
A=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'); REF='/home/user/thapal-uixb/docs/evidence/signature-flow-reference/'
OUT=os.path.join(A,'images'); C=os.path.join(A,'captures')
try: FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',15)
except Exception: FONT=ImageFont.load_default()
DESK=(25,91,1308,885); IPH=(480,97,852,890)
SCREENS=[('01-home','01-home-computer.png','desktop-01-home',DESK),('02-home-iphone','02-home-iphone.png','iphone-02-home',IPH),
 ('03-money','03-money.png','desktop-03-money',DESK),('04-statement-desk','04-statement-desk.png','desktop-04-statement-desk',DESK),
 ('05-records','05-records.png','desktop-05-records',DESK),('06-travel','06-travel.png','desktop-06-travel',DESK),('07-reports','07-reports.png','desktop-07-reports',DESK),
 ('08-smart-add-source','08-smart-add-source.png','desktop-08-smart-add-source',DESK),('09-smart-add-review','09-smart-add-review.png','desktop-09-smart-add-review',DESK),('10-smart-add-confirm','10-smart-add-confirm.png','desktop-10-smart-add-confirm',DESK)]
def label(im,t):
    d=ImageDraw.Draw(im); w=d.textlength(t,font=FONT); d.rectangle([0,0,w+12,22],fill=(20,30,32)); d.text((6,3),t,fill=(255,255,255),font=FONT); return im
def heat(r,i):
    d=np.abs(r.astype(int)-i.astype(int)).sum(2)/3.0; d=np.clip(d/80.0,0,1)
    g=(r.astype(float).mean(2)*0.35+150).clip(0,255)
    out=np.stack([g,g,g],2)
    col=np.stack([255*np.ones_like(d), 255*(1-d)*0.9, 40*(1-d)],2)  # yellow->red
    a=np.clip(d*1.6,0,1)[...,None]*(d[...,None]>0.06)
    return (out*(1-a)+col*a).astype(np.uint8), float((d>0.15).mean())
stats={}
for name,rf,cap,box in SCREENS:
    r=np.asarray(Image.open(REF+rf).convert('RGB').crop(box))
    ims={}
    for v in ('asis','manrope'):
        p=os.path.join(C,v,cap+'.png')
        if os.path.exists(p): ims[v]=np.asarray(Image.open(p).convert('RGB').resize((r.shape[1],r.shape[0])) if Image.open(p).size!=(r.shape[1],r.shape[0]) else Image.open(p).convert('RGB'))
    i=ims['manrope']; h,frac=heat(r,i); onion=((r.astype(int)+i.astype(int))//2).astype(np.uint8)
    h2,frac2=heat(r,ims['asis'])
    stats[name]={'pixels_differing_manrope':round(frac,3),'pixels_differing_asis':round(frac2,3)}
    tiles=[label(Image.fromarray(r),'REFERENCE (approved)'),label(Image.fromarray(ims['asis']),'937cfaf as rendered here (Inter)'),
           label(Image.fromarray(onion),'50% onion: ref + 937cfaf (Manrope injected)'),label(Image.fromarray(h),'diff heatmap: ref vs 937cfaf (Manrope)')]
    tw,th=tiles[0].size
    if tw>600:  # desktop: 2x2 grid scaled to 1600 wide
        s=800/tw; tiles=[t.resize((800,int(th*s)),Image.LANCZOS) for t in tiles]; W,H=tiles[0].size
        sheet=Image.new('RGB',(1600,2*H),(255,255,255)); [sheet.paste(t,((k%2)*W,(k//2)*H)) for k,t in enumerate(tiles)]
    else:
        tiles.insert(2,label(Image.fromarray(ims['manrope']),'937cfaf (Manrope injected)'))
        W=1600//len(tiles); s=W/tw; tiles=[t.resize((W,int(th*s)),Image.LANCZOS) for t in tiles]
        sheet=Image.new('RGB',(W*len(tiles),tiles[0].size[1]),(255,255,255)); [sheet.paste(t,(k*W,0)) for k,t in enumerate(tiles)]
    sheet.save(os.path.join(OUT,'compare-%s.jpg'%name),quality=88)
json.dump(stats,open(os.path.join(OUT,'diff-stats.json'),'w'),indent=1); print(json.dumps(stats))
