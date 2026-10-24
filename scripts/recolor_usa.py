# Recolor logo4-olive.png (orange football / olive baseball) -> USA red / blue / white. Shape unchanged.
import numpy as np
from PIL import Image
from scipy import ndimage as nd
SRC='/workspace/logos/logo4-olive.png'
RED=np.array([0xB2,0x22,0x34],float); BLUE=np.array([0x3B,0x5F,0xAB],float)
WHITE=np.array([255,255,255],float); NAVY=np.array([0x06,0x12,0x25],float)
im=np.array(Image.open(SRC).convert('RGB')).astype(float)
H,W,_=im.shape
# endpoints in the source
P=np.array([[6,6,6],[255,79,3],[107,142,35],[247,241,227]],float)  # bg, orange, green, cream
A=np.vstack([P.T,np.ones(4)])           # barycentric solve
Ainv=np.linalg.inv(A)
px=im.reshape(-1,3)
w=(np.hstack([px,np.ones((len(px),1))])@Ainv.T)
w=np.clip(w,0,None); w/=np.maximum(w.sum(1,keepdims=True),1e-6)
w=w.reshape(H,W,4)
# hard classes to find stitches: small orange/cream blobs on the green band (below the football)
cls=w.argmax(2)
orange=(cls==1)|(cls==3)
lab,n=nd.label(orange)
sizes=nd.sum(orange,lab,range(1,n+1))
stitch=np.zeros((H,W),bool)
for i,s in enumerate(sizes,1):
    m=lab==i
    ys,xs=np.where(m)
    if s<1500 and ys.mean()>440 and ys.mean()<780: stitch|=m
stitch=nd.binary_dilation(stitch,iterations=2)
# also peach-ish pixels (low-sat cream mixed) next to stitches
w2=w.copy()
sw=stitch
# stitch pixels: composition among non-bg colors -> blue vs white (so red/peach stitches become clean white)
nb=1-w[...,0]
t=np.clip((w[...,1]+w[...,3])/np.maximum(w[...,1]+w[...,2]+w[...,3],1e-6),0,1)
t=np.clip((t-0.1)/0.5,0,1)   # sharpen: solid stitch interiors -> pure white
nb2=np.clip((nb-0.1)/0.7,0,1)
w2[...,3]=np.where(sw,nb2*t,w[...,3]); w2[...,2]=np.where(sw,nb2*(1-t),w[...,2]); w2[...,1]=np.where(sw,0,w[...,1]); w2[...,0]=np.where(sw,1-nb2,w[...,0])
# wordmark band (y>780): green -> light-ish blue for contrast on navy
wm=np.zeros((H,W),bool); wm[780:]=True
BLUE_WM=np.array([0x5E,0x86,0xD4],float)
def render(bgcol, alpha=False):
    out=np.zeros((H,W,3))
    blue=np.where(wm[...,None],BLUE_WM,BLUE)
    colors=[bgcol,RED,blue,WHITE]
    for k in range(4):
        c=colors[k] if k!=2 else blue
        out+=w2[...,k:k+1]*c
    if not alpha: return Image.fromarray(np.clip(out+.5,0,255).astype('uint8'))
    a=1-w2[...,0]
    col=np.zeros((H,W,3))
    for k in range(1,4):
        c=colors[k]; col+=w2[...,k:k+1]*c
    col=col/np.maximum(a[...,None],1e-6)
    rgba=np.dstack([np.clip(col+.5,0,255),np.clip(a*255+.5,0,255)]).astype('uint8')
    return Image.fromarray(rgba,'RGBA')
if __name__=='__main__':
    render(NAVY).save('/workspace/logos/logo4-usa.png')
    render(NAVY,True).save('/workspace/logos/logo4-usa-transparent.png')
