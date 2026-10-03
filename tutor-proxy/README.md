# Turning on the live AI tutor (ALEPH / TEAL)

The tutors work right now in **Offline Coach** mode — they answer from the
definitions, examples, hints, and explanations already in each page.

To give them the live AI, the site needs a small proxy that holds your
Anthropic API key **on a server**. The key must never go in this public repo.

## Setup (about 10 minutes, free tier is enough)

1. Get an API key at https://console.anthropic.com (Settings → API Keys).
   Set a monthly spend limit there while you're at it.
2. Create a free Cloudflare account → **Workers & Pages → Create → Worker**.
3. Name it `studyhub-tutor`, click **Deploy**, then **Edit code**.
   Replace everything with the contents of `worker.js` in this folder → **Deploy**.
4. In the Worker: **Settings → Variables and Secrets → Add**
   - Type: **Secret**, Name: `ANTHROPIC_API_KEY`, Value: your key.
5. Copy the Worker's URL (looks like `https://studyhub-tutor.<you>.workers.dev`).
6. In `studyhub-tutor.js` (repo root), set:
   ```js
   const TUTOR_ENDPOINT = 'https://studyhub-tutor.<you>.workers.dev';
   ```
   Commit. Every tutor on the site switches to live AI.

## Safety built into the proxy
- Only accepts requests from `https://jawill68.github.io`.
- Caps reply length, history length, and message size.
- Uses Claude Haiku 4.5 (fast and low-cost). Change `MODEL` in `worker.js` if you want a larger model.
- If the proxy is down, pages automatically fall back to Offline Coach.
