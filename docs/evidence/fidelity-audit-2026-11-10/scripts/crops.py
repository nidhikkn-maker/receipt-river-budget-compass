import os, numpy as np
from PIL import Image, ImageDraw, ImageFont
A=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..'); REF='/home/user/thapal-uixb/docs/evidence/signature-flow-reference/'; C=os.path.join(A,'captures'); OUT=os.path.join(A,'images')
FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',13)
DESK=(25,91); IPH=(480,97)
def refimg(f,off,b): im=Image.open(REF+f).convert('RGB'); return im.crop((b[0]+off[0],b[1]+off[1],b[2]+off[0],b[3]+off[1]))
def cap(v,f,b): return Image.open(os.path.join(C,v,f+'.png')).convert('RGB').crop(tuple(int(round(x)) for x in b))
JOBS=[
 ('home-header','01-home-computer.png',DESK,(0,0,1283,84),'desktop-01-home',(0,0,1283,84),'v'),
 ('home-rail','01-home-computer.png',DESK,(0,0,110,794),'desktop-01-home',(0,0,110,794),'h'),
 ('home-heading','01-home-computer.png',DESK,(130,100,1240,225),'desktop-01-home',(130,100,1240,240),'v'),
 ('home-networth-panel','01-home-computer.png',DESK,(139,229,832,609),'desktop-01-home',(138,245,805,648),'h'),
 ('home-coming-up','01-home-computer.png',DESK,(850,235,1232,500),'desktop-01-home',(825,245,1237,580),'h'),
 ('home-next-step','01-home-computer.png',DESK,(140,605,1232,712),'desktop-01-home',(140,660,1237,762),'v'),
 ('iphone-header','02-home-iphone.png',IPH,(0,0,372,72),'iphone-02-home',(0,0,372,72),'h'),
 ('iphone-heading','02-home-iphone.png',IPH,(0,72,372,205),'iphone-02-home',(0,56,372,176),'h'),
 ('iphone-networth-panel','02-home-iphone.png',IPH,(10,202,349,548),'iphone-02-home',(6,171,366,505),'h'),
 ('iphone-bottom-nav','02-home-iphone.png',IPH,(0,725,372,793),'iphone-02-home',(0,725,372,793),'v'),
 ('page-header-money','03-money.png',DESK,(130,100,1240,340),'desktop-03-money',(130,100,1240,420),'v'),
 ('canvas-08-source','08-smart-add-source.png',DESK,(342,89,941,655),'desktop-08-smart-add-source',(313,66,970,728),'h'),
 ('canvas-09-review','09-smart-add-review.png',DESK,(342,89,941,655),'desktop-09-smart-add-review',(25,16,1258,778),'h'),
 ('canvas-10-confirm','10-smart-add-confirm.png',DESK,(342,136,941,609),'desktop-10-smart-add-confirm',(313,51,970,743),'h'),
]
def lab(im,t):
    d=ImageDraw.Draw(im); w=d.textlength(t,font=FONT); d.rectangle([0,0,w+10,18],fill=(20,30,32)); d.text((5,2),t,fill=(255,255,255),font=FONT); return im
for name,rf,off,rb,cf,cb,orient in JOBS:
    tiles=[lab(refimg(rf,off,rb),'REFERENCE'),lab(cap('asis',cf,cb),'937cfaf as rendered here (Inter)'),lab(cap('manrope',cf,cb),'937cfaf + Manrope injected')]
    zoom=2 if max(t.size[0] for t in tiles)*(3 if orient=='h' else 1)<=800 else 1
    tiles=[t.resize((t.size[0]*zoom,t.size[1]*zoom),Image.NEAREST) for t in tiles]
    if orient=='h':
        Wt=sum(t.size[0] for t in tiles)+20; Ht=max(t.size[1] for t in tiles); sheet=Image.new('RGB',(Wt,Ht),(255,255,255)); x=0
        for t in tiles: sheet.paste(t,(x,0)); x+=t.size[0]+10
    else:
        Wt=max(t.size[0] for t in tiles); Ht=sum(t.size[1] for t in tiles)+20; sheet=Image.new('RGB',(Wt,Ht),(255,255,255)); y=0
        for t in tiles: sheet.paste(t,(0,y)); y+=t.size[1]+10
    if sheet.size[0]>1600: sheet=sheet.resize((1600,int(sheet.size[1]*1600/sheet.size[0])),Image.LANCZOS)
    sheet.save(os.path.join(OUT,'crop-%s.jpg'%name),quality=90)
print('ok')
