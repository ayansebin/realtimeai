"""Mux the notebook frames with the film narration. usage: python3 compose_sketch.py frames out.mp4"""
import json, re, subprocess, sys, os, glob
D, OUT = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
NAR = os.environ.get('NARRATION', os.path.join(HERE, '..', 'film', 'narration')).rstrip('/') + '/'
T = json.loads(re.search(r'window\.TIMING=(.*);', open(os.path.join(HERE, 'timing.js')).read(), re.S).group(1))
N = len(glob.glob(D + '/*.jpg')); dur = N / 30
ins, flt = [], []
for k, l in enumerate(T):
    ms = int(round(l['start'] * 1000)); ins += ['-i', NAR + l['file']]; flt.append(f'[{k+1}:a]adelay={ms}|{ms},aresample=48000[a{k}]')
mix = ''.join(f'[a{k}]' for k in range(len(T))) + f'amix=inputs={len(T)}:normalize=0,apad,atrim=0:{dur:.3f},afade=t=out:st={dur-0.5:.3f}:d=0.5[aout]'
cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '30', '-i', D + '/%05d.jpg'] + ins + ['-filter_complex', ';'.join(flt + [mix]),
       '-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30',
       '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', OUT]
subprocess.run(cmd, check=True)
print(OUT, round(dur, 2), 's')
