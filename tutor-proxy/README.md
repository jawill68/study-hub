# Turning on the live AI tutor

The tutors (ALEPH, TEAL, CLIO) work right now in **Offline Coach** mode. They
answer from the definitions, examples, and explanations already in each page.

The live AI needs a small proxy that holds the Anthropic API key **on a
server**. The key must never go in this public repo. A family passcode keeps
anyone else who finds the site from using (and spending) the live tutor.

## Setup (about 15 minutes)

1. **Anthropic account** at https://console.anthropic.com
   - Billing: add a small prepaid credit ($5–10 is plenty to start).
   - Limits: set a monthly spend limit (for example, $10).
   - API Keys → Create Key → name it `studyhub-tutor` → copy it somewhere safe.
2. **Cloudflare account** (free) at https://dash.cloudflare.com
   → **Workers & Pages → Create → Worker** → name it `studyhub-tutor` → **Deploy**.
3. **Edit code** → delete everything → paste all of `worker.js` from this folder → **Deploy**.
4. Worker → **Settings → Variables and Secrets → Add** (twice, both type **Secret**):
   - `ANTHROPIC_API_KEY` = the key from step 1
   - `TUTOR_PASSCODE` = a family passcode you choose
5. Copy the Worker URL (`https://studyhub-tutor.<you>.workers.dev`).
6. Set it in `studyhub-tutor.js` (repo root):
   ```js
   const TUTOR_ENDPOINT = 'https://studyhub-tutor.<you>.workers.dev';
   ```
   Commit. Every tutor on the site switches to live AI.
7. On each device, the first live question asks for the passcode once; it is
   remembered on that device afterward. Cancel keeps Offline Coach.

## Safety built in
- Only accepts requests from `https://jawill68.github.io`.
- Requires the family passcode (`X-Tutor-Pass` header) on every request.
- Caps reply length (600 tokens), history (14 messages), and message size.
- Uses Claude Haiku 4.5 (fast, lowest cost). Change `MODEL` in `worker.js` for a larger model.
- Wrong passcode, a down proxy, or an empty balance → pages fall back to Offline Coach.
- To shut it off instantly: change `TUTOR_PASSCODE` in Cloudflare, or delete the Worker.
