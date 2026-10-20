# IBM Granite Time Series on Confluent

The site at realtimeintelligence.io, deployed on Vercel from `main`.

## Pages

- `index.html`: the site, self-contained (inline CSS and JS, Google Fonts only)
- `playground.html` (/playground): the models on real public and synthetic streams, and on the visitor's own data, which TTM r3 forecasts in the browser. Precomputed outputs are in `data/pg/`, the ONNX exports of TTM r3 in `models/`
- `chat.html` (/chat): a chat with Claude, which runs the same models as tools in the visitor's browser and answers questions about them
- `demos/`: the demo videos in the Demos section (the pitch film, the notebook sketch and the multivariate forecasting walkthrough), with their posters. The pitch film and the notebook sketch are made with `scripts/film` and `scripts/notebook`; the multivariate walkthrough is an edited, narrated Confluent Cloud console recording

## API (Vercel Functions in `api/`)

- `api/contact.js`: the contact, trial, early access and feedback forms, plus ratings and notes from the chat, stored privately in Vercel Blob. Env: `BLOB_READ_WRITE_TOKEN`, `CONTACT_KEY` (to read the leads back), and for notifications either `RESEND_API_KEY` with `NOTIFY_EMAIL`, or `NOTIFY_WEBHOOK`
- `api/chat.js`: relays the chat to the Claude Messages API and streams the answer back. The system prompt and the tool definitions are in `api/_lib/chat-prompt.js`. Env: `ANTHROPIC_API_KEY` (required), `CHAT_MODEL` (default `claude-sonnet-5-5`, `claude-haiku-5-5` costs much less), `CHAT_EFFORT` (default `medium`), `CHAT_MAX_TOKENS` (default 1600). Set a monthly spend limit on the key in the Claude Console

## Scripts and workflows

- `scripts/playground.py` with `.github/workflows/playground.yml`: precomputes the playground streams
- `scripts/export_onnx.py` with `.github/workflows/onnx.yml`: exports TTM r3 to ONNX for the browser
- `scripts/narration.py`, `scripts/photos.py`: the demo narration and the photos
- `og-image.png`, `robots.txt`, `sitemap.xml`, `404.html`
