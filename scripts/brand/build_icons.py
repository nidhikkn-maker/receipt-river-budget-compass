"""Build all brand assets from shared folded-ledger geometry. Requires rsvg-convert."""
from pathlib import Path
import subprocess,re
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
SHAPES='<path d="M18 26 42 12v69c0 5 3 8 8 8h64l-20 20H34c-10 0-16-6-16-16Z" fill="{ink}"/><path d="M52 19 78 4v65L52 84Z" fill="{ink}"/><path d="M82 76h26a4 4 0 0 1 0 8H68Z" fill="{gold}"/>'
def svg(view,body):return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" role="img" aria-label="Ledgerline">{body}</svg>'
for mode,ink,gold in [('light','#223546','#bba36e'),('dark','#f5f2ea','#d5bb83'),('mono','#223546','#223546')]:
 shapes=SHAPES.format(ink=ink,gold=gold)
 (ROOT/f'public/brand/ledgerline-symbol-{mode}.svg').write_text(svg('0 0 128 116',shapes))
 word=f'<text x="148" y="90" font-family="Helvetica Neue,Arial,sans-serif" font-size="91" font-weight="500" textLength="460" lengthAdjust="spacingAndGlyphs" fill="{ink}">Ledgerline</text>'
 (ROOT/f'public/brand/ledgerline-logo-{mode}.svg').write_text(svg('0 0 620 116',shapes+word))
icon=svg('0 0 512 512','<rect width="512" height="512" rx="112" fill="#223546"/><g transform="translate(64 82) scale(3)">'+SHAPES.format(ink='#f5f2ea',gold='#d5bb83')+'</g>')
(ROOT/'public/brand/ledgerline-app-icon.svg').write_text(icon)
for name,size in [('app-icon.png',192),('app-icon-large.png',512),('apple-touch-icon.png',180)]:
 subprocess.run(['rsvg-convert','-w',str(size),'-h',str(size),str(ROOT/'public/brand/ledgerline-app-icon.svg'),'-o',str(ROOT/'public'/name)],check=True)
subprocess.run(['rsvg-convert','-w','64','-h','64',str(ROOT/'public/brand/ledgerline-app-icon.svg'),'-o',str(ROOT/'public/favicon.png')],check=True)
for p in (ROOT/'public/splash').glob('*.png'):
 w,h,d=map(int,re.search(r'(\d+)x(\d+)@(\d+)x',p.name).groups());im=Image.new('RGB',(w*d,h*d),'#faf8f2');mark=Image.open(ROOT/'public/app-icon-large.png').convert('RGBA').resize((96*d,96*d));im.paste(mark,((w*d-96*d)//2,(h*d-96*d)//2-40*d),mark);im.save(p)
