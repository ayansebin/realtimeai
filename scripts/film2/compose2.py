"""Compose the film2 capture into a 1080p30 MP4 on the source film's own timeline.
Constant frame rate, crossfades at every cut (from the first frame that shows the new shot), brand, labels and
captions drawn on top, a fade in from the paper and a fade out to navy, the source film's voice track muxed in
untouched, and its subtitle track kept.
usage: python3 compose2.py <capture dir> <audio file> <captions.srt> <out.mp4>"""
import json, sys, bisect, subprocess, os
import numpy as np
from PIL import Image

D, AUDIO, SRT, OUT = sys.argv[1:5]
FPS, XF, FIN, FOUT, CAPIN = 30, 0.45, 0.45, 0.7, 0.18
PAPER = np.array([248, 248, 248], dtype=np.float32)
NAVY = np.array([4, 5, 49], dtype=np.float32)

m = json.load(open(D + '/meta.json'))
frames = sorted(m['frames'], key=lambda f: f['t']); ts = [f['t'] for f in frames]
T0 = m['t0'] / 1000.0; END = float(m['end'])
def ease(x): x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)
def thumb(i): return np.asarray(Image.open(D + '/' + frames[i]['name']).convert('L').resize((160, 90)), dtype=np.float32)
def visual(c):  # first captured frame that actually shows the new shot, and the last frame of the old one
    i = bisect.bisect_left(ts, c); ref = thumb(max(0, i - 1))
    for j in range(i, len(ts)):
        if ts[j] - c > 1.5: break
        if np.abs(thumb(j) - ref).mean() > 3.0: return ts[j] - 0.001, ts[max(0, i - 1)]
    return c, ts[max(0, i - 1)]
cuts = [(c['why'], c['t'] / 1000.0) for c in m['cuts'] if c['why'] != 'start']
xcuts = [(w,) + visual(t) for w, t in cuts]          # (why, visual time, old frame time), absolute seconds
N = int(round(END * FPS))

idx = json.load(open(D + '/ovl/index.json'))
def load_ovl(fn):
    a = np.asarray(Image.open(D + '/ovl/' + fn).convert('RGBA'), dtype=np.float32)
    al = a[..., 3] / 255.0; ys, xs = np.nonzero(al > 0.003)
    if not len(ys): return None
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return (y0, y1, x0, x1, a[y0:y1, x0:x1, :3], al[y0:y1, x0:x1, None])
BRANDS = {k: load_ovl(f) for k, f in idx['brands'].items()}
LABS = {h: load_ovl(f) for h, f in idx['labels'].items()}
CAPS = [(c['a'], load_ovl(c['f']), load_ovl(c.get('fl', c['f']))) for c in idx['caps']]
END_CUT = next((c - T0 for w, c, o in xcuts if w == 'end'), None)   # light captions on the navy closing card
def snap(t):  # labels and the brand change with the picture, not before it
    best = None
    for w, c, o in xcuts:
        if t - 0.05 <= c <= t + 1.5 and (best is None or c < best): best = c
    return (best if best is not None else t) - T0
labels = sorted((snap(l['t'] / 1000.0), l['h']) for l in m['labels'])
brands = sorted((snap(b['t'] / 1000.0), (None if b['text'] is None else b['text'] + '|' + str(b['quiet']).lower())) for b in m['brands'])
if not brands or brands[0][0] > 0: brands.insert(0, (0.0, 'Real-time intelligence|false'))
if not labels or labels[0][0] > 0: labels.insert(0, (0.0, ''))

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
def stateAt(seq, vt):
    j = bisect.bisect_right([s[0] for s in seq], vt) - 1
    return j
cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', '1920x1080', '-r', str(FPS), '-i', '-', '-i', AUDIO, '-i', SRT,
       '-filter_complex', f'[1:a]apad,atrim=0:{END:.3f},afade=t=out:st={END-0.5:.3f}:d=0.5[aout]',
       '-map', '0:v', '-map', '[aout]', '-map', '2:s', '-c:v', 'libx264', '-preset', os.environ.get('X264_PRESET', 'veryfast'), '-crf', os.environ.get('X264_CRF', '18'),
       '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=eng', '-movflags', '+faststart', OUT]
ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
for k in range(N):
    vt = k / FPS; t = T0 + vt
    fr = img(at(t)).copy()
    for w, c, oldt in xcuts:
        if c <= t < c + XF:
            a = ease((t - c) / XF)
            fr = img(at(oldt)) * (1 - a) + fr * a
            break
    # brand
    j = stateAt(brands, vt)
    if j >= 0:
        a = ease((vt - brands[j][0]) / XF)
        if a < 1 and j > 0 and brands[j - 1][1]: comp(fr, BRANDS.get(brands[j - 1][1]), 1 - a)
        if brands[j][1]: comp(fr, BRANDS.get(brands[j][1]), a)
    # label
    j = stateAt(labels, vt)
    if j >= 0:
        a = ease((vt - labels[j][0]) / XF)
        if a < 1 and j > 0: comp(fr, LABS.get(labels[j - 1][1]), 1 - a)
        comp(fr, LABS.get(labels[j][1]), a)
    # caption: each one holds until the next starts
    i = bisect.bisect_right([c[0] for c in CAPS], vt) - 1
    if i >= 0: comp(fr, CAPS[i][2] if (END_CUT is not None and vt >= END_CUT) else CAPS[i][1], ease((vt - CAPS[i][0]) / CAPIN))
    g_in = ease(vt / FIN); g_out = ease((END - vt) / FOUT)
    if g_in < 1: fr = fr * g_in + PAPER * (1 - g_in)
    if g_out < 1: fr = fr * g_out + NAVY * (1 - g_out)
    ff.stdin.write(np.clip(fr, 0, 255).astype(np.uint8).tobytes())
ff.stdin.close(); ff.wait()
print(OUT, round(END, 2), 's,', N, 'frames; visual cuts at', [(w, round(c - T0, 2)) for w, c, o in xcuts])
