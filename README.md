# IBM Granite Time Series on Confluent

The site at realtimeintelligence.io, deployed on Vercel from `main`.

## Pages

- `index.html`: the site, self-contained (inline CSS and JS, Google Fonts only)
- `playground.html` (/playground): the models on real public and synthetic streams, and on the visitor's own data, which TTM r3 forecasts in the browser. Precomputed outputs are in `data/pg/`, the ONNX exports of TTM r3 in `models/`
- Chat (/chat) is parked: the page, the API relay and its sources are on the `chat-parked` branch, see `parked/chat/README.md` there. /chat redirects to the playground for now
- `demos/`: the two demo videos in the Demos section (the pitch film and the notebook sketch), with their posters. Made with `scripts/film` and `scripts/notebook`

## API (Vercel Functions in `api/`)

- `api/contact.js`: the contact, trial, early access and feedback forms, plus ratings and notes from the chat, stored privately in Vercel Blob. Env: `BLOB_READ_WRITE_TOKEN`, `CONTACT_KEY` (to read the leads back), and for notifications either `RESEND_API_KEY` with `NOTIFY_EMAIL`, or `NOTIFY_WEBHOOK`

## Scripts and workflows

- `scripts/playground.py` with `.github/workflows/playground.yml`: precomputes the playground streams
- `scripts/export_onnx.py` with `.github/workflows/onnx.yml`: exports TTM r3 to ONNX for the browser
- `scripts/narration.py`, `scripts/photos.py`: the demo narration and the photos
- `og-image.png`, `robots.txt`, `sitemap.xml`, `404.html`
