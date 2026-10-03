// ═══════════════════════════════════════════════════════════════════
// Study Hub tutor proxy — Cloudflare Worker
// Keeps the Anthropic API key on the server, so it never appears in the
// public GitHub repo. See README.md in this folder for the 10-minute setup.
// Requires two secrets in the Worker: ANTHROPIC_API_KEY and TUTOR_PASSCODE.
// ═══════════════════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://jawill68.github.io',
];
const MODEL = 'claude-haiku-4-5-20251001'; // fast + inexpensive; fine for short tutoring replies
const MAX_TOKENS = 600;
const MAX_MESSAGES = 14;
const MAX_CHARS_PER_MESSAGE = 4000;

function cors(origin){
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Tutor-Pass',
    'Vary': 'Origin',
  };
}

function safeEqual(a, b){
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors(origin) });
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403, headers: cors(origin) });

    // Family passcode: only devices that know it can use (and spend) the live tutor.
    const pass = request.headers.get('X-Tutor-Pass') || '';
    if (!env.TUTOR_PASSCODE || !safeEqual(pass, env.TUTOR_PASSCODE)) {
      return new Response(JSON.stringify({ error: 'passcode' }), { status: 401, headers: { ...cors(origin), 'content-type': 'application/json' } });
    }

    let body;
    try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400, headers: cors(origin) }); }

    const system = String(body.system || '').slice(0, 4000);
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .slice(-MAX_MESSAGES)
      .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
      .map(m => ({ role: m.role, content: String(m.content || '').slice(0, MAX_CHARS_PER_MESSAGE) }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return new Response('Last message must be from the student', { status: 400, headers: cors(origin) });
    }

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: system + '\n\nYou are talking with a high school student. Keep it school-appropriate, encouraging, and focused on the course content.',
        messages,
      }),
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'upstream ' + upstream.status }), {
        status: 502, headers: { ...cors(origin), 'content-type': 'application/json' },
      });
    }
    const data = await upstream.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    return new Response(JSON.stringify({ text }), {
      headers: { ...cors(origin), 'content-type': 'application/json' },
    });
  },
};
