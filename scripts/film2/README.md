# Overview film, re-rendered on the current design

Rebuilds `Time Series FMs on Confluent Overview` (3:15) from the live site, shot for shot, at the source film's own times, with the source film's voice track and subtitle track kept untouched. Every chart is the page's own, in whatever design the page has today; only the pictures change.

The timeline in `rec2.mjs` was taken from the source film: its cut times (ffmpeg scene detection), its sentences and their times (the embedded subtitle track), and the on-chart actions seen in its frames (the new cocoa butter lot, the stockout flag, the P95 service level, the card testing burst, the spike search, the news burst, the three value cards lighting up in turn). The two closing cards and the model family card are drawn by `film2.js` in the site's typography.

## Steps

1. Serve the site: `python3 -m http.server 8800` from the repo root (or `npx serve -l 8800 .`). `SITE` overrides the address.
2. Poppins and Inter must be installed on the recording machine (Chromium picks them up as local fonts); IBM Plex Mono comes from `node_modules/@fontsource/ibm-plex-mono` (`npm i @fontsource/ibm-plex-mono playwright`). ffmpeg, numpy and pillow as before.
3. Pull the voice and the captions out of the source film once:

```
ffmpeg -i source.mp4 -vn -map 0:a:0 -c copy voice.m4a
ffmpeg -i source.mp4 -map 0:s:0 -f srt captions.srt
```

4. Record, render the overlays, compose:

```
node scripts/film2/rec2.mjs take1                     # about 3.5 minutes, real time
node scripts/film2/overlays2.mjs take1 captions.srt
python3 scripts/film2/compose2.py take1 voice.m4a captions.srt overview.mp4
```

## Files

- `film2.css`: film mode on the roadmap look. Off-white paper, one framed chart at a time, Inter captions, Poppins titles, the closing card on the hero's navy to blue band.
- `film2.js`: the driver the recorder calls (`window.__film2`): frame a chart, swap cards, set the brand and label, pick a tab, click a chip, light a value card. The page exposes its modules as `window.__rti` when `window.__filmCapture` is set before load.
- `fonts2.css`: the font rules served in place of Google Fonts while recording.
- `rec2.mjs`: the timeline and the screencast capture (1280x720 at 1.5x, 1920x1080 frames with timestamps).
- `overlays2.mjs`: brand, labels and every caption as transparent PNGs, captions in a light variant for the closing card.
- `compose2.py`: crossfades at the cuts, overlays on top, fade in from the paper and out to navy, the voice muxed in and the subtitle track kept.
