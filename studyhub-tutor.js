/* ═══════════════════════════════════════════════════════════════════
   STUDY HUB · AI TUTOR BRIDGE  (used by ALEPH in Algebra 2, TEAL in Env Sci)

   Why this file exists:
   The original tutor called api.anthropic.com straight from the browser.
   That only works inside claude.ai. On GitHub Pages there is no API key
   (and a key must never be published in a public repo), so every request
   failed and students saw "Sorry, I couldn't generate a response."

   How it works now:
   1. If TUTOR_ENDPOINT below is set to a deployed proxy (see
      tutor-proxy/README.md), questions go to the live AI through it.
   2. Otherwise — or if the proxy is unreachable — the tutor answers in
      Offline Coach mode, built from the term / question data already on
      the page (definition, example, formula, hint, explanation, trap).
      Offline mode never pretends to be the live AI; it labels itself.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  // ── Set this to your deployed Cloudflare Worker URL to turn on live AI ──
  // e.g. 'https://studyhub-tutor.YOUR-SUBDOMAIN.workers.dev'
  const TUTOR_ENDPOINT = '';

  const LIVE_TIMEOUT_MS = 20000;
  const PASS_KEY = 'studyhub_tutor_pass';      // saved on this device after the first correct entry
  const SKIP_KEY = 'studyhub_tutor_skip';      // "not now" for this browser session

  function getPass(){
    let p = ''; try{ p = localStorage.getItem(PASS_KEY) || ''; }catch(e){}
    if(p) return p;
    try{ if(sessionStorage.getItem(SKIP_KEY)) return ''; }catch(e){}
    p = (window.prompt('Live tutor: enter the family passcode.\n(Cancel to keep using Offline Coach.)') || '').trim();
    if(!p){ try{ sessionStorage.setItem(SKIP_KEY,'1'); }catch(e){} return ''; }
    return p;
  }

  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function has(s, words){ s = (s||'').toLowerCase(); return words.some(w => s.includes(w)); }

  // Split explanation text into short sentences so offline replies don't
  // just paste the explanation back verbatim.
  function sentences(text){
    return String(text||'').replace(/\s+/g,' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/).filter(Boolean);
  }

  function offlineReply(ctx, message){
    const m = (message||'').toLowerCase();
    const out = [];
    const used = new Set();
    // Only use each explanation sentence once per reply
    const fresh = arr => arr.filter(x => { const k = x.trim(); if(used.has(k)) return false; used.add(k); return true; });
    const subject = ctx.term ? `"${ctx.term}"` : 'this question';

    const wantsExample = has(m,['example','show me','instance','like what','real world','real-world','sample']);
    const wantsFormula = has(m,['formula','equation','calculate','compute','solve','math']);
    const wantsSteps   = has(m,['step','how do','how to','walk','stuck','start','hint','approach','process','method']);
    const wantsWhy     = has(m,['why','reason','explain','understand','mean','confus','different way','simpler','eli5','simple']);
    const wantsTrap    = has(m,['mistake','wrong','trap','trick','mix','confuse','careful','watch out']);
    const wantsWrongAns= has(m,['my answer','i chose','i picked','why not','why is','what about']);

    if(wantsWrongAns && ctx.chosen && ctx.correct && ctx.chosen !== ctx.correct){
      out.push(`You picked **${ctx.chosen}**, but the answer is **${ctx.correct}**.`);
      const s = fresh(sentences(ctx.explanation).slice(0,2));
      if(s.length) out.push(s.join(' '));
      if(ctx.trap) out.push(`The trap here: ${ctx.trap}`);
    }
    if(wantsFormula && ctx.formula){
      out.push(`The key relationship is \`${ctx.formula}\`. Write it down first, then substitute — never the other way around.`);
    }
    if(wantsExample){
      if(ctx.example) out.push(`Here's a concrete case: ${ctx.example}`);
      else if(ctx.explanation){ const f = fresh(sentences(ctx.explanation).slice(0,1)); if(f.length) out.push(`Anchor it to this case: ${f[0]}`); }
    }
    if(wantsSteps){
      if(ctx.hint) out.push(`Start here: ${ctx.hint}`);
      const s = fresh(sentences(ctx.explanation).slice(0,4));
      if(s.length > 1){
        out.push('Break it into steps:\n' + s.map((x,i)=>`${i+1}. ${x}`).join('\n'));
      }
    }
    if(wantsTrap){
      if(ctx.trap) out.push(`Watch out: ${ctx.trap}`);
      else if(ctx.related && ctx.related.length) out.push(`Students often mix ${subject} up with ${ctx.related.slice(0,2).join(' or ')}. Check the Common Confusions page for the side-by-side.`);
    }
    if((wantsWhy && !wantsWrongAns) || !out.length){
      if(ctx.def) out.push(`In plain terms, ${ctx.term} means: ${ctx.def}`);
      const all = sentences(ctx.explanation);
      const s = fresh(all.length > 2 ? all.slice(-2) : all);
      if(s.length) out.push(s.join(' '));
      if(ctx.example && !wantsExample) out.push(`Example: ${ctx.example}`);
      if(ctx.formula && !wantsFormula) out.push(`Formula: \`${ctx.formula}\``);
    }
    if(!out.length){
      out.push(pick([
        `Try asking for an example, the steps, or the common mistake — I can help with each of those for ${subject}.`,
        `Ask me "give me an example," "walk me through it," or "what's the trap?" for ${subject}.`
      ]));
    }
    return out.join('\n\n');
  }

  async function liveReply(system, messages){
    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), LIVE_TIMEOUT_MS);
    try{
      const pass = getPass();
      if(!pass) throw new Error('no passcode');
      const resp = await fetch(TUTOR_ENDPOINT, {
        method:'POST',
        headers:{'Content-Type':'application/json','X-Tutor-Pass':pass},
        body: JSON.stringify({ system, messages }),
        signal: ctrl.signal
      });
      if(resp.status === 401){
        try{ localStorage.removeItem(PASS_KEY); sessionStorage.setItem(SKIP_KEY,'1'); }catch(e){}
        throw new Error('wrong passcode');
      }
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      try{ localStorage.setItem(PASS_KEY, pass); }catch(e){}
      const data = await resp.json();
      const text = data && (data.text || (data.content && data.content[0] && data.content[0].text));
      if(!text) throw new Error('empty');
      return text;
    } finally { clearTimeout(t); }
  }

  /**
   * ask({ system, messages, context, message })
   *  system   — system prompt for the live model
   *  messages — Anthropic-style history ending with the student's message
   *  context  — {term, def, example, formula, unit, explanation, hint, trap,
   *              chosen, correct, related[]} for Offline Coach mode
   *  message  — the student's latest message (plain text)
   * Resolves to { text, mode: 'live'|'offline' }
   */
  async function ask(opts){
    const { system, messages, context, message } = opts || {};
    if(TUTOR_ENDPOINT){
      try{
        const text = await liveReply(system, messages);
        return { text, mode:'live' };
      }catch(e){
        console.warn('Tutor proxy unavailable, using Offline Coach:', e);
      }
    }
    return { text: offlineReply(context||{}, message||''), mode:'offline' };
  }

  window.StudyHubTutor = {
    ask,
    isLive: () => !!TUTOR_ENDPOINT,
    modeLabel: () => TUTOR_ENDPOINT ? 'Live AI' : 'Offline Coach'
  };
})();
