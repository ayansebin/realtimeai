# Demo film

Turns the home page demo into a standalone pitch video: one chart at a time on the site's paper background, crossfades between shots, a use case navigation bar, captions drawn on top, narration mixed in. 1080p30 MP4, about 3:00.

The page no longer offers the narrated walkthrough itself; its engine stays in `index.html` for this recording, started with `window.__rtiDemo.start()`. The film runs its own script (`film_script.js`) and narration (`narration/`): no case studies, the af_heart voice read one sentence at a time (speed 0.84, 0.80 on short lines) with a breath between sentences and a longer pause before each visual beat.

The script is written for IBM sellers and account leaders: it opens on the client conversation ("Ask your clients what language models do for them"), builds the page's own "from words to decisions" chart phrase by phrase, shows one model reading six businesses, then Confluent + IBM Granite, what changes for the client, six short use cases and the ask: "Bring us a stream and a decision." The spoken words avoid acronyms other than IBM and make no release-status claims.

Captions and on-screen actions land on their words: `genfilm.py` records when every sentence is spoken, and `film_script.py` pads captions and `say` with spaces so the page's length-based timing matches the voice.

## Steps

1. Serve the site locally, for example `npx serve -l 8800 .` from the repo root. Set `SITE` if it is not `http://127.0.0.1:8800/`.
2. Install the tools once: `npm i playwright @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono` and `pip install numpy pillow`. ffmpeg must be on the path.
3. After a change to the words, regenerate the narration and the script (needs `pip install kokoro-onnx soundfile` and the two Kokoro model files in `KOKORO_DIR`):

```
python3 scripts/film/genfilm.py
python3 scripts/film/film_script.py scripts/film/narration/manifest.json scripts/film/film_script.js
```

4. Record, render the overlays, then edit:

```
node scripts/film/rec_film.mjs film 260
node scripts/film/render_overlays.mjs film
python3 scripts/film/compose.py film demo.mp4 4.0
```

## What each file does

- `narration/lines.json`: the film's words, one line per step, with the pause before each line and longer pauses before chosen sentences (`pause_before`).
- `genfilm.py`: voices each sentence and writes `manifest.json` with every sentence's start and end.
- `film_script.py`, `film_script.js`: the film's demo script, built from the manifest so captions and on-screen actions follow the voice to the word.
- `film.css`, `film.js`: film mode. Hides the page, frames the chart of each step, and logs every cut, caption and label.
- `rec_film.mjs`: swaps in the film script and narration, plays the demo at 1280x720 with a 1.5 scale factor and records 1920x1080 frames with Chrome's screencast.
- `render_overlays.mjs`: renders the brand, labels, the use case navigation and the captions as transparent PNGs in the site's typography.
- `compose.py`: builds the final video. Crossfades start on the first frame that shows the new shot, captions follow the voice.
