# Notebook film

The same pitch as the demo film, told as a notebook sketch: a pen draws simple hand-drawn diagrams and handwritten notes in time with the narration. Same words, same voice, same captions. 1080p30 MP4, about 3:01.

Everything is drawn in the browser and rendered frame by frame, so the result is the same on every run. The site does not need to be running.

## Steps

1. Install once in this folder: `npm i roughjs @fontsource/caveat @fontsource/ibm-plex-sans`, plus `npm i playwright` (or point `PLAYWRIGHT` at an installed copy). ffmpeg must be on the path.
2. Build the timing from the film narration: `python3 scripts/notebook/make_timing.py`
3. Render and mux:

```
node scripts/notebook/capture.mjs frames 2
python3 scripts/notebook/compose_sketch.py frames notebook.mp4
```

## Files

- `story.js`: the pages. Each beat says what the pen draws and on which spoken phrase.
- `engine.js`: the pen, the rough.js strokes, the handwriting, the page moves and the captions, all from one `render(t)`.
- `sketch.html`: the notebook page, the spiral and the pen.
- `capture.mjs`: renders every frame with two browser tabs. `compose_sketch.py`: adds the narration from `../film/narration`.
