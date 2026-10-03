/* ═══════════════════════════════════════════════════════════════════
   STUDY HUB · PROGRESSION LAYER  (XP · ranks · streaks · missions · badges)

   Design notes (why it works the way it does):
   • Effort earns XP too (wrong answers still give a little) — rewards
     showing up, not just already knowing it.
   • Streaks are forgiving: every 7-day streak banks a "streak shield"
     (max 2) that auto-covers one missed day. Losing a 40-day streak to one
     sick day is what makes teens quit.
   • Daily missions are small (≈10 minutes) and change every day.
   • Everything is local to the student's browser (localStorage). Nothing
     is shared unless they opt in to teacher-sync on the hub.

   Usage on a page:
     <script>window.STUDYHUB_GAME = {course:'envsci'};</script>
     <script src="studyhub-game.js"></script>
     StudyHubGame.answer(correct, tier)     // after any graded question
     StudyHubGame.event('flashcard')        // other study actions
     <div data-game-hud></div>              // optional: compact rank chip
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  const CFG = window.STUDYHUB_GAME || {course:'studyhub'};
  const COURSE = CFG.course;
  const KEY = COURSE + '_game_v1';

  // ── Rank tables ─────────────────────────────────────────────────────
  const RANKS = {
    envsci: [
      {lvl:1, name:'Seedling',            icon:'🌱'},
      {lvl:2, name:'Marsh Scout',         icon:'🔭'},
      {lvl:4, name:'Field Tech',          icon:'🧪'},
      {lvl:6, name:'Wetland Ranger',      icon:'🦆'},
      {lvl:9, name:'Habitat Biologist',   icon:'🌾'},
      {lvl:12,name:'Flyway Guardian',     icon:'🪶'},
      {lvl:16,name:'Conservation Lead',   icon:'🛡️'},
      {lvl:20,name:'Ecosystem Architect', icon:'🌎'}
    ],
    physci: [
      {lvl:1, name:'Proton',        icon:'⚛️'},
      {lvl:2, name:'Atom',          icon:'🔬'},
      {lvl:4, name:'Molecule',      icon:'🧪'},
      {lvl:6, name:'Reaction',      icon:'⚗️'},
      {lvl:9, name:'Catalyst',      icon:'🔥'},
      {lvl:12,name:'Force',         icon:'🧲'},
      {lvl:16,name:'Fusion',        icon:'☀️'},
      {lvl:20,name:'Quantum',       icon:'🌌'}
    ],
    worldhistory: [
      {lvl:1, name:'Wanderer',      icon:'🥾'},
      {lvl:2, name:'Scribe',        icon:'📜'},
      {lvl:4, name:'Navigator',     icon:'🧭'},
      {lvl:6, name:'Cartographer',  icon:'🗺️'},
      {lvl:9, name:'Envoy',         icon:'🏛️'},
      {lvl:12,name:'Historian',     icon:'📚'},
      {lvl:16,name:'Sage',          icon:'🦉'},
      {lvl:20,name:'Chronicler',    icon:'⏳'}
    ],
    gamedesign: [
      {lvl:1, name:'Player One',    icon:'🕹️'},
      {lvl:2, name:'Modder',        icon:'🧩'},
      {lvl:4, name:'Scripter',      icon:'⌨️'},
      {lvl:6, name:'Level Designer',icon:'🗺️'},
      {lvl:9, name:'Game Dev',      icon:'🎮'},
      {lvl:12,name:'Lead Engineer', icon:'⚙️'},
      {lvl:16,name:'Creative Director',icon:'🎬'},
      {lvl:20,name:'Legend',        icon:'🏆'}
    ],
    gp: [
      {lvl:1, name:'Reader',        icon:'📖'},
      {lvl:2, name:'Note-taker',    icon:'✏️'},
      {lvl:4, name:'Analyst',       icon:'🔍'},
      {lvl:6, name:'Arguer',        icon:'⚖️'},
      {lvl:9, name:'Essayist',      icon:'📝'},
      {lvl:12,name:'Critic',        icon:'🎭'},
      {lvl:16,name:'Rhetorician',   icon:'🎙️'},
      {lvl:20,name:'Polymath',      icon:'🧠'}
    ],
    worldhistoryh: [
      {lvl:1, name:'Wanderer',      icon:'🥾'},
      {lvl:2, name:'Scribe',        icon:'📜'},
      {lvl:4, name:'Navigator',     icon:'🧭'},
      {lvl:6, name:'Cartographer',  icon:'🗺️'},
      {lvl:9, name:'Envoy',         icon:'🏛️'},
      {lvl:12,name:'Historian',     icon:'📚'},
      {lvl:16,name:'Sage',          icon:'🦉'},
      {lvl:20,name:'Chronicler',    icon:'⏳'}
    ],
    algebra2: [
      {lvl:1, name:'Variable',   icon:'𝑥'},
      {lvl:2, name:'Expression', icon:'±'},
      {lvl:4, name:'Equation',   icon:'='},
      {lvl:6, name:'Function',   icon:'ƒ'},
      {lvl:9, name:'Theorem',    icon:'∴'},
      {lvl:12,name:'Proof',      icon:'∎'},
      {lvl:16,name:'Axiom',      icon:'∞'},
      {lvl:20,name:'Aleph',      icon:'ℵ'}
    ]
  };
  const ranks = RANKS[COURSE] || RANKS.algebra2;

  // ── XP values ───────────────────────────────────────────────────────
  const XP = {
    correct:10, tierBonus:{1:0,2:5,3:10}, wrong:2, combo5:15,
    flashcard:2, confusion:3, autopsy:8, selfgrade:12, fmm:15,
    species:6, mock:60, graph:20, explore:4, mission:50, lesson:5
  };

  // ── Missions pool (filtered by course) ──────────────────────────────
  const MISSIONS = [
    {id:'answer10', label:'Answer 10 practice questions', target:10, counter:'answered', not:'gp'},
    {id:'correct8', label:'Get 8 questions right',         target:8,  counter:'correct', not:'gp'},
    {id:'gpread3',  label:'Work through 3 Question Bank items', target:3, counter:'lesson', only:'gp'},
    {id:'gpstar5',  label:'Review 5 Essential 50 terms',   target:5,  counter:'flashcard', only:'gp'},
    {id:'combo5',   label:'Hit a 5-in-a-row combo',        target:1,  counter:'combo5', not:'gp'},
    {id:'flash10',  label:'Flip 10 glossary flashcards',   target:10, counter:'flashcard'},
    {id:'conf2',    label:'Study 2 Common Confusions',     target:2,  counter:'confusion', only:['algebra2','envsci','worldhistoryh']},
    {id:'auto1',    label:'Master 1 Mistakes Autopsy',     target:1,  counter:'autopsy'},
    {id:'self1',    label:'Self-grade 1 free response',    target:1,  counter:'selfgrade'},
    {id:'tier3',    label:'Get 2 Challenge (Tier 3) right',target:2,  counter:'tier3', not:'gp'},
    {id:'species5', label:'Identify 5 waterfowl species',  target:5,  counter:'species', only:'envsci'},
    {id:'duq10',    label:'Answer 10 DU certification items',target:10,counter:'du', only:'envsci'},
    {id:'graph2',   label:'Match 2 graphs in the Graph Lab',target:2, counter:'graph', only:'algebra2'},
    {id:'explore3', label:'Explore 3 function families',   target:3,  counter:'explore', only:'algebra2'}
  ].filter(m => (!m.only || m.only === COURSE || (Array.isArray(m.only) && m.only.includes(COURSE))) && m.not !== COURSE);

  // ── Badges ──────────────────────────────────────────────────────────
  const BADGES = [
    {id:'first',    icon:'✨', name:'First Steps',     desc:'Earn your first XP',                 test:s=>s.xp>0},
    {id:'c50',      icon:'🎯', name:'Sharpshooter',    desc:'50 correct answers',                 test:s=>s.c.correct>=50},
    {id:'c250',     icon:'🏹', name:'Marksman',        desc:'250 correct answers',                test:s=>s.c.correct>=250},
    {id:'combo',    icon:'🔥', name:'On Fire',         desc:'Hit a 5-in-a-row combo',             test:s=>s.c.combo5>=1},
    {id:'combo10',  icon:'☄️', name:'Unstoppable',     desc:'Reach a 10-answer combo',            test:s=>s.bestCombo>=10},
    {id:'t3',       icon:'🧗', name:'Climber',         desc:'10 Challenge-tier questions right',  test:s=>s.c.tier3>=10},
    {id:'streak3',  icon:'📅', name:'Habit Forming',   desc:'3-day study streak',                 test:s=>s.best>=3},
    {id:'streak7',  icon:'🗓️', name:'Week Warrior',    desc:'7-day study streak',                 test:s=>s.best>=7},
    {id:'streak21', icon:'🏔️', name:'Locked In',       desc:'21-day study streak',                test:s=>s.best>=21},
    {id:'mission',  icon:'📦', name:'Mission Complete', desc:'Finish all 3 daily missions',        test:s=>s.c.missionDays>=1},
    {id:'mission5', icon:'🎖️', name:'Reliable',        desc:'Finish daily missions on 5 days',    test:s=>s.c.missionDays>=5},
    {id:'autopsy',  icon:'🔬', name:'Error Hunter',    desc:'Master 5 Mistakes Autopsies',        test:s=>s.c.autopsy>=5},
    {id:'writer',   icon:'✍️', name:'Show Your Work',  desc:'Self-grade 5 free responses',        test:s=>s.c.selfgrade>=5},
    {id:'cards',    icon:'🃏', name:'Card Shark',      desc:'Flip 100 flashcards',                test:s=>s.c.flashcard>=100},
    {id:'species10',icon:'🦆', name:'Field Guide',     desc:'Identify 25 waterfowl correctly',    test:s=>s.c.species>=25, only:'envsci'},
    {id:'du',       icon:'🪪', name:'Cert Candidate',  desc:'Finish a full DU mock exam',          test:s=>s.c.mock>=1, only:'envsci'},
    {id:'du80',     icon:'🏅', name:'Cert Ready',      desc:'Score 80%+ on a DU mock exam',        test:s=>(s.c.mockBest||0)>=80, only:'envsci'},
    {id:'graph',    icon:'📈', name:'Curve Whisperer', desc:'Match 10 graphs in the Graph Lab',   test:s=>s.c.graph>=10, only:'algebra2'},
    {id:'explorer', icon:'🧭', name:'Explorer',        desc:'Explore every function family',      test:s=>(s.c.familiesSeen||0)>=8, only:'algebra2'}
  ].filter(b => !b.only || b.only === COURSE);

  // ── State ───────────────────────────────────────────────────────────
  function today(d){ d = d || new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function dayDiff(a,b){ return Math.round((new Date(b+'T12:00:00') - new Date(a+'T12:00:00'))/86400000); }

  function blank(){ return {xp:0, streak:0, best:0, lastDay:null, shields:0, bestCombo:0, c:{}, badges:{}, mission:null}; }
  let S;
  try{ S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){ S = blank(); }
  S.c = S.c || {}; S.badges = S.badges || {};
  let combo = 0;

  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} try{ window.dispatchEvent(new Event('studyhub:changed')); }catch(e){} }

  // Level n starts at 100·n·(n−1) XP → L2=200, L3=600, L4=1200, L6=3000, L12=13200, L20=38000.
  // Tuned so a student studying ~20 min a day reaches the top rank late in the semester, not in week 2.
  function levelFor(xp){ let n=1; while(100*(n+1)*n <= xp) n++; return n; }
  function levelStart(n){ return 100*n*(n-1); }
  function rankFor(lvl){ let r=ranks[0]; ranks.forEach(x=>{ if(lvl>=x.lvl) r=x; }); return r; }
  function nextRank(lvl){ return ranks.find(x=>x.lvl>lvl) || null; }

  // ── Daily streak (with shields) ─────────────────────────────────────
  function touchDay(){
    const t = today();
    if(S.lastDay === t) return;
    if(!S.lastDay){ S.streak = 1; }
    else {
      const gap = dayDiff(S.lastDay, t);
      if(gap === 1){ S.streak++; }
      else if(gap > 1 && gap - 1 <= S.shields){
        S.shields -= (gap - 1); S.streak++;
        toast(`🛡️ Streak shield used — your ${S.streak}-day streak is safe`, 'shield');
      }
      else if(gap > 1){ S.streak = 1; }
    }
    S.lastDay = t;
    if(S.streak > S.best) S.best = S.streak;
    if(S.streak > 0 && S.streak % 7 === 0 && S.shields < 2){
      S.shields++;
      toast(`🛡️ ${S.streak}-day streak! You earned a streak shield`, 'shield');
    }
  }

  // ── Missions ────────────────────────────────────────────────────────
  function seeded(seedStr){
    let h = 2166136261; for(const ch of seedStr){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h>>>0) % 10000) / 10000; };
  }
  function ensureMissions(){
    const t = today();
    if(S.mission && S.mission.date === t) return;
    const rnd = seeded(COURSE + t);
    const pool = MISSIONS.slice();
    const tasks = [];
    while(tasks.length < 3 && pool.length){
      const i = Math.floor(rnd()*pool.length);
      const m = pool.splice(i,1)[0];
      tasks.push({id:m.id, label:m.label, target:m.target, counter:m.counter, start:(S.c[m.counter]||0)});
    }
    S.mission = {date:t, tasks, done:false};
  }
  function missionProgress(task){ return Math.min(task.target, (S.c[task.counter]||0) - task.start); }
  function checkMissions(){
    ensureMissions();
    if(S.mission.done) return;
    if(S.mission.tasks.every(t => missionProgress(t) >= t.target)){
      S.mission.done = true;
      S.c.missionDays = (S.c.missionDays||0) + 1;
      addXP(XP.mission, '📦 All daily missions complete!');
    }
  }

  // ── Core XP / counters ──────────────────────────────────────────────
  function addXP(n, label){
    if(!n) return;
    const before = levelFor(S.xp);
    S.xp += n;
    touchDay();
    const after = levelFor(S.xp);
    toast(label ? `${label} +${n} XP` : `+${n} XP`, 'xp');
    if(after > before){
      const r = rankFor(after), prevR = rankFor(before);
      if(r.name !== prevR.name) celebrate(`${r.icon} New rank: ${r.name}`, `You reached level ${after}.`);
      else toast(`⬆️ Level ${after}!`, 'level');
    }
  }
  function bump(counter, n){ S.c[counter] = (S.c[counter]||0) + (n==null?1:n); }

  function checkBadges(){
    BADGES.forEach(b => {
      if(!S.badges[b.id] && b.test(S)){
        S.badges[b.id] = Date.now();
        celebrate(`${b.icon} Badge unlocked: ${b.name}`, b.desc);
      }
    });
  }

  function commit(){ checkMissions(); checkBadges(); save(); renderHUDs(); }

  const api = {
    answer(correct, tier){
      tier = tier || 1;
      bump('answered');
      if(correct){
        bump('correct'); if(tier === 3) bump('tier3');
        combo++; if(combo > S.bestCombo) S.bestCombo = combo;
        let gain = XP.correct + (XP.tierBonus[tier]||0);
        if(combo > 0 && combo % 5 === 0){ bump('combo5'); gain += XP.combo5; toastQuiet(`🔥 ${combo} in a row!`); }
        addXP(gain);
      } else {
        combo = 0;
        addXP(XP.wrong, 'Effort');
      }
      commit();
    },
    event(name, opts){
      opts = opts || {};
      switch(name){
        case 'flashcard': bump('flashcard'); addXP(XP.flashcard); break;
        case 'confusion': bump('confusion'); addXP(XP.confusion); break;
        case 'autopsy':   bump('autopsy');   addXP(XP.autopsy, '🔬 Mistake mastered'); break;
        case 'selfgrade': bump('selfgrade'); addXP(XP.selfgrade, '✍️ Self-graded'); break;
        case 'fmm':       addXP(XP.fmm, '🧠 Diagnostic finished'); break;
        case 'species':   bump('species'); if(opts.correct!==false) addXP(XP.species); break;
        case 'du':        bump('du'); break;
        case 'mock':      bump('mock'); S.c.mockBest = Math.max(S.c.mockBest||0, opts.pct||0); addXP(XP.mock, '🪪 Mock exam finished'); break;
        case 'graph':     bump('graph'); addXP(XP.graph, '📈 Graph matched'); break;
        case 'explore':
          bump('explore');
          S.c.familiesList = S.c.familiesList || [];
          if(opts.family && !S.c.familiesList.includes(opts.family)){ S.c.familiesList.push(opts.family); S.c.familiesSeen = S.c.familiesList.length; }
          addXP(XP.explore); break;
        case 'lesson':    bump('lesson'); addXP(XP.lesson); break;
        default: bump(name);
      }
      commit();
    },
    resetCombo(){ combo = 0; },
    state(){
      ensureMissions();
      const lvl = levelFor(S.xp), r = rankFor(lvl), nr = nextRank(lvl);
      const start = levelStart(lvl), end = levelStart(lvl+1);
      return {
        xp:S.xp, level:lvl, rank:r, nextRank:nr,
        levelPct: Math.round((S.xp-start)/(end-start)*100), toNext: end - S.xp,
        streak: (S.lastDay && dayDiff(S.lastDay, today()) <= 1 + S.shields) ? S.streak : 0,
        best:S.best, shields:S.shields, counters:S.c, bestCombo:S.bestCombo,
        missions: S.mission.tasks.map(t => ({label:t.label, target:t.target, progress:missionProgress(t)})),
        missionsDone: S.mission.done,
        badges: BADGES.map(b => ({id:b.id, icon:b.icon, name:b.name, desc:b.desc, earned:!!S.badges[b.id]}))
      };
    },
    summary(){ const st = api.state(); return {xp:st.xp, level:st.level, rank:st.rank.name, streak:st.streak, badges:st.badges.filter(b=>b.earned).length}; },
    reset(){ S = blank(); save(); renderHUDs(); },
    renderHUDs
  };

  // ── UI: toasts, celebration, HUD ────────────────────────────────────
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function injectCSS(){
    if(document.getElementById('shg-css')) return;
    const css = document.createElement('style'); css.id = 'shg-css';
    css.textContent = `
    .shg-toasts{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none}
    .shg-toast{background:#0d1e32;border:1px solid #1e3a5c;color:#e8edf4;font:700 12.5px 'DM Sans',sans-serif;padding:9px 14px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:shgIn .25s ease-out}
    .shg-toast.xp{border-color:rgba(29,158,117,.5);color:#6fe0bb}
    .shg-toast.level{border-color:rgba(229,148,0,.6);color:#efb44e}
    .shg-toast.shield{border-color:rgba(46,139,192,.6);color:#8ecbec}
    .shg-toast.out{opacity:0;transform:translateY(6px);transition:all .3s}
    @keyframes shgIn{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}
    .shg-cele{position:fixed;left:50%;top:22px;transform:translateX(-50%);z-index:10000;background:linear-gradient(135deg,#12335a,#0c2340);border:1px solid rgba(229,148,0,.55);border-radius:16px;padding:14px 22px;text-align:center;box-shadow:0 18px 50px rgba(0,0,0,.55);font-family:'DM Sans',sans-serif;animation:shgDrop .4s cubic-bezier(.2,1.4,.4,1)}
    .shg-cele b{display:block;color:#fff;font-size:16px;font-weight:800}
    .shg-cele span{display:block;color:#a9c2dc;font-size:12.5px;margin-top:3px}
    @keyframes shgDrop{from{opacity:0;transform:translate(-50%,-20px) scale(.9)}to{opacity:1;transform:translate(-50%,0)}}
    .shg-confetti{position:fixed;top:-10px;width:8px;height:12px;z-index:9998;border-radius:2px;pointer-events:none;animation:shgFall 1.6s ease-in forwards}
    @keyframes shgFall{to{transform:translateY(105vh) rotate(540deg);opacity:.2}}
    .shg-hud{display:inline-flex;align-items:center;gap:10px;background:#0a1929;border:1px solid #1e3a5c;border-radius:999px;padding:6px 12px 6px 8px;font-family:'DM Sans',sans-serif;text-decoration:none}
    .shg-hud-icon{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(229,148,0,.14);border:1px solid rgba(229,148,0,.35);font-size:13px;color:#efb44e;font-weight:800}
    .shg-hud-txt{font-size:11.5px;font-weight:800;color:#fff;line-height:1.1}
    .shg-hud-sub{font-size:10px;color:#6b8ab0;font-family:'DM Mono',monospace}
    .shg-hud-bar{width:70px;height:5px;background:#060e1a;border-radius:99px;overflow:hidden}
    .shg-hud-fill{height:100%;background:linear-gradient(90deg,#E59400,#1D9E75)}
    .shg-hud-streak{font-size:12px;font-weight:800;color:#efb44e;font-family:'DM Mono',monospace}
    @media (prefers-reduced-motion: reduce){.shg-toast,.shg-cele{animation:none}.shg-confetti{display:none}}
    `;
    document.head.appendChild(css);
  }
  function toastBox(){
    let b = document.querySelector('.shg-toasts');
    if(!b){ b = document.createElement('div'); b.className='shg-toasts'; b.setAttribute('role','status'); b.setAttribute('aria-live','polite'); document.body.appendChild(b); }
    return b;
  }
  let lastToast = 0;
  function toast(msg, kind){
    if(!document.body) return;
    injectCSS();
    const now = Date.now();
    const box = toastBox();
    // Merge rapid-fire XP toasts so the corner doesn't flood
    if(kind === 'xp' && now - lastToast < 500 && box.lastChild && box.lastChild.classList.contains('xp')){
      box.lastChild.textContent = msg; return;
    }
    lastToast = now;
    const el = document.createElement('div');
    el.className = 'shg-toast ' + (kind||'');
    el.textContent = msg;
    box.appendChild(el);
    while(box.children.length > 3) box.firstChild.remove();
    setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(), 320); }, 2200);
  }
  function toastQuiet(msg){ toast(msg, 'level'); }
  // Celebrations queue so a level-up and a badge earned on the same answer
  // show one after the other instead of stacking on top of each other.
  const celeQueue = []; let celeBusy = false;
  function celebrate(title, sub){ celeQueue.push([title, sub]); if(!celeBusy) nextCele(); }
  function nextCele(){
    const item = celeQueue.shift();
    if(!item){ celeBusy = false; return; }
    celeBusy = true; showCele(item[0], item[1]);
    setTimeout(nextCele, 3300);
  }
  function showCele(title, sub){
    if(!document.body){ celeBusy=false; return; }
    injectCSS();
    const el = document.createElement('div');
    el.className = 'shg-cele'; el.setAttribute('role','status');
    el.innerHTML = `<b></b><span></span>`;
    el.querySelector('b').textContent = title; el.querySelector('span').textContent = sub||'';
    document.body.appendChild(el);
    if(!reduce){
      const colors = ['#E59400','#1D9E75','#2E8BC0','#8B5CF6','#E74C3C'];
      for(let i=0;i<36;i++){
        const c = document.createElement('div'); c.className='shg-confetti';
        c.style.left = Math.random()*100+'vw'; c.style.background = colors[i%colors.length];
        c.style.animationDelay = (Math.random()*0.4)+'s'; c.style.animationDuration = (1.2+Math.random()*0.9)+'s';
        document.body.appendChild(c); setTimeout(()=>c.remove(), 2600);
      }
    }
    setTimeout(()=>{ el.style.transition='opacity .4s'; el.style.opacity='0'; setTimeout(()=>el.remove(),450); }, 2800);
  }
  function renderHUDs(){
    if(!document.body) return;
    const nodes = document.querySelectorAll('[data-game-hud]');
    if(!nodes.length) return;
    injectCSS();
    const st = api.state();
    nodes.forEach(n => {
      n.innerHTML = `<span class="shg-hud" title="${st.toNext} XP to level ${st.level+1}">
        <span class="shg-hud-icon">${st.rank.icon}</span>
        <span><span class="shg-hud-txt">${st.rank.name} · Lv ${st.level}</span><br><span class="shg-hud-bar"><span class="shg-hud-fill" style="width:${st.levelPct}%;display:block"></span></span></span>
        <span class="shg-hud-streak" title="Daily study streak">🔥${st.streak}</span>
      </span>`;
    });
  }

  ensureMissions(); save();
  window.StudyHubGame = api;
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderHUDs); else renderHUDs();
})();
