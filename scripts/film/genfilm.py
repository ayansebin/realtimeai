"""Generate the film narration with Kokoro from narration/lines.json: a leading pause per line, loudness-normalized MP3s and manifest.json.
Voice af_heart at speed 0.87 by default: the same voice and pace as the other demo films (FILM_VOICE overrides the voice).
Models: kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx releases (model-files-v1.0), in KOKORO_DIR.
usage: python3 genfilm.py [speed, default 0.87]"""
import json, numpy as np, soundfile as sf, subprocess, os, sys
from kokoro_onnx import Kokoro
SPEED=float(sys.argv[1]) if len(sys.argv)>1 else 0.87
VOICE=os.environ.get('FILM_VOICE','af_heart')
HERE=os.path.dirname(os.path.abspath(__file__)); KD=os.environ.get('KOKORO_DIR','.')
sys.path.insert(0,os.path.dirname(HERE))
from narration import _tidy  # trims, caps over-long pauses, levels the speech
k=Kokoro(os.path.join(KD,'kokoro-v1.0.onnx'),os.path.join(KD,'voices-v1.0.bin'))
OUT=os.path.join(HERE,'narration'); L=json.load(open(os.path.join(OUT,'lines.json'))); man=[]
for l in L:
  text=l['text'].replace('IBM','I B M')
  a,sr=k.create(text,voice=VOICE,speed=SPEED,lang='en-us')
  a=_tidy(a); a=np.concatenate([a[:0],a,np.zeros(int(.06*sr))])
  a=np.concatenate([np.zeros(int(sr*l['lead'])),a]).astype(np.float32)
  fn='%02d.mp3'%l['n']; w=os.path.join(OUT,fn+'.wav'); sf.write(w,a,sr)
  subprocess.run(['ffmpeg','-y','-loglevel','error','-i',w,'-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','24000','-ac','1','-codec:a','libmp3lame','-b:a','64k',os.path.join(OUT,fn)],check=True)
  d=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',os.path.join(OUT,fn)]).decode()); os.remove(w)
  man.append({'n':l['n'],'file':fn,'dur':round(d,2),'lead':l['lead'],'text':l['text']}); print(fn,round(d,2),flush=True)
json.dump({'engine':'kokoro','voice':VOICE,'speed':SPEED,'lines':man},open(os.path.join(OUT,'manifest.json'),'w'),indent=1)
print('total voice',round(sum(x['dur'] for x in man),2))
