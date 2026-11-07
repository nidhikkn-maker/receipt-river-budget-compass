"""Representative synthetic files for scripts/check-actual-statement-extraction.ts.
No private data. Writes only to the explicit output folder (default /tmp/browser/actual-extraction).
"""
import sys
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/browser/actual-extraction')
folder.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (1600, 1000), 'white')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26)
rows = ['CONTROLLED TEST BANK - SYNTHETIC DOCUMENT', 'Account statement 1 October - 3 October 2026',
        'Opening balance INR 1,000.00', 'Date           Description          Debit       Credit        Balance',
        '2026-10-02     SWIGGY ORDER         250.00                    750.00',
        '2026-10-03     AMAZON PURCHASE      480.00                    270.00',
        'Closing balance INR 270.00', 'Total debit INR 730.00. Total credit INR 0.00.']
for index, row in enumerate(rows):
    draw.text((50, 70 + index * 90), row, font=font, fill='black')
image.save(folder / 'scan.jpg')
image.save(folder / 'scanned.pdf', 'PDF', resolution=150)
(folder / 'statement.csv').write_text('Date,Description,Debit,Credit\n2026-10-02,SWIGGY ORDER,250.00,\n2026-10-03,AMAZON PURCHASE,480.00,\n')
subprocess.run(['bun', str(Path(__file__).with_name('make_balanced_statement.ts')), str(folder / 'text.pdf')], check=True)