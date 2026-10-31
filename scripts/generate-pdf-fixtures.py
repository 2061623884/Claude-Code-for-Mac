# Optional fixture regeneration: Python with reportlab and pypdf installed.
from pathlib import Path
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
root = Path(__file__).resolve().parent.parent / 'test/fixtures/documents'
root.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
c = canvas.Canvas(str(root / 'chinese.pdf'), pagesize=(420, 300), invariant=1)
c.setFont('STSong-Light', 20)
c.drawString(30, 240, '中文文档：侧栏离线预览')
c.drawString(30, 200, '表格、图片和 PDF 阅读测试')
c.save()
image = Image.new('RGB', (600, 300), 'white')
draw = ImageDraw.Draw(image)
draw.rectangle((30,30,570,270), outline='navy', width=6)
draw.text((80,120), 'Scanned document preview 123', fill='black', font_size=26)
image.save(root / 'picture.png')
data = BytesIO(); image.save(data, format='PNG'); data.seek(0)
c = canvas.Canvas(str(root / 'scanned.pdf'), pagesize=(420,300), invariant=1)
c.drawImage(ImageReader(data),30,60,width=360,height=180); c.save()
writer = PdfWriter()
writer.append(PdfReader(root / 'chinese.pdf'))
writer.encrypt('preview', algorithm='RC4-128')
with (root / 'protected.pdf').open('wb') as handle: writer.write(handle)
