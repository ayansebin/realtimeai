# IBM Granite Time Series on Confluent

The site at realtimeintelligence.io, deployed on Vercel from `main`.

## Pages

- `index.html`: the site, self-contained (inline CSS and JS, Google Fonts only)
- `playground.html` (/playground): the models on real public and synthetic streams, and on the visitor's own data, which TTM r3 forecasts in the browser. Precomputed outputs are in `data/pg/`, the ONNX exports of TTM r3 in `models/`
- `build.html` (/build): the demo builder for IBM sellers. A seller answers a few questions about the client (industry, use case, pain point, data, decision, audience, tone, length) or writes a free prompt; Claude Opus 5.5 at max effort returns a demo spec; the page plays it as a narrated, animated walkthrough in the site's design and gives a share link (`/build?d=ID`). Three example demos are in `data/builder/examples.json`
- Chat (/chat) is parked: the page, the API relay and its sources are on the `chat-parked` branch, see `parked/chat/README.md` there. /chat redirects to the playground for now
- `demos/`: the demo videos in the Demos section (the pitch film, the anomaly detection demo, the notebook sketch and the Confluent Cloud demos), with their posters. The film and notebook are made with `scripts/film` and `scripts/notebook`

## API (Vercel Functions in `api/`)

- `api/contact.js`: the contact, trial, early access and feedback forms, plus ratings and notes from the chat, stored privately in Vercel Blob. Env: `BLOB_READ_WRITE_TOKEN`, `CONTACT_KEY` (to read the leads back), and for notifications either `RESEND_API_KEY` with `NOTIFY_EMAIL`, or `NOTIFY_WEBHOOK`

- `api/build.js`: the demo builder. Streams the build as server-sent events, saves each demo privately in Vercel Blob under `builder/`, serves saved demos by id, and lists them for the owner at `/api/build?key=CONTACT_KEY`. Env: `DEMO_BUILDER_CODE` (the sellers' access code) switches it on. The model, Claude Opus 5.5 at max effort, is reached through Vercel AI Gateway with the deployment's OIDC token, so no model key is stored (`AI_GATEWAY_API_KEY` or `ANTHROPIC_API_KEY` override it); optional `DEMO_DAILY_CAP` (default 80), `DEMO_MODEL`, `DEMO_EFFORT`. `/api/build?selftest=1&code=CODE` runs one quick low-effort build and reports how it went.

## Scripts and workflows

- `scripts/playground.py` with `.github/workflows/playground.yml`: precomputes the playground streams
- `scripts/export_onnx.py` with `.github/workflows/onnx.yml`: exports TTM r3 to ONNX for the browser
- `scripts/photos.py`: the photos
- `og-image.png`, `robots.txt`, `sitemap.xml`, `404.html`
