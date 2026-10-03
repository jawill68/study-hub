/* ═══════════════════════════════════════════════════════════════════
   STUDY HUB · CROSS-DEVICE PROGRESS SYNC

   Progress (XP, ranks, stars, drill stats, mastery, Field Journal…) lives
   in each browser's localStorage. This file copies it to the existing
   Firebase project under a private sync code (name + 4-digit PIN), so a
   student can pick up on a phone where they left off on a Chromebook.

   • Opt-in. Nothing syncs until the student creates or enters a sync code.
   • Merge, not overwrite: when two devices both have progress, numbers take
     the higher value, lists are combined, and the newer date wins — so XP or
     mastered items are never lost by syncing.
   • If Firebase is blocked (school filter, offline), everything keeps working
     locally and syncs next time it can.

   Any page that includes this script gets a ☁️ chip in any element marked
   data-sync-chip, plus auto pull-on-load and push-on-change.
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  const FIREBASE = {
    apiKey: "AIzaSyAACUvfh8CUiflSPBmcN2OXOiV6bUcFcNo",
    authDomain: "study-hub-acec1.firebaseapp.com",
    projectId: "study-hub-acec1",
    storageBucket: "study-hub-acec1.firebasestorage.app",
    messagingSenderId: "34403837526",
    appId: "1:34403837526:web:94fd2507d8943ddb45bdf7"
  };
  const SDK = 'https://www.gstatic.com/firebasejs/12.17.1/';
  const CODE_KEY = 'studyhub_sync_code';     // {id, label}
  const META_KEY = 'studyhub_sync_meta';     // {lastSync, lastLocalChange}
  const SYNC_COLLECTION = ['classes','progressSync','students'];
  // Keys that are progress data. Device-specific keys are excluded.
  const PREFIXES = ['a2','a2_','physci_','worldhistory_','whh_','gamedesign_','gp_','envsci_','algebra2_','studyhub_game'];
  const EXCLUDE = new Set([CODE_KEY, META_KEY, 'studyhub_sync_name', 'a2dt_settings']);
  const isProgressKey = k => !EXCLUDE.has(k) && (PREFIXES.some(p=>k.startsWith(p)) || /_game_v1$/.test(k));

  const lsGet=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } };
  const lsSet=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
  let code = lsGet(CODE_KEY,null);
  let meta = lsGet(META_KEY,{lastSync:0,lastLocalChange:0});
  let db=null, fs=null, status='off', busy=false, pushTimer=null;

  // ── Snapshot + merge ─────────────────────────────────────────────────
  function snapshot(){
    const out={};
    for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(isProgressKey(k)) out[k]=localStorage.getItem(k); }
    return out;
  }
  function parse(v){ try{ return JSON.parse(v); }catch(e){ return v; } }
  const isDate = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}/.test(s);
  function merge(a,b){                       // a = local, b = remote
    if(a===undefined) return b; if(b===undefined) return a;
    if(typeof a==='number' && typeof b==='number') return Math.max(a,b);
    if(Array.isArray(a) && Array.isArray(b)){
      const seen=new Set(), out=[];
      [...a,...b].forEach(x=>{ const k=JSON.stringify(x); if(!seen.has(k)){ seen.add(k); out.push(x); } });
      return out;
    }
    if(a && b && typeof a==='object' && typeof b==='object'){
      const out={}; new Set([...Object.keys(a),...Object.keys(b)]).forEach(k=>out[k]=merge(a[k],b[k])); return out;
    }
    if(isDate(a)&&isDate(b)) return a>b?a:b;
    if(typeof a==='string' && typeof b==='string' && /^\d+%$/.test(a) && /^\d+%$/.test(b)) return (parseInt(a)>=parseInt(b))?a:b;
    if(typeof a==='string' && typeof b==='string' && /^\d+\/\d+$/.test(a) && /^\d+\/\d+$/.test(b)) { const f=x=>{ const [n,d]=x.split('/').map(Number); return d?n/d:0; }; return f(a)>=f(b)?a:b; }
    return b ?? a;
  }
  function mergeSnapshots(local, remote){
    const out={...local};
    Object.keys(remote||{}).forEach(k=>{
      if(!(k in local)){ out[k]=remote[k]; return; }
      const m = merge(parse(local[k]), parse(remote[k]));
      out[k] = typeof m==='string' ? m : JSON.stringify(m);
    });
    return out;
  }
  function apply(snap){ Object.entries(snap).forEach(([k,v])=>{ if(localStorage.getItem(k)!==v){ try{ localStorage.setItem(k,v); }catch(e){} } }); }

  // ── Firebase ─────────────────────────────────────────────────────────
  async function connect(){
    if(db) return true;
    try{
      const app = await import(SDK+'firebase-app.js');
      fs = await import(SDK+'firebase-firestore.js');
      const inst = app.getApps().find(a=>a.name==='progress-sync') || app.initializeApp(FIREBASE,'progress-sync');
      db = fs.getFirestore(inst);
      return true;
    }catch(e){ console.warn('Progress sync unavailable:',e); setStatus('blocked'); return false; }
  }
  const ref = () => fs.doc(db, ...SYNC_COLLECTION, code.id);

  async function pull(){
    if(!code || busy) return false; busy=true; setStatus('syncing');
    try{
      if(!await connect()) return false;
      const snap = await fs.getDoc(ref());
      const local = snapshot();
      let merged = local, remoteNewer=false;
      if(snap.exists()){
        const data = snap.data();
        merged = mergeSnapshots(local, data.progress||{});
        remoteNewer = (data.updatedAt||0) > (meta.lastSync||0);
      }
      apply(merged);
      await fs.setDoc(ref(), {label:code.label, progress:merged, updatedAt:Date.now(), device:navigator.userAgent.slice(0,80)});
      meta.lastSync = Date.now(); lsSet(META_KEY,meta); setStatus('ok');
      return remoteNewer;
    }catch(e){ console.warn('Sync failed:',e); setStatus('error'); return false; }
    finally{ busy=false; }
  }
  async function push(){
    if(!code || busy) return; busy=true;
    try{
      if(!await connect()) return;
      // read-merge-write so another device's progress is never overwritten
      const snap = await fs.getDoc(ref());
      const merged = snap.exists() ? mergeSnapshots(snapshot(), snap.data().progress||{}) : snapshot();
      apply(merged);
      await fs.setDoc(ref(), {label:code.label, progress:merged, updatedAt:Date.now(), device:navigator.userAgent.slice(0,80)});
      meta.lastSync = Date.now(); lsSet(META_KEY,meta); setStatus('ok');
    }catch(e){ console.warn('Sync push failed:',e); setStatus('error'); }
    finally{ busy=false; }
  }
  function schedulePush(){ if(!code) return; clearTimeout(pushTimer); pushTimer=setTimeout(push, 8000); }

  // ── Sync code ────────────────────────────────────────────────────────
  async function hash(s){
    try{
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
    }catch(e){ let h=5381; for(const c of s) h=((h<<5)+h+c.charCodeAt(0))|0; return (h>>>0).toString(16); }
  }
  async function setCode(name, pin){
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30);
    if(!clean || !/^\d{4}$/.test(pin)) return 'Use a name and a 4-digit PIN.';
    code = {id: clean+'-'+(await hash(clean+':'+pin+':studyhub')), label: name.trim().slice(0,30)};
    lsSet(CODE_KEY, code);
    const newer = await pull();
    if(status==='ok' && newer) location.reload();
    return status==='ok' ? '' : (status==='blocked' ? 'Sync is blocked on this network. Progress is still saved on this device.' : 'Could not reach the sync service. Try again later.');
  }
  function forget(){ code=null; localStorage.removeItem(CODE_KEY); setStatus('off'); }

  // ── UI ───────────────────────────────────────────────────────────────
  function ago(t){ if(!t) return 'never'; const s=Math.round((Date.now()-t)/1000); return s<60?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' d ago'; }
  function setStatus(s){ status=s; renderChips(); }
  function css(){
    if(document.getElementById('shs-css')) return;
    const st=document.createElement('style'); st.id='shs-css';
    st.textContent=`.shs-chip{display:inline-flex;align-items:center;gap:6px;background:#0a1929;border:1px solid #1e3a5c;border-radius:999px;padding:6px 12px;font:700 11.5px 'DM Sans',sans-serif;color:#c8dff0;cursor:pointer}
    .shs-chip:hover{border-color:#2E8BC0}.shs-dot{width:8px;height:8px;border-radius:50%;background:#6b8ab0}
    .shs-dot.ok{background:#1D9E75}.shs-dot.syncing{background:#E59400}.shs-dot.error,.shs-dot.blocked{background:#E74C3C}
    .shs-ov{position:fixed;inset:0;background:rgba(3,8,16,.82);z-index:10001;display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow:auto}
    .shs-m{background:#0a1929;border:1px solid #1e3a5c;border-radius:18px;padding:22px;max-width:440px;width:100%;color:#e8edf4;font-family:'DM Sans',sans-serif}
    .shs-m h3{font-size:18px;margin-bottom:6px;color:#fff}.shs-m p{font-size:13px;color:#a9c2dc;line-height:1.55;margin-bottom:12px}
    .shs-m input{width:100%;background:#060e1a;border:1px solid #1e3a5c;border-radius:10px;padding:10px 12px;color:#e8edf4;font:14px 'DM Sans',sans-serif;margin-bottom:9px}
    .shs-m button{border:none;border-radius:10px;padding:10px 16px;font:700 13px 'DM Sans',sans-serif;cursor:pointer;margin:4px 6px 0 0}
    .shs-p{background:#2E8BC0;color:#fff}.shs-g{background:#060e1a;color:#e8edf4;border:1px solid #1e3a5c!important}
    .shs-err{color:#f08579;font-size:12.5px;min-height:18px}`;
    document.head.appendChild(st);
  }
  function renderChips(){
    if(!document.body) return;
    const chips=document.querySelectorAll('[data-sync-chip]'); if(!chips.length) return; css();
    const label = !code ? 'Sync devices' : status==='syncing' ? 'Syncing…' : status==='ok' ? 'Synced '+ago(meta.lastSync) : status==='blocked' ? 'Sync blocked here' : status==='error' ? 'Sync paused' : 'Sync on';
    chips.forEach(c=>{ c.innerHTML=`<button class="shs-chip" type="button" title="Sync your progress across devices"><span class="shs-dot ${code?status:''}"></span>☁️ ${label}</button>`; c.firstChild.onclick=open; });
  }
  function open(){
    css(); const ov=document.createElement('div'); ov.className='shs-ov'; ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
    const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
    ov.innerHTML = code ? `<div class="shs-m" role="dialog" aria-modal="true"><h3>☁️ Progress sync is on</h3>
        <p>Signed in as <b>${esc(code.label)}</b>. Last synced: ${ago(meta.lastSync)}.</p>
        <p>On another device, open any Study Hub, tap <b>Sync devices</b>, and enter the same name and PIN.</p>
        <div class="shs-err" id="shs-err"></div>
        <button class="shs-p" id="shs-now">Sync now</button><button class="shs-g" id="shs-off">Turn off on this device</button><button class="shs-g" id="shs-x">Close</button></div>`
      : `<div class="shs-m" role="dialog" aria-modal="true"><h3>☁️ Sync your progress</h3>
        <p>Use the <b>same name and 4-digit PIN</b> on every device — phone, Chromebook, home computer. XP, ranks, stars, and mastery follow you, and nothing is ever lost when devices merge.</p>
        <input id="shs-name" placeholder="Your first name (e.g. Marcus)" maxlength="30" autocomplete="off" aria-label="Name">
        <input id="shs-pin" placeholder="4-digit PIN you'll remember" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="PIN">
        <div class="shs-err" id="shs-err"></div>
        <button class="shs-p" id="shs-go">Turn on sync</button><button class="shs-g" id="shs-x">Cancel</button>
        <p style="font-size:11.5px;margin-top:12px">Don't use a PIN you use anywhere else. Only study progress is stored — no grades, no personal info.</p></div>`;
    document.body.appendChild(ov);
    const $=id=>ov.querySelector('#'+id);
    $('shs-x').onclick=()=>ov.remove();
    if(code){
      $('shs-now').onclick=async()=>{ $('shs-err').textContent='Syncing…'; const newer=await pull(); $('shs-err').textContent= status==='ok'?'✓ Synced':'Could not sync right now.'; if(newer) setTimeout(()=>location.reload(),500); };
      $('shs-off').onclick=()=>{ forget(); ov.remove(); };
    } else {
      $('shs-go').onclick=async()=>{ $('shs-err').textContent='Connecting…'; const msg=await setCode($('shs-name').value,$('shs-pin').value); $('shs-err').textContent=msg||'✓ Sync is on'; if(!msg) setTimeout(()=>ov.remove(),700); };
    }
  }

  // ── Wiring ───────────────────────────────────────────────────────────
  window.addEventListener('studyhub:changed', ()=>{ meta.lastLocalChange=Date.now(); lsSet(META_KEY,meta); schedulePush(); });
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden' && code && meta.lastLocalChange>meta.lastSync) push(); });
  window.StudyHubSync = { open, pull, push, merge:mergeSnapshots, isOn:()=>!!code };
  function boot(){
    renderChips();
    if(code){
      const reloaded = sessionStorage.getItem('shs_pulled');
      pull().then(newer=>{ if(newer && !reloaded){ sessionStorage.setItem('shs_pulled','1'); location.reload(); } });
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
