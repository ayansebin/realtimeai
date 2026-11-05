"""Voice every sentence of narration/lines.json on Eleven v4 (Jessica Anne by default, FILM_VOICE), for genfilm.py with FILM_ENGINE=eleven.
Goes through the site's own voice endpoint (Vercel AI Gateway on the site's credits) with the seller code, or straight to
the gateway when AI_GATEWAY_API_KEY is set. Sentences already in FILM_CLIPS are skipped, so only changed words cost anything.
usage: FILM_CLIPS=clips SELLER_CODE=... python3 eleven_clips.py        (or AI_GATEWAY_API_KEY=... instead of SELLER_CODE)"""
import json, re, os, hashlib, base64, urllib.request, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__)); CLIPS = os.environ.get('FILM_CLIPS', 'clips'); os.makedirs(CLIPS, exist_ok=True)
SITE = os.environ.get('SITE_URL', 'https://realtimeintelligence.io'); CODE = os.environ.get('SELLER_CODE'); KEY = os.environ.get('AI_GATEWAY_API_KEY')
IDS = {'jessicaanne': 'lxYfHSkYm1EzQzGhdbfc', 'eric': 'cjVigY5qzO86Huf0OWal'}   # Jessica Anne from the voice library; Eric, a default voice
VOICE = os.environ.get('FILM_VOICE', 'jessicaanne'); VOICE_ID, MODEL = IDS[VOICE], 'elevenlabs/eleven-v4'; TAG = VOICE + '|' + MODEL + '|'
sentences = lambda t: [s for s in re.split(r'(?<=[.!?])\s+', t.strip()) if s]
path = lambda s: os.path.join(CLIPS, hashlib.sha1((TAG + s).encode()).hexdigest()[:16] + '.mp3')
todo = [s for l in json.load(open(os.path.join(HERE, 'narration', 'lines.json'))) for s in sentences(l['text']) if not os.path.exists(path(s))]
print(len(todo), 'sentences to voice')
for k in range(0, len(todo), 10):
  batch = todo[k:k + 10]
  if KEY:
    for s in batch:
      req = urllib.request.Request('https://ai-gateway.vercel.sh/v4/ai/speech-model', data=json.dumps({'text': s, 'voice': VOICE_ID, 'outputFormat': 'mp3'}).encode(),
        headers={'Authorization': 'Bearer ' + KEY, 'ai-gateway-protocol-version': '0.0.1', 'ai-speech-model-specification-version': '4', 'ai-model-id': MODEL, 'Content-Type': 'application/json'})
      open(path(s), 'wb').write(base64.b64decode(json.load(urllib.request.urlopen(req))['audio'])); print('voiced', s[:60])
  elif CODE:
    q = urllib.parse.urlencode({'selftest': 1, 'code': CODE, 'voice_id': VOICE_ID, 'lines': json.dumps(batch)})
    j = json.load(urllib.request.urlopen(SITE + '/api/voice?' + q, timeout=120))
    for x in j['lines']:
      if not x.get('ok'): raise SystemExit('failed: ' + batch[x['i']] + ' ' + str(x.get('detail')))
      open(path(batch[x['i']]), 'wb').write(base64.b64decode(x['b64'])); print('voiced', batch[x['i']][:60])
  else: raise SystemExit('set SELLER_CODE or AI_GATEWAY_API_KEY')
