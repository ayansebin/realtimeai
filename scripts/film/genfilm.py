"""Generate the film narration with Kokoro from narration/lines.json, one sentence at a time.
Each line: a leading pause, then its sentences with a short breath between them (longer where pause_before says so),
short punch lines a touch slower. Writes loudness-normalized MP3s and manifest.json with every sentence's timing,
so film_script.py can put captions and on-screen actions on the exact words.
Voice af_heart at speed 0.84, 0.80 on sentences of seven words or fewer (FILM_VOICE, FILM_SPEED, FILM_SLOW override).
Models: kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx releases (model-files-v1.0), in KOKORO_DIR.
usage: python3 genfilm.py"""
import json, re, numpy as np, soundfile as sf, subprocess, os
from kokoro_onnx import Kokoro
VOICE = os.environ.get('FILM_VOICE', 'af_heart')
SPEED = float(os.environ.get('FILM_SPEED', '0.84')); SLOW = float(os.environ.get('FILM_SLOW', '0.80')); SHORT = 7
GAP = 0.34                                   # breath between sentences
HERE = os.path.dirname(os.path.abspath(__file__)); KD = os.environ.get('KOKORO_DIR', '.')
SR = 24000

def _frames_db(a, hop=240):
  n = len(a) // hop; r = np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12); return 20 * np.log10(r)
def _trim(a):
  """Trim the silence Kokoro leaves around a clip and cap pauses inside it at 520 ms."""
  a = a.astype(np.float64); db = _frames_db(a); on = np.where(db > -50)[0]
  a = a[max(0, on[0] * 240 - int(.02 * SR)):min(len(a), (on[-1] + 1) * 240 + int(.03 * SR))]
  db = _frames_db(a); n = len(db); sp = db > np.percentile(db, 90) - 35; cuts = []; i = 0
  while i < n:
    if not sp[i]:
      j = i
      while j < n and not sp[j]: j += 1
      p = (j - i) * 10
      if 5 < i and j < n - 5 and p > 520:
        rem = int((p - 520) / 10); mid = (i + j) // 2; cuts.append(((mid - rem // 2) * 240, (mid - rem // 2 + rem) * 240))
      i = j
    else: i += 1
  if cuts:
    parts, prev = [], 0
    for s_, e_ in cuts: parts.append(a[prev:s_]); prev = e_
    parts.append(a[prev:]); out = parts[0]; xf = 120
    for q in parts[1:]:
      r = np.linspace(0, 1, xf); out = np.concatenate([out[:-xf], out[-xf:] * (1 - r) + q[:xf] * r, q[xf:]])
    a = out
  return a
def sentences(t): return [s for s in re.split(r'(?<=[.!?])\s+', t.strip()) if s]

k = Kokoro(os.path.join(KD, 'kokoro-v1.0.onnx'), os.path.join(KD, 'voices-v1.0.bin'))
OUT = os.path.join(HERE, 'narration'); L = json.load(open(os.path.join(OUT, 'lines.json'))); man = []
for f in os.listdir(OUT):
  if f.endswith('.mp3'): os.remove(os.path.join(OUT, f))
for l in L:
  pre = l.get('pause_before', {}); t = l['lead']; parts = [np.zeros(int(SR * l['lead']))]; segs = []
  for j, s in enumerate(sentences(l['text'])):
    if j:
      g = next((v for key, v in pre.items() if s.startswith(key)), GAP); parts.append(np.zeros(int(SR * g))); t += int(SR * g) / SR
    a, _ = k.create(s.replace('IBM', 'I B M'), voice=VOICE, speed=SLOW if len(s.split()) <= SHORT else SPEED, lang='en-us')
    a = _trim(a); parts.append(a); segs.append({'text': s, 'start': round(t, 3), 'end': round(t + len(a) / SR, 3)}); t += len(a) / SR
  a = np.concatenate(parts + [np.zeros(int(.06 * SR))])
  db = _frames_db(a); lvl = db[db > np.percentile(db, 90) - 28].mean(); a = (a * 10 ** ((-20.0 - lvl) / 20)).astype(np.float32)
  fn = '%02d.mp3' % l['n']; w = os.path.join(OUT, fn + '.wav'); sf.write(w, a, SR)
  subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', w, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', os.path.join(OUT, fn)], check=True)
  d = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', os.path.join(OUT, fn)]).decode()); os.remove(w)
  man.append({'n': l['n'], 'file': fn, 'dur': round(d, 2), 'lead': l['lead'], 'text': l['text'], 'segs': segs}); print(fn, round(d, 2), flush=True)
json.dump({'engine': 'kokoro', 'voice': VOICE, 'speed': SPEED, 'slow': SLOW, 'lines': man}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print('total voice', round(sum(x['dur'] for x in man), 2))
