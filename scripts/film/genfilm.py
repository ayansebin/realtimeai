"""Generate the film narration from narration/lines.json, one sentence at a time: ElevenLabs (FILM_ENGINE=eleven) or Kokoro.
Each line: a leading pause, then its sentences with a short breath between them (longer where pause_before says so),
short punch lines a touch slower. Writes loudness-normalized MP3s and manifest.json with every sentence's timing,
so film_script.py can put captions and on-screen actions on the exact words.
Voice af_heart at speed 0.84, 0.80 on sentences of seven words or fewer (FILM_VOICE, FILM_SPEED, FILM_SLOW override).
Models: kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx releases (model-files-v1.0), in KOKORO_DIR.
ElevenLabs: Jessica Anne (a professional, conversational American voice from the ElevenLabs voice library) on Eleven v4,
voiced through the site's AI Gateway by eleven_clips.py, one MP3 per sentence in FILM_CLIPS named by
sha1(FILM_VOICE + '|elevenlabs/eleven-v4|' + sentence)[:16]. Eleven v4 takes no speed setting through the gateway, so the
pace can be changed with a pitch and formant preserving time stretch (FILM_TEMPO); the film uses 1.0, her natural pace of about
150 words a minute. FILM_GAPS scales the breaths between sentences (1.0).
usage: python3 genfilm.py"""
import json, re, numpy as np, soundfile as sf, subprocess, os, hashlib
ENGINE = os.environ.get('FILM_ENGINE', 'kokoro')
TEMPO = float(os.environ.get('FILM_TEMPO', '1.0')); GAPS = float(os.environ.get('FILM_GAPS', '1.0')) if ENGINE == 'eleven' else 1.0
CLIPS = os.environ.get('FILM_CLIPS', '.')
VOICE = os.environ.get('FILM_VOICE', 'jessicaanne' if ENGINE == 'eleven' else 'af_heart')
ELEVEN = VOICE + '|elevenlabs/eleven-v4|'
SPEED = float(os.environ.get('FILM_SPEED', '0.84')); SLOW = float(os.environ.get('FILM_SLOW', '0.80')); SHORT = 7
GAP = 0.34 * GAPS                            # breath between sentences
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

def eleven(s):
  """One sentence from its ElevenLabs clip, slowed by TEMPO without changing the pitch, as 24 kHz mono."""
  f = os.path.join(CLIPS, hashlib.sha1((ELEVEN + s).encode()).hexdigest()[:16] + '.mp3')
  if not os.path.exists(f): raise SystemExit('no ElevenLabs clip for: ' + s)
  af = 'aresample=48000,rubberband=tempo=%g:transients=mixed:detector=compound:phase=laminar:window=standard:formant=preserved:pitchq=quality,aresample=%d' % (TEMPO, SR)
  raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-af', af, '-ac', '1', '-f', 'f32le', '-'], check=True, capture_output=True).stdout
  return np.frombuffer(raw, dtype=np.float32).copy()
if ENGINE != 'eleven':
  from kokoro_onnx import Kokoro
  k = Kokoro(os.path.join(KD, 'kokoro-v1.0.onnx'), os.path.join(KD, 'voices-v1.0.bin'))
OUT = os.path.join(HERE, 'narration'); L = json.load(open(os.path.join(OUT, 'lines.json'))); man = []
for f in os.listdir(OUT):
  if f.endswith('.mp3'): os.remove(os.path.join(OUT, f))
for l in L:
  pre = l.get('pause_before', {}); t = l['lead']; parts = [np.zeros(int(SR * l['lead']))]; segs = []
  for j, s in enumerate(sentences(l['text'])):
    if j:
      g = next((v * GAPS for key, v in pre.items() if s.startswith(key)), GAP); parts.append(np.zeros(int(SR * g))); t += int(SR * g) / SR
    if ENGINE == 'eleven': a = eleven(s)
    else: a, _ = k.create(s.replace('IBM', 'I B M'), voice=VOICE, speed=SLOW if len(s.split()) <= SHORT else SPEED, lang='en-us')
    a = _trim(a); parts.append(a); segs.append({'text': s, 'start': round(t, 3), 'end': round(t + len(a) / SR, 3)}); t += len(a) / SR
  a = np.concatenate(parts + [np.zeros(int(.06 * SR))])
  db = _frames_db(a); lvl = db[db > np.percentile(db, 90) - 28].mean(); a = (a * 10 ** ((-20.0 - lvl) / 20)).astype(np.float32)
  fn = '%02d.mp3' % l['n']; w = os.path.join(OUT, fn + '.wav'); sf.write(w, a, SR)
  subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', w, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', os.path.join(OUT, fn)], check=True)
  d = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', os.path.join(OUT, fn)]).decode()); os.remove(w)
  man.append({'n': l['n'], 'file': fn, 'dur': round(d, 2), 'lead': l['lead'], 'text': l['text'], 'segs': segs}); print(fn, round(d, 2), flush=True)
info = {'engine': 'elevenlabs', 'model': 'elevenlabs/eleven-v4', 'voice': VOICE, 'tempo': TEMPO, 'gaps': GAPS} if ENGINE == 'eleven' else {'engine': 'kokoro', 'voice': VOICE, 'speed': SPEED, 'slow': SLOW}
json.dump(dict(info, lines=man), open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print('total voice', round(sum(x['dur'] for x in man), 2))
