# Demo film

Turns the home page demo into a standalone pitch video: one chart at a time, full frame, crossfades between shots, captions drawn on top, narration mixed in. 1080p30 MP4.

The web demo is unchanged. These scripts only drive it in a "film mode" while recording.

## Steps

1. Serve the site locally, for example `npx serve -l 8800 .` from the repo root (or any static server). Set `SITE` if it is not `http://127.0.0.1:8800/`.
2. Install the tools once: `npm i playwright @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono` and `pip install numpy pillow`. ffmpeg must be on the path.
3. Record, render the overlays, then edit:

```
node scripts/film/rec_film.mjs film 175
node scripts/film/render_overlays.mjs film
python3 scripts/film/compose.py film demo.mp4 1.6
```

## What each file does

- `film.css`, `film.js`: film mode. Hides the page, frames the chart of each demo step on a dark stage, and logs every cut, caption and label.
- `rec_film.mjs`: plays the demo at 1280x720 with a 1.5 scale factor and records 1920x1080 frames with Chrome's screencast.
- `render_overlays.mjs`: renders the brand, labels and captions as transparent PNGs in the site's typography.
- `compose.py`: builds the final video. Crossfades start on the first frame that shows the new shot, captions follow the voice.

The narration comes from `narration/` (see `scripts/narration.py`), so after a script change regenerate the clips first, then record again.
