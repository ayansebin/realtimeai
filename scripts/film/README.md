# Demo film

Turns the home page demo into a standalone pitch video: one chart at a time on the site's paper background, crossfades between shots, a use case navigation bar, captions drawn on top, narration mixed in. 1080p30 MP4, about 2:50.

The page no longer offers the narrated walkthrough itself; its engine stays in `index.html` for this recording, started with `window.__rtiDemo.start()`. The film runs its own script (`film_script.js`) and narration (`narration/`): no case studies, Jessica Anne's voice from ElevenLabs (a professional, conversational American voice from the voice library, on Eleven v4 through the site's Vercel AI Gateway), read one sentence at a time at her natural pace, about 150 words a minute, with a breath between sentences and a longer pause before each visual beat.

The script is the site's own: it opens on "Time series intelligence meets real-time context", builds the page's "from words to decisions" chart phrase by phrase, moves to the live chart on the Granite line, then Confluent + IBM Granite, what changes for your teams, six short use cases and the ask: "Bring us a stream and a decision." The spoken words avoid acronyms other than IBM and make no release-status claims.

Captions and on-screen actions land on their words: `genfilm.py` records when every sentence is spoken, and `film_script.py` pads captions and `say` with spaces so the page's length-based timing matches the voice.

## Steps

1. Serve the site locally, for example `npx serve -l 8800 .` from the repo root. Set `SITE` if it is not `http://127.0.0.1:8800/`.
2. Install the tools once: `npm i playwright @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono` and `pip install numpy pillow`. ffmpeg must be on the path.
3. After a change to the words, voice the new sentences as Eric, then regenerate the narration and the script (needs `pip install numpy soundfile` and ffmpeg with rubberband). `eleven_clips.py` goes through the site with the seller code, or straight to the gateway with `AI_GATEWAY_API_KEY`, and skips sentences it already has:

```
FILM_CLIPS=clips SELLER_CODE=... python3 scripts/film/eleven_clips.py
FILM_ENGINE=eleven FILM_CLIPS=clips python3 scripts/film/genfilm.py
python3 scripts/film/film_script.py scripts/film/narration/manifest.json scripts/film/film_script.js
```

`FILM_TEMPO` slows or speeds the voice with a pitch preserving stretch (the film uses 1.0, her natural pace), `FILM_GAPS` scales the breaths between sentences (1.0). Without `FILM_ENGINE=eleven`, `genfilm.py` uses Kokoro af_heart as before (`pip install kokoro-onnx` and the two Kokoro model files in `KOKORO_DIR`).

4. Record, render the overlays, then edit:

```
node scripts/film/rec_film.mjs film 300
node scripts/film/render_overlays.mjs film
python3 scripts/film/compose.py film demo.mp4 4.0
```

## What each file does

- `narration/lines.json`: the film's words, one line per step, with the pause before each line and longer pauses before chosen sentences (`pause_before`).
- `eleven_clips.py`: voices each sentence as Jessica Anne on Eleven v4 through the site or the gateway.
- `genfilm.py`: builds each line from its sentences (slowed, with breaths) and writes `manifest.json` with every sentence's start and end.
- `film_script.py`, `film_script.js`: the film's demo script, built from the manifest so captions and on-screen actions follow the voice to the word.
- `film.css`, `film.js`: film mode. Hides the page, frames the chart of each step, and logs every cut, caption and label.
- `rec_film.mjs`: swaps in the film script and narration, plays the demo at 1280x720 with a 1.5 scale factor and records 1920x1080 frames with Chrome's screencast.
- `render_overlays.mjs`: renders the brand, labels, the use case navigation and the captions as transparent PNGs in the site's typography.
- `compose.py`: builds the final video. Crossfades start on the first frame that shows the new shot, captions follow the voice.
