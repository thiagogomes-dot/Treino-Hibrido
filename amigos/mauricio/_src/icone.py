# Ícones do app do Mauricio Prado a partir do monograma MP do site dele.
# uso: python _src/icone.py  → icon-*.png (opção escolhida) e _src/opcoes.png (comparação)
from PIL import Image, ImageDraw, ImageFilter
import sys
SRC = __file__.rsplit('_src',1)[0] + '_src/'
OUT = __file__.rsplit('_src',1)[0]
BLACK, SAND, ORANGE = (23,25,27), (233,226,212), (255,106,19)
def mono(color):
    m = Image.open(SRC + 'logo-monograma-branco.png').convert('RGBA'); m = m.crop(m.getbbox())
    a = m.split()[3]; solid = Image.new('RGBA', m.size, color + (255,)); solid.putalpha(a); return solid
def icon(opt, size=1024, pad=1.0):
    bg = {'a':BLACK, 'b':ORANGE, 'c':SAND}[opt]
    fg = {'a':(255,255,255), 'b':BLACK, 'c':BLACK}[opt]
    im = Image.new('RGBA', (size, size), bg + (255,))
    if opt == 'a':  # brilho laranja atrás
        g = Image.new('RGBA', (size, size), (0,0,0,0)); d = ImageDraw.Draw(g)
        r = int(size*.36*pad); d.ellipse((size/2-r, size*.48-r, size/2+r, size*.48+r), fill=ORANGE + (90,))
        im.alpha_composite(g.filter(ImageFilter.GaussianBlur(size*.09)))
    m = mono(fg); w = int(size*.58*pad); h = int(m.height * w / m.width)
    m = m.resize((w, h), Image.LANCZOS); x, y = (size-w)//2, int(size*.47 - h/2)
    im.alpha_composite(m, (x, y))
    if opt in ('a','c'):  # barra laranja embaixo, como o destaque do site
        d = ImageDraw.Draw(im); bw = int(size*.20*pad); bh = max(2, int(size*.028*pad)); by = y + h + int(size*.07*pad)
        d.rectangle(((size-bw)//2, by, (size+bw)//2, by+bh), fill=ORANGE)
    return im
if len(sys.argv) > 1:
    o = sys.argv[1]
    icon(o).resize((512,512), Image.LANCZOS).save(OUT + 'icon-512.png')
    icon(o).resize((192,192), Image.LANCZOS).save(OUT + 'icon-192.png')
    icon(o, pad=.78).resize((512,512), Image.LANCZOS).save(OUT + 'maskable-512.png')
    icon(o, pad=.9).convert('RGB').resize((180,180), Image.LANCZOS).save(OUT + 'apple-touch.png')
    print('ok', o)
else:
    sheet = Image.new('RGBA', (3*420+80, 520), (40,40,44,255)); d = ImageDraw.Draw(sheet)
    for i, o in enumerate('abc'):
        ic = icon(o).resize((380,380), Image.LANCZOS)
        mask = Image.new('L', (380,380), 0); ImageDraw.Draw(mask).rounded_rectangle((0,0,379,379), 86, fill=255)
        sheet.paste(ic, (40+i*420, 40), mask); d.text((40+i*420+180, 450), o.upper(), fill=(255,255,255))
    sheet.convert('RGB').save(SRC + 'opcoes.png'); print('ok')
