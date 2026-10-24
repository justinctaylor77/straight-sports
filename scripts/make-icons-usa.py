# Regenerate public/icons from /workspace/logos/logo4-usa.png (+ -transparent.png for the header mark).
from PIL import Image
OUT='/workspace/sports-app/public/'
NAVY=(0x06,0x12,0x25)
full=Image.open('/workspace/logos/logo4-usa.png').convert('RGB')
tr=Image.open('/workspace/logos/logo4-usa-transparent.png').convert('RGBA')
L=Image.LANCZOS
S_only=full.copy(); S_only.paste(NAVY,(0,780,1024,1024))  # icons carry the S only (no wordmark)
def sq(img,cx,cy,side,size,bg=None):
    box=(cx-side/2,cy-side/2,cx+side/2,cy+side/2)
    return img.crop(tuple(int(round(v)) for v in box)).resize((size,size),L)
def crop_pad(img,cx,cy,side,size,bg):
    # crop that may extend past image: paste onto bg canvas
    s=int(round(side)); c=Image.new('RGB',(s,s),bg)
    c.paste(img,(int(round(s/2-cx)),int(round(s/2-cy)))); return c.resize((size,size),L)
cx,cy=512.5,435.5   # centre of the S (bbox 314-711 x 120-751)
for name,size in (('icon-192',192),('icon-512',512),('apple-touch-icon',180)):
    sq(S_only,cx,cy,783,size).save(OUT+f'icons/{name}.png',optimize=True)
crop_pad(S_only,cx,cy,1013,512,NAVY).save(OUT+'icons/icon-maskable-512.png',optimize=True)
full.resize((640,640),L).save(OUT+'icons/logo-full-640.png',optimize=True)
# transparent header marks: tight crop of the S
side=655; mk=tr.crop((int(cx-side/2),110,int(cx+side/2),110+side))
mk.resize((192,192),L).save(OUT+'icons/mark-192.png',optimize=True)
mk.resize((96,96),L).save(OUT+'icons/mark-96.png',optimize=True)
f32=sq(S_only,cx,cy,720,32); f16=sq(S_only,cx,cy,720,16); f48=sq(S_only,cx,cy,720,48)
f32.save(OUT+'icons/favicon-32.png',optimize=True); f16.save(OUT+'icons/favicon-16.png',optimize=True)
f48.save(OUT+'favicon.ico',sizes=[(16,16),(32,32),(48,48)])
