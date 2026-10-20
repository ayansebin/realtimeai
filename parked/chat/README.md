# Chat, parked

The site chat (/chat) is switched off for now. Everything needed to bring it back is on this branch (`chat-parked`).

## What was live at the time of parking

- `chat.html`: the built chat page, served at /chat
- `api/chat.js` and `api/_lib/chat-prompt.js`: the relay to the Claude Messages API, with the system prompt and the tool definitions
- `skills/granite-time-series.zip`: the skill offered on the chat page ("Use it in your own Claude")
- `vercel.json`: the `functions` block for `api/chat.js` (maxDuration 60) and the headers for `/skills/*.zip`
- `sitemap.xml`: the /chat entry
- Nav: Playground with two tabs, Streams and Chat, on `playground.html` and `chat.html`
- `api/contact.js` still accepts `chat-feedback` on main, so ratings and notes from the chat keep working when it comes back

## Sources (in this folder)

- `src/chat-body.html`, `src/chat.css`, `src/chat.js`: the chat page
- `src/core.js`, `src/mine-core.js`: shared with the playground (the models running in the browser), inlined by the build
- `src/head.html`, `src/pg.css`: snapshots of the shared head and the playground styles the chat build reuses
- `src/build_chat.py`: builds `chat.html` from the files above (set `CHTEST=1` for the test build)
- `src/mock-server.cjs`: the local test server (fake keys only), used with `CHTEST=1`
- `skill/`: the skill sources without the ONNX files (they are in the zip and in /models)

## To bring it back

1. Restore `chat.html`, `api/chat.js`, `api/_lib/chat-prompt.js` and `skills/` from this branch, plus the `functions` and `/skills` header blocks in `vercel.json` and the /chat line in `sitemap.xml`
2. Remove the /chat redirect from `vercel.json`
3. Put the Chat link back under Playground (the Streams and Chat tabs)
4. Drop the `git.deploymentEnabled` entry for `chat-parked` from `vercel.json`
5. Set `ANTHROPIC_API_KEY` in Vercel (optional: `CHAT_MODEL`, `CHAT_EFFORT`, `CHAT_MAX_TOKENS`) and redeploy
