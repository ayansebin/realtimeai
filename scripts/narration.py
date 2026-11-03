#!/usr/bin/env python3
"""Generate the demo narration as MP3 files from narration/lines.json.

Primary engine: Kokoro-82M (Apache 2.0, hexgrad/Kokoro-82M), voice af_heart, speed 0.87: the same
voice and pace as the demo films, read as an explanation rather than a pitch.
  kokoro-onnx : kokoro_onnx with kokoro-v1.0.onnx + voices-v1.0.bin in KOKORO_DIR (no download at run time)
  kokoro      : the PyTorch pipeline (downloads the model from Hugging Face)
Fallback: Piper (MIT, rhasspy/piper-voices), voice en_US-lessac-high.
Writes narration/NN.mp3 and narration/manifest.json (durations, and the speech end per clip, which is
what the page uses as the step length). Runs in GitHub Actions.
usage: narration.py [kokoro-onnx|kokoro|piper] [voice]      NARRATION_SPEED overrides the pace
"""
import json, os, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'narration')
LINES = json.load(open(os.path.join(OUT, 'lines.json')))
ENGINE = sys.argv[1] if len(sys.argv) > 1 else 'kokoro-onnx'
VOICE = sys.argv[2] if len(sys.argv) > 2 else 'af_heart'
SPEED = float(os.environ.get('NARRATION_SPEED', '0.87'))
SR = 24000
PAD = 0.12  # silence before and after each clip


def _frames_db(a, hop=240):
    import numpy as np
    n = len(a) // hop
    r = np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)
    return 20 * np.log10(r)


def _tidy(a):
    """Trim the silence Kokoro leaves around a clip, cap pauses that are too long for a read, level the speech."""
    import numpy as np
    a = a.astype(np.float64)
    db = _frames_db(a); on = np.where(db > -50)[0]
    a = a[max(0, on[0] * 240 - int(0.02 * SR)):min(len(a), (on[-1] + 1) * 240 + int(0.02 * SR))]
    db = _frames_db(a); n = len(db); sp = db > np.percentile(db, 90) - 35
    cuts = []; i = 0
    while i < n:
        if not sp[i]:
            j = i
            while j < n and not sp[j]: j += 1
            p = (j - i) * 10
            if 5 < i and j < n - 5 and p > 520:
                rem = int((p - 520) / 10); mid = (i + j) // 2
                cuts.append(((mid - rem // 2) * 240, (mid - rem // 2 + rem) * 240))
            i = j
        else:
            i += 1
    if cuts:
        parts, prev = [], 0
        for s, e in cuts: parts.append(a[prev:s]); prev = e
        parts.append(a[prev:]); out = parts[0]; xf = 120
        for p in parts[1:]:
            r = np.linspace(0, 1, xf)
            out = np.concatenate([out[:-xf], out[-xf:] * (1 - r) + p[:xf] * r, p[xf:]])
        a = out
    db = _frames_db(a); lvl = db[db > np.percentile(db, 90) - 28].mean()
    return a * 10 ** ((-20.0 - lvl) / 20)


def _write(l, audio):
    import numpy as np, soundfile as sf
    pad = np.zeros(int(SR * PAD))
    sf.write(os.path.join(OUT, l['id'] + '.wav'), np.concatenate([pad, audio, pad]).astype(np.float32), SR)
    print(ENGINE, l['id'], round(len(audio) / SR, 2), 's', flush=True)


def _prune():
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f[:2].isdigit() and int(f[:2]) > len(LINES):
            os.remove(os.path.join(OUT, f))


def kokoro_onnx():
    from kokoro_onnx import Kokoro
    kd = os.environ.get('KOKORO_DIR', '.')
    k = Kokoro(os.path.join(kd, 'kokoro-v1.0.onnx'), os.path.join(kd, 'voices-v1.0.bin'))
    for l in LINES:
        a, sr = k.create(l['text'], voice=VOICE, speed=SPEED, lang='en-us')
        assert sr == SR
        _write(l, _tidy(a))
    _prune()


def kokoro():
    import numpy as np
    from kokoro import KPipeline
    pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
    for l in LINES:
        chunks = [audio for _, _, audio in pipe(l['text'], voice=VOICE, speed=SPEED)]
        _write(l, _tidy(np.concatenate([np.asarray(c) for c in chunks])))
    _prune()


def piper():
    base = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high'
    for ext in ('.onnx', '.onnx.json'):
        fn = os.path.join(OUT, 'voice' + ext)
        if not os.path.exists(fn):
            urllib.request.urlretrieve(base + ext, fn)
    for l in LINES:
        wav = os.path.join(OUT, l['id'] + '.wav')
        subprocess.run([sys.executable, '-m', 'piper', '--model', os.path.join(OUT, 'voice.onnx'), '--output_file', wav],
                       input=l['text'].encode(), check=True)
        print('piper', l['id'], flush=True)
    for ext in ('.onnx', '.onnx.json'):
        os.remove(os.path.join(OUT, 'voice' + ext))
    _prune()


def encode():
    man = []
    for l in LINES:
        wav = os.path.join(OUT, l['id'] + '.wav')
        mp3 = os.path.join(OUT, l['id'] + '.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', str(SR), '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', mp3], check=True)
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', mp3]).decode().strip())
        wav_dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', wav]).decode().strip())
        os.remove(wav)
        man.append({'id': l['id'], 'file': l['id'] + '.mp3', 'dur': round(dur, 2), 'speech_end': round(wav_dur - PAD, 2), 'text': l['text']})
        print('mp3', l['id'], round(dur, 2), 's', os.path.getsize(mp3), 'bytes', flush=True)
    json.dump({'engine': ENGINE, 'voice': VOICE, 'speed': SPEED, 'lines': man}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)


if __name__ == '__main__':
    {'kokoro-onnx': kokoro_onnx, 'kokoro': kokoro, 'piper': piper}[ENGINE]()
    encode()
