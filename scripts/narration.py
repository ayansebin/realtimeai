#!/usr/bin/env python3
"""Generate the demo narration as MP3 files from narration/lines.json.

Primary engine: Kokoro-82M (Apache 2.0, hexgrad/Kokoro-82M), voice af_heart.
Fallback: Piper (MIT, rhasspy/piper-voices), voice en_US-lessac-high.
Writes narration/NN.mp3 and narration/manifest.json (durations). Runs in GitHub Actions.
"""
import json, os, subprocess, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'narration')
LINES = json.load(open(os.path.join(OUT, 'lines.json')))
ENGINE = sys.argv[1] if len(sys.argv) > 1 else 'kokoro'
VOICE = sys.argv[2] if len(sys.argv) > 2 else 'am_michael'


def kokoro():
    import numpy as np, soundfile as sf
    from kokoro import KPipeline
    pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')
    for l in LINES:
        chunks = [audio for _, _, audio in pipe(l['text'], voice=VOICE, speed=1.0)]
        audio = np.concatenate([np.asarray(c) for c in chunks])
        pad = np.zeros(int(24000 * 0.25), dtype=audio.dtype)
        sf.write(os.path.join(OUT, l['id'] + '.wav'), np.concatenate([pad, audio, pad]), 24000)
        print('kokoro', l['id'], round(len(audio) / 24000, 2), 's', flush=True)
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f[:2].isdigit() and int(f[:2]) > len(LINES):
            os.remove(os.path.join(OUT, f))


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
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f[:2].isdigit() and int(f[:2]) > len(LINES):
            os.remove(os.path.join(OUT, f))


def encode():
    man = []
    for l in LINES:
        wav = os.path.join(OUT, l['id'] + '.wav')
        mp3 = os.path.join(OUT, l['id'] + '.mp3')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', mp3], check=True)
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', mp3]).decode().strip())
        os.remove(wav)
        man.append({'id': l['id'], 'file': l['id'] + '.mp3', 'dur': round(dur, 2), 'text': l['text']})
        print('mp3', l['id'], round(dur, 2), 's', os.path.getsize(mp3), 'bytes', flush=True)
    json.dump({'engine': ENGINE, 'voice': VOICE, 'lines': man}, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)


if __name__ == '__main__':
    {'kokoro': kokoro, 'piper': piper}[ENGINE]()
    encode()
