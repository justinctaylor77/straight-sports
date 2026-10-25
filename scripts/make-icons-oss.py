# Regenerate public/icons + favicon.ico from design/logo-oss-a.jpg (Old School Sports logo, ss-v21).
# Usage: python3 scripts/make-icons-oss.py   (needs Pillow, numpy, scipy)
import os, numpy as np
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage as ndi
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public') + '/'
SRC = os.path.join(ROOT, 'design', 'logo-oss-a.jpg')
L = Image.LANCZOS
full = Image.open(SRC).convert('RGB')
a = np.asarray(full).astype(float)
bg = np.median(np.concatenate([a[:12].reshape(-1, 3), a[-12:].reshape(-1, 3), a[:, :12].reshape(-1, 3), a[:, -12:].reshape(-1, 3)]), axis=0)
NAVY = tuple(int(round(v)) for v in bg)
d = np.sqrt(((a - bg) ** 2).sum(axis=2))
# outside = navy-ish pixels connected to the image border (inner navy: banner, helmet shadows, stays opaque)
near = d < 38
lab, n = ndi.label(near)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
outside = np.isin(lab, list(border))
outside = ndi.binary_dilation(outside, iterations=1) & (d < 90) | outside   # eat the dark anti-alias fringe
alpha = Image.fromarray(((~outside) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(1.0))
rgba = full.convert('RGBA'); rgba.putalpha(alpha)
bbox = alpha.point(lambda v: 255 if v > 128 else 0).getbbox()
print('navy', NAVY, 'badge bbox', bbox)
bx0, by0, bx1, by1 = bbox
badge = rgba.crop(bbox)                      # transparent badge, tight
bw, bh = badge.size
def fit(img, w, h, pad=0):
    s = min((w - 2 * pad) / img.width, (h - 2 * pad) / img.height)
    r = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), L)
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0)); c.paste(r, ((w - r.width) // 2, (h - r.height) // 2), r); return c
def on_navy(img, size):
    c = Image.new('RGB', (size, size), NAVY); c.paste(img, (0, 0), img); return c
# splash / full logo (transparent, padded square) + header marks (transparent, tight)
fit(badge, 640, 640, 8).save(OUT + 'icons/logo-full-640.png', optimize=True)
mk = fit(badge, 192, 192, 0); mk.save(OUT + 'icons/mark-192.png', optimize=True)
fit(badge, 96, 96, 0).save(OUT + 'icons/mark-96.png', optimize=True)
# app icons: navy square carrying the full badge (wordmark included; fine at 180+)
def app_icon(size, scale):  # scale = badge width fraction of the square
    big = 1024; c = fit(badge, big, big, round(big * (1 - scale) / 2)); return on_navy(c, big).resize((size, size), L)
for name, size in (('icon-512', 512), ('icon-192', 192), ('apple-touch-icon', 180)):
    app_icon(size, 0.92).save(OUT + f'icons/{name}.png', optimize=True)
# maskable: every opaque badge pixel inside the central safe circle (r = 40% of side), per PWA spec
ys, xs = np.nonzero(np.asarray(badge.split()[3]) > 128)
cx, cy = bw / 2, bh / 2
rad = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max()
side = 1024; k = (0.40 * side * 0.98) / rad
r = badge.resize((round(bw * k), round(bh * k)), L)
c = Image.new('RGBA', (side, side), (0, 0, 0, 0)); c.paste(r, ((side - r.width) // 2, (side - r.height) // 2), r)
on_navy(c, side).resize((512, 512), L).save(OUT + 'icons/icon-maskable-512.png', optimize=True)
# favicons: tight square crop of mitt + football + helmet (wordmark banner painted out), navy above
def art_crop(size, cx=515, bottom=634, side=590):
    base = full.copy(); ImageDraw.Draw(base).rectangle((0, bottom, full.width, full.height), fill=(240, 225, 192))
    c = Image.new('RGB', (side, side), NAVY); c.paste(base, (side // 2 - cx, side - bottom)); return c.resize((size, size), L)
art_crop(32).save(OUT + 'icons/favicon-32.png', optimize=True)
art_crop(16).save(OUT + 'icons/favicon-16.png', optimize=True)
art_crop(48).save(OUT + 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
