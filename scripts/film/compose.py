"""Compose the film-mode capture into a 1080p30 MP4.
Constant frame rate, crossfades at every cut (starting on the first frame that shows the new shot),
brand, labels and captions drawn on top from the logged events, fades in and out, narration mixed in.
usage: python3 compose.py <capture dir> <out.mp4> [tail seconds]"""
import json, sys, bisect, subprocess, math, os
import numpy as np
from PIL import Image

D, OUT = sys.argv[1], sys.argv[2]
TAIL = float(sys.argv[3]) if len(sys.argv) > 3 else 1.6
FPS, XF, FIN, FOUT, CAPIN = 30, 0.45, 0.45, 0.7, 0.18
PAPER = np.array([236, 235, 230], dtype=np.float32)  # the site's paper color, fades go to it
NAR = os.environ.get('NARRATION', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'narration')) + '/'

m = json.load(open(D + '/meta.json'))
frames = sorted(m['frames'], key=lambda f: f['t']); ts = [f['t'] for f in frames]
T0 = m['plays'][0]['t'] / 1000 - 0.35
def ease(x): x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)
def thumb(i): return np.asarray(Image.open(D + '/' + frames[i]['name']).convert('L').resize((160, 90)), dtype=np.float32)
def visual(c):  # first captured frame that actually shows the new shot, and the last frame of the old one
    i = bisect.bisect_left(ts, c); ref = thumb(max(0, i - 1))
    for j in range(i, len(ts)):
        if ts[j] - c > 1.5: break
        if np.abs(thumb(j) - ref).mean() > 3.0: return ts[j] - 0.001, ts[max(0, i - 1)]
    return c, ts[max(0, i - 1)]
cuts = [(c['why'], c['t'] / 1000) for c in m['cuts']]
xcuts = [(w,) + visual(t) for w, t in cuts if w != 'start']          # (why, visual time, old frame time)
vc = {w: c for w, c, o in xcuts}
OV_ON, OV_OFF = vc['title'] - T0, dict(cuts)['end'] - T0                     # overlays live between the title card and the end card

man = json.load(open(NAR + 'manifest.json'))['lines']
plays = [(p['t'] / 1000 - T0, man[k]['dur'], man[k]['file']) for k, p in enumerate(m['plays'])]
END = plays[-1][0] + plays[-1][1] + TAIL
N = int(round(END * FPS))

# overlays
idx = json.load(open(D + '/ovl/index.json'))
def load_ovl(fn):
    a = np.asarray(Image.open(D + '/ovl/' + fn).convert('RGBA'), dtype=np.float32)
    al = a[..., 3] / 255.0; ys, xs = np.nonzero(al > 0.003)
    if not len(ys): return None
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return (y0, y1, x0, x1, a[y0:y1, x0:x1, :3], al[y0:y1, x0:x1, None])
brand = load_ovl('brand.png')
CAPS = {h: load_ovl(f) for h, f in idx['caps'].items()}
LABS = {h: load_ovl(f) for h, f in idx['labels'].items()}
caps = [(c['t'] / 1000 - T0, c['h']) for c in m['caps'] if c.get('step') != 12]
def snap(t):  # labels change with the picture, not with the voice
    best = None
    for w, c, o in xcuts:
        if t - 0.05 <= c <= t + 1.5 and (best is None or c < best): best = c
    return (best if best is not None else t + T0) - T0
labels = [(snap(l['t'] / 1000), l['h']) for l in m['labels']]

def comp(fr, ov, k):
    if ov is None or k <= 0.002: return
    y0, y1, x0, x1, rgb, al = ov
    a = al * k
    fr[y0:y1, x0:x1] = fr[y0:y1, x0:x1] * (1 - a) + rgb * a

cache = {}
def img(i):
    n = frames[i]['name']
    if n not in cache:
        if len(cache) > 6: cache.pop(next(iter(cache)))
        cache[n] = np.asarray(Image.open(D + '/' + n).convert('RGB'), dtype=np.float32)
    return cache[n]
def at(t): return max(0, bisect.bisect_right(ts, t) - 1)

ins, flt = [], []
for k, (st, dur, fn) in enumerate(plays):
    ms = max(0, int(round(st * 1000)))
    ins += ['-i', NAR + fn]; flt.append(f'[{k+1}:a]adelay={ms}|{ms},aresample=48000[a{k}]')
mix = ''.join(f'[a{k}]' for k in range(len(plays))) + f'amix=inputs={len(plays)}:normalize=0,apad,atrim=0:{END:.3f},afade=t=out:st={END-0.4:.3f}:d=0.4[aout]'
cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1920x1080', '-r', str(FPS), '-i', '-'] + ins + \
      ['-filter_complex', ';'.join(flt + [mix]), '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
       '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', OUT]
ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
for k in range(N):
    vt = k / FPS; t = T0 + vt
    fr = img(at(t)).copy()
    for w, c, oldt in xcuts:
        if c <= t < c + XF:
            a = ease((t - c) / XF)
            fr = img(at(oldt)) * (1 - a) + fr * a
            break
    ov = min(ease((vt - OV_ON) / XF), 1 - ease((vt - OV_OFF) / XF))
    if ov > 0:
        comp(fr, brand, ov)
        j = bisect.bisect_right([l[0] for l in labels], vt) - 1
        if j >= 0:
            a = ease((vt - labels[j][0]) / XF)
            if a < 1 and j > 0: comp(fr, LABS.get(labels[j - 1][1]), ov * (1 - a))
            comp(fr, LABS.get(labels[j][1]), ov * a)
        i = bisect.bisect_right([c[0] for c in caps], vt) - 1
        if i >= 0:
            comp(fr, CAPS.get(caps[i][1]), ov * ease((vt - caps[i][0]) / CAPIN))
    g = min(ease(vt / FIN), ease((END - vt) / FOUT))
    if g < 1: fr = fr * g + PAPER * (1 - g)
    ff.stdin.write(np.clip(fr, 0, 255).astype(np.uint8).tobytes())
ff.stdin.close(); ff.wait()
print(OUT, round(END, 2), 's,', N, 'frames; visual cuts at', [round(c - T0, 2) for w, c, o in xcuts])
