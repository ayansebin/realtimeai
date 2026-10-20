"""Build timing.js for the notebook video from the film narration: each line's start, length, pause and captions.
usage: python3 make_timing.py"""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
man = json.load(open(os.path.join(HERE, '..', 'film', 'narration', 'manifest.json')))['lines']
src = open(os.path.join(HERE, '..', 'film', 'film_script.py')).read()
subs = {int(n): eval(s) for n, s in re.findall(r"dict\(n=(\d+),.*?subs=(\[.*?\]),\n", src, flags=re.S)}
T, out = 0.6, []
for l in man:
    out.append({'n': l['n'], 'start': round(T, 3), 'dur': l['dur'], 'lead': l['lead'], 'text': l['text'].replace('I B M', 'IBM'), 'subs': subs[l['n']], 'file': l['file']})
    T += l['dur'] + 0.15
open(os.path.join(HERE, 'timing.js'), 'w').write('window.TIMING=' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
print(len(out), 'lines, voice ends', round(T - 0.15, 2))
