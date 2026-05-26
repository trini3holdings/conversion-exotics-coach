/* Conversion Exotics — Call Coach v2
   Caller: Zack · Audit value: $3,000
*/

// ============== CONSTANTS ==============
const STORAGE_KEY = 'ce_call_coach_v2';
const WINNER_THRESHOLD = 10;             // calls per variant needed for winner call
const AUDIT_VALUE = 3000;

// Default CPC for markets not in the lookup table
const DEFAULT_CPC = {cpc_low: 1.20, cpc_high: 5.00, vol: 200, primary_kw: 'exotic car rental'};

// Market CPC table (loaded from market_cpc.json at runtime)
let MARKET_CPC = {};

// Prospect pool (loaded from prospects.json + any CSV imports)
let PROSPECTS = [];

// ============== SCRIPT VARIANTS ==============
// Each variant has 6 beats with timing in seconds and a line.
// Lines support {company}, {market}, {cpc_low}, {cpc_high}, {primary_kw} replacement.

const SCRIPTS = {
  A: {
    name: 'Pattern Interrupt',
    desc: 'Direct interrupt → permission → audit offer',
    beats: [
      {t: 8, title: 'Pattern Interrupt', line: 'Hey {company}? Weird question — are you the person who decides how the website is working over there?', note: 'Pause for response. If gatekeeper: "Who would I talk to about how the website is performing?"'},
      {t: 20, title: 'Permission Frame', line: 'Cool. My name is Zack with Conversion Exotics. Quick reason for the call — I help exotic car rental companies fix the spots on their site where bookings are slipping through. Do you have 30 seconds for me to tell you why I called?', note: 'Wait for "yes" or "what is this about". If no: "Totally fair — I\'ll send a quick note instead. What\'s the best email?"'},
      {t: 45, title: 'Specific Hook', line: 'I looked at {company}\'s site for about 2 minutes before I called. I noticed <span class="em">{leak_1}</span>. In our experience that\'s costing you roughly <span class="em">15–30% of bookings</span> you\'re already paying to drive to the page.', note: 'Use a real leak from the prospect picker if loaded. Otherwise generic.'},
      {t: 75, title: 'Audit Offer', line: 'So here is what I want to do — no pitch, no obligation. I\'ll build you a free <span class="em">CRO Audit</span> — a real one, the same one we charge <span class="em">$3,000</span> for. Walk you through exactly where bookings are leaking and how to plug it. Sound fair?', note: 'Wait. If yes → book time. If no → "Got it — what would have to be true for this to make sense?"'},
      {t: 105, title: 'Book the Time', line: 'Awesome. I\'ve got Thursday at 10am or Friday at 2pm Central. The audit walkthrough is about 25 minutes. Which works better?', note: 'Confirm phone + email. Send calendar invite immediately after call.'},
      {t: 130, title: 'Lock + Exit', line: 'Perfect. You\'ll get a calendar invite within 5 minutes from [Strategist Name] — they\'ll walk you through the audit. One favor: bring whoever runs ads if that\'s not you. Sound good?', note: 'End warm. Log in tracker. Move on.'}
    ]
  },
  B: {
    name: 'Curiosity Hook',
    desc: 'Soft entry → curiosity → audit offer',
    beats: [
      {t: 8, title: 'Soft Open', line: 'Hi — is this {company}? Quick question — who handles how the website is converting bookings over there?', note: 'If gatekeeper: "I have something they\'ll actually want to see — who should I ask for?"'},
      {t: 22, title: 'Curiosity Plant', line: 'Got it. I\'m Zack with Conversion Exotics. I just spent 2 minutes on your site and I noticed something that\'s probably costing you 10–20 bookings a month. Want to know what it is?', note: 'Almost always "yes". If pushed back: "Fair — should I email it?"'},
      {t: 45, title: 'Reveal the Leak', line: 'Specifically — <span class="em">{leak_1}</span>. And honestly the bigger issue is <span class="em">{leak_2}</span>. Most luxury renters bounce on stuff like that — they\'re already in spend-mode but the site loses them.', note: 'Use 2 real leaks from prospect picker if loaded.'},
      {t: 75, title: 'Audit Offer', line: 'So normally we charge <span class="em">$3,000</span> for a full CRO Audit. But I\'m running a few free ones this month for shops in {market} that look fixable. I\'ll record the whole thing for you. Want me to send it over?', note: 'They\'ll ask "what\'s the catch". Answer: "We\'re building case studies in this vertical. That\'s it."'},
      {t: 105, title: 'Book the Time', line: 'Great. The audit walk-through takes 25 minutes — I\'ll show you screen recordings of real users on your site. I\'ve got Thursday at 10am or Friday at 2pm Central — which works?', note: 'Get the time + phone + email locked. Confirm again before hanging up.'},
      {t: 130, title: 'Confirm + Exit', line: 'Perfect. I\'ll send you a calendar invite from [Strategist Name] in the next 5 minutes — they\'ll be the one walking you through. Talk to you Thursday.', note: 'Send invite immediately. Log call. Next.'}
    ]
  },
  C: {
    name: 'Paid-Ads Leak',
    desc: 'CPC anchor → spend-waste frame → audit offer',
    beats: [
      {t: 8, title: 'Open with Spend Frame', line: 'Hey {company} — who handles your Google ads and website over there?', note: 'If gatekeeper: "I noticed you\'re running ads — wanted to flag something they\'ll want to know."'},
      {t: 22, title: 'CPC Anchor', line: 'Cool — Zack with Conversion Exotics. I saw you\'re bidding on <span class="cpc">{primary_kw}</span> in {market} — that keyword is running about <span class="cpc">${cpc_low}–${cpc_high} per click</span> right now. You guys spending real money on Google?', note: 'They\'ll either confirm or push back. Either way you have permission to continue.'},
      {t: 45, title: 'The Leak', line: 'Here\'s why I called. I clicked your ad earlier — and <span class="em">{leak_1}</span>. So you\'re paying <span class="cpc">$5+ per click</span> to send people to a page that loses them in under 4 seconds. Quick math — at even <span class="em">100 clicks/week</span> that\'s <span class="cpc">$2,000/month</span> in spend going to a page that doesn\'t convert.', note: 'Hard numbers land hard. If they say they\'re not spending much, ask: "What would converting just 2 more rentals a month be worth to you?"'},
      {t: 75, title: 'Audit Offer', line: 'I want to build you a free <span class="em">CRO Audit</span> — normally we charge <span class="em">$3,000</span>. I\'ll show you the exact leaks on your landing page, what they\'re costing you per click, and how to fix them. No pitch. Fair trade?', note: 'They\'ll ask the catch. Answer: "We work with shops that look fixable. That\'s the qualifier."'},
      {t: 105, title: 'Book the Time', line: 'Perfect. The walk-through is 25 minutes. I\'ve got Thursday at 10am or Friday at 2pm Central — which works better?', note: 'Lock the time + phone + email. Confirm.'},
      {t: 130, title: 'Lock + Exit', line: 'Done. Calendar invite from [Strategist Name] hits your inbox in 5 minutes. Bring whoever runs your ads if that\'s not you. Talk soon.', note: 'Send invite now. Log call. Next prospect.'}
    ]
  }
};

// ============== OBJECTIONS ==============
const OBJECTIONS = [
  {cat: 'PRICE', q: '"How much does this cost?"', a: 'The audit itself is <span class="em">free</span> — normally $3,000. If you decide you want us to actually implement the fixes after, that\'s a separate conversation. But the audit is yours either way.'},
  {cat: 'TIME', q: '"I don\'t have time for this"', a: 'Totally get it. That\'s exactly why the audit is recorded — you can watch it at <span class="em">2x speed in 12 minutes</span>. And honestly, if you\'re running ads, the audit pays for itself the first week.'},
  {cat: 'TRUST', q: '"Who is Conversion Exotics?"', a: 'We\'re a CRO firm that focuses on exotic and luxury rental shops specifically. Happy to send case studies — but I\'d rather just <span class="em">show you</span> what we\'d do for your site. Faster than talking.'},
  {cat: 'STATUS', q: '"We already have a marketing person/agency"', a: 'Even better. The audit gives them a <span class="em">third-party scorecard</span> so they have hard data to act on. We don\'t replace marketing teams — we make them sharper.'},
  {cat: 'BRUSH-OFF', q: '"Send me an email"', a: 'I will — but a written email won\'t capture what I\'m seeing on your page. Can I just do a <span class="em">5-minute screen-share walkthrough</span> instead? You\'ll see exactly what I mean.'},
  {cat: 'AUTHORITY', q: '"I have to talk to my partner"', a: 'Smart. Want me to send you the audit as a video so <span class="em">you can both watch it</span> on your own time? Or get them on the call when we walk through it together — whichever you prefer.'},
  {cat: 'SKEPTICISM', q: '"Why is this free?"', a: 'Two reasons. One — we\'re building case studies in this vertical. Two — most shops we audit end up hiring us. The audit is the <span class="em">demonstration of competence</span>. No tricks.'},
  {cat: 'SOFT-NO', q: '"We\'re not interested in changes right now"', a: 'Fair. Quick question — if your booking rate went up <span class="em">15% next month</span> without you changing anything except the page, would that be worth 25 minutes? If yes, the audit\'s yours. If no, I\'ll go.'}
];

// ============== BEAT TIMING HELPERS ==============
function getCurrentBeat(elapsedSec, variant) {
  const beats = SCRIPTS[variant].beats;
  for (let i = beats.length - 1; i >= 0; i--) {
    if (elapsedSec >= beats[i].t) return i;
  }
  return -1; // pre-beat
}

// ============== STATE ==============
let state = {
  variant: 'A',
  timer: {running: false, startedAt: 0, accumulated: 0, intervalId: null},
  calls: [],            // {ts, company, market, phone, variant, outcome, notes, prospectN}
  selectedProspectN: null,
};

// ============== STORAGE ==============
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (s.calls && Array.isArray(s.calls)) state.calls = s.calls;
    if (s.variant && SCRIPTS[s.variant]) state.variant = s.variant;
    if (s.customProspects && Array.isArray(s.customProspects)) {
      PROSPECTS = PROSPECTS.concat(s.customProspects);
    }
  } catch(e) { /* fresh */ }
}
function saveState() {
  // Don't persist live timer, only calls + variant + custom imports
  const customProspects = PROSPECTS.filter(p => p._imported);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    calls: state.calls, variant: state.variant, customProspects
  }));
}

// ============== TODAY FILTER ==============
function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function callsToday() {
  const tk = todayKey();
  return state.calls.filter(c => c.ts.slice(0,10) === tk);
}

// ============== RENDER: SCRIPT ==============
function getProspectByN(n) {
  return PROSPECTS.find(p => p.n === n);
}
function marketCPCFor(marketStr) {
  if (!marketStr) return DEFAULT_CPC;
  // Try exact match first, then loose match
  if (MARKET_CPC[marketStr]) return MARKET_CPC[marketStr];
  const ml = marketStr.toLowerCase();
  for (const key of Object.keys(MARKET_CPC)) {
    if (key.startsWith('_')) continue;
    if (ml.includes(key.toLowerCase().split(' ')[0])) {
      return MARKET_CPC[key];
    }
  }
  return MARKET_CPC._default || DEFAULT_CPC;
}
function fillBeatLine(line, ctx) {
  return line
    .replace(/\{company\}/g, ctx.company || '[their company]')
    .replace(/\{market\}/g, ctx.market || '[their market]')
    .replace(/\{primary_kw\}/g, ctx.primary_kw || 'exotic car rental')
    .replace(/\{cpc_low\}/g, ctx.cpc_low || '1.20')
    .replace(/\{cpc_high\}/g, ctx.cpc_high || '5.00')
    .replace(/\{leak_1\}/g, ctx.leak_1 || 'your booking flow has friction we can show you on a call')
    .replace(/\{leak_2\}/g, ctx.leak_2 || 'your fleet page is slow and hard to scan on mobile');
}
function renderScript() {
  const elapsed = getElapsedSec();
  const activeIdx = getCurrentBeat(elapsed, state.variant);
  const beats = SCRIPTS[state.variant].beats;

  // Context for placeholder fill
  const p = getProspectByN(state.selectedProspectN);
  const market = p ? p.market : (document.getElementById('inputMarket').value || '');
  const cpc = marketCPCFor(market);
  const ctx = {
    company: p ? p.domain : (document.getElementById('inputCompany').value || ''),
    market: market,
    primary_kw: cpc.primary_kw,
    cpc_low: cpc.cpc_low.toFixed(2),
    cpc_high: cpc.cpc_high.toFixed(2),
    leak_1: p && p.issues && p.issues[0] ? p.issues[0] : null,
    leak_2: p && p.issues && p.issues[1] ? p.issues[1] : null,
  };

  const flow = document.getElementById('scriptFlow');
  flow.innerHTML = beats.map((b, i) => `
    <div class="beat ${i === activeIdx ? 'active' : ''}">
      <div class="beat-head">
        <span class="beat-num">Beat ${i+1}</span>
        <span class="beat-time">@ ${b.t}s</span>
      </div>
      <div class="beat-title">${b.title}</div>
      <div class="beat-line">${fillBeatLine(b.line, ctx)}</div>
      <div class="beat-note">${b.note}</div>
    </div>
  `).join('');

  // Active variant tab
  document.querySelectorAll('.variant-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.variant === state.variant);
  });
}

// ============== RENDER: PROSPECT LEAKS ==============
function renderProspectLeaks() {
  const p = getProspectByN(state.selectedProspectN);
  const panel = document.getElementById('prospectLeaks');
  if (!p) { panel.hidden = true; return; }

  panel.hidden = false;
  const risk = (p.risk || '').toUpperCase();
  document.getElementById('leaksRisk').textContent = risk || '—';
  document.getElementById('leaksRisk').className = 'leaks-risk ' + risk;

  const list = document.getElementById('leaksList');
  list.innerHTML = (p.issues || []).map(i => `<li>${i}</li>`).join('') || '<li>No issues recorded</li>';

  document.getElementById('leaksSpeed').textContent = p.speed || '—';
  document.getElementById('leaksTrust').textContent = p.trust || '—';
  document.getElementById('leaksCta').textContent = p.cta || '—';
}

// ============== RENDER: OBJECTIONS ==============
function renderObjections() {
  const grid = document.getElementById('objectionsGrid');
  grid.innerHTML = OBJECTIONS.map((o, i) => `
    <div class="objection" data-i="${i}">
      <div class="obj-cat">${o.cat}</div>
      <div class="obj-q">${o.q}</div>
      <div class="obj-a">${o.a}</div>
    </div>
  `).join('');
  grid.querySelectorAll('.objection').forEach(el => {
    el.addEventListener('click', () => {
      grid.querySelectorAll('.objection').forEach(o => o.classList.remove('highlighted'));
      el.classList.add('highlighted');
    });
  });
}

// ============== RENDER: PROSPECT PICKER ==============
function renderProspectPicker() {
  const sel = document.getElementById('prospectPicker');
  // Group by market
  const byMarket = {};
  PROSPECTS.forEach(p => {
    const m = p.market || 'Unknown';
    if (!byMarket[m]) byMarket[m] = [];
    byMarket[m].push(p);
  });
  const sorted = Object.keys(byMarket).sort();
  let html = '<option value="">— Select prospect or type below —</option>';
  for (const m of sorted) {
    html += `<optgroup label="${m} (${byMarket[m].length})">`;
    byMarket[m].forEach(p => {
      const riskTag = p.risk ? ' · ' + p.risk : '';
      html += `<option value="${p.n}">#${p.n} · ${p.domain}${riskTag}</option>`;
    });
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  sel.value = state.selectedProspectN || '';
}

// ============== RENDER: STATS ==============
function renderStats() {
  const today = callsToday();
  document.getElementById('statTotal').textContent = today.length;
  document.getElementById('totalCalls').textContent = today.length;
  const booked = today.filter(c => ['BK','SH','CL'].includes(c.outcome)).length;
  const closed = today.filter(c => c.outcome === 'CL').length;
  document.getElementById('statBooked').textContent = booked;
  document.getElementById('statClosed').textContent = closed;
  const rate = today.length ? Math.round(booked / today.length * 100) : 0;
  document.getElementById('statRate').textContent = rate + '%';

  // Variant splits
  ['A','B','C'].forEach(v => {
    const subset = today.filter(c => c.variant === v);
    const b = subset.filter(c => ['BK','SH','CL'].includes(c.outcome)).length;
    document.getElementById('vs'+v).textContent = `${subset.length} calls · ${b} booked`;
  });

  renderWinnerBanner(today);
}

function renderWinnerBanner(today) {
  const banner = document.getElementById('winnerBanner');
  const v = {A:{n:0,b:0},B:{n:0,b:0},C:{n:0,b:0}};
  today.forEach(c => {
    if (!v[c.variant]) return;
    v[c.variant].n++;
    if (['BK','SH','CL'].includes(c.outcome)) v[c.variant].b++;
  });
  const variantsHit = Object.values(v).filter(x => x.n >= WINNER_THRESHOLD).length;
  if (variantsHit < 2) {
    // Show "need more calls" message
    const min = Math.min(v.A.n, v.B.n, v.C.n);
    banner.hidden = false;
    banner.className = 'winner-banner directional';
    banner.innerHTML = `<span class="badge">SAMPLING</span> Need ${WINNER_THRESHOLD}+ calls per variant to compare. Current: A=${v.A.n}, B=${v.B.n}, C=${v.C.n}.`;
    return;
  }
  // Compute booking rate per variant that has enough data
  const rates = Object.entries(v)
    .filter(([k, x]) => x.n >= WINNER_THRESHOLD)
    .map(([k, x]) => ({k, rate: x.b / x.n, n: x.n, b: x.b}))
    .sort((a, b) => b.rate - a.rate);
  const top = rates[0];
  banner.hidden = false;
  banner.className = 'winner-banner';
  banner.innerHTML = `<span class="badge">LEADING</span> Variant <b>${top.k}</b> at <b>${(top.rate*100).toFixed(0)}%</b> booking rate (${top.b}/${top.n}). ` +
    rates.slice(1).map(r => `${r.k}=${(r.rate*100).toFixed(0)}%`).join(' · ');
}

// ============== RENDER: LOG ==============
function renderLog() {
  const today = callsToday().slice().reverse();
  const list = document.getElementById('logList');
  if (!today.length) {
    list.innerHTML = '<div class="log-empty">No calls logged yet today.</div>';
    return;
  }
  list.innerHTML = today.map(c => {
    const time = new Date(c.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    return `<div class="log-row">
      <div class="lr-top">
        <span class="lr-co">${c.company || '(no name)'}</span>
        <span class="lr-time">${time}</span>
      </div>
      <div class="lr-meta">
        <span class="lr-out ${c.outcome}">${c.outcome}</span>
        · ${c.variant} · ${c.market || '—'}
      </div>
      ${c.notes ? `<div class="lr-notes">${c.notes}</div>` : ''}
    </div>`;
  }).join('');
}

// ============== TIMER ==============
function getElapsedSec() {
  if (!state.timer.running) return Math.floor(state.timer.accumulated / 1000);
  const now = Date.now();
  return Math.floor((state.timer.accumulated + (now - state.timer.startedAt)) / 1000);
}
function tickTimer() {
  const sec = getElapsedSec();
  const mm = String(Math.floor(sec/60)).padStart(2,'0');
  const ss = String(sec % 60).padStart(2,'0');
  document.getElementById('timerDisplay').textContent = `${mm}:${ss}`;
  const idx = getCurrentBeat(sec, state.variant);
  const beat = idx >= 0 ? SCRIPTS[state.variant].beats[idx] : null;
  document.getElementById('timerBeat').textContent = beat ? `Beat ${idx+1}: ${beat.title}` : 'Press Space to start';
  // Re-render script flow to highlight active beat
  if (state.timer.running || sec === 0) renderScript();
}
function startTimer() {
  if (state.timer.running) return;
  state.timer.running = true;
  state.timer.startedAt = Date.now();
  state.timer.intervalId = setInterval(tickTimer, 250);
  document.getElementById('btnStartPause').textContent = 'Pause';
}
function pauseTimer() {
  if (!state.timer.running) return;
  state.timer.accumulated += (Date.now() - state.timer.startedAt);
  state.timer.running = false;
  clearInterval(state.timer.intervalId);
  document.getElementById('btnStartPause').textContent = 'Resume';
}
function resetTimer() {
  state.timer.running = false;
  state.timer.accumulated = 0;
  clearInterval(state.timer.intervalId);
  document.getElementById('btnStartPause').textContent = 'Start';
  document.getElementById('timerDisplay').textContent = '00:00';
  document.getElementById('timerBeat').textContent = 'Press Space to start';
  renderScript();
}
function toggleStartPause() {
  if (state.timer.running) pauseTimer(); else startTimer();
}

// ============== VARIANT SWITCH ==============
function setVariant(v) {
  if (!SCRIPTS[v]) return;
  state.variant = v;
  saveState();
  renderScript();
  tickTimer();
}

// ============== PROSPECT SELECT ==============
function selectProspect(nStr) {
  const n = parseInt(nStr, 10);
  if (!n) {
    state.selectedProspectN = null;
    renderProspectLeaks();
    renderScript();
    return;
  }
  const p = getProspectByN(n);
  if (!p) return;
  state.selectedProspectN = n;
  document.getElementById('inputCompany').value = p.domain || '';
  document.getElementById('inputMarket').value = p.market || '';
  document.getElementById('inputPhone').value = p.phone || '';
  renderProspectLeaks();
  renderScript();
}

function nextProspect(direction = 1) {
  if (!PROSPECTS.length) return;
  let i = PROSPECTS.findIndex(p => p.n === state.selectedProspectN);
  if (i === -1) i = direction > 0 ? -1 : PROSPECTS.length;
  let next = i + direction;
  if (next >= PROSPECTS.length) next = 0;
  if (next < 0) next = PROSPECTS.length - 1;
  const p = PROSPECTS[next];
  selectProspect(String(p.n));
  document.getElementById('prospectPicker').value = String(p.n);
}

// ============== LOG CALL ==============
function logCall() {
  const company = document.getElementById('inputCompany').value.trim();
  const market = document.getElementById('inputMarket').value.trim();
  const phone = document.getElementById('inputPhone').value.trim();
  const outcome = document.getElementById('inputOutcome').value;
  const notes = document.getElementById('inputNotes').value.trim();

  if (!outcome) {
    flash('Pick an outcome first', true);
    return;
  }
  const call = {
    ts: new Date().toISOString(),
    company, market, phone,
    variant: state.variant,
    outcome, notes,
    prospectN: state.selectedProspectN,
  };
  state.calls.push(call);
  saveState();
  flash('Logged ✓', false);
  // Auto-reset form (per user spec)
  setTimeout(() => {
    document.getElementById('inputCompany').value = '';
    document.getElementById('inputMarket').value = '';
    document.getElementById('inputPhone').value = '';
    document.getElementById('inputOutcome').value = '';
    document.getElementById('inputNotes').value = '';
    document.getElementById('prospectPicker').value = '';
    state.selectedProspectN = null;
    renderProspectLeaks();
    renderScript();
    resetTimer();
  }, 1000);
  renderStats();
  renderLog();
}

function flash(msg, isError) {
  const el = document.getElementById('formFlash');
  el.textContent = msg;
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// ============== CSV IMPORT / EXPORT ==============
function parseCSV(text) {
  // Lightweight CSV parser. Handles quoted fields with commas.
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const splitRow = (row) => {
    const out = []; let cur = ''; let inQ = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"' && row[i+1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const headers = splitRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    const obj = {};
    headers.forEach((h, j) => { obj[h] = cells[j] || ''; });
    rows.push(obj);
  }
  return rows;
}

function importCSV(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const rows = parseCSV(e.target.result);
      if (!rows.length) { flash('CSV empty', true); return; }
      const startN = (PROSPECTS.length ? Math.max(...PROSPECTS.map(p => p.n || 0)) : 0) + 1;
      const added = rows.map((r, i) => ({
        n: startN + i,
        domain: r.domain || r.company || r.url || r.website || r.site || `imported-${startN+i}`,
        market: r.market || r.city || r.location || '',
        phone: r.phone || r.phone_number || '',
        email: r.email || '',
        issues: [r.issue_1, r.issue_2, r.issue_3, r.issues].filter(Boolean),
        speed: r.speed || '', trust: r.trust || '', cta: r.cta || '',
        risk: (r.risk || '').toUpperCase(),
        _imported: true,
      }));
      PROSPECTS = PROSPECTS.concat(added);
      saveState();
      renderProspectPicker();
      flash(`Imported ${added.length} prospects ✓`, false);
    } catch(err) {
      flash('CSV parse failed', true);
      console.error(err);
    }
  };
  reader.readAsText(file);
}

function exportCalls() {
  const today = callsToday();
  if (!today.length) { flash('No calls to export', true); return; }
  const headers = ['timestamp','company','market','phone','variant','outcome','notes','prospect_n'];
  const csv = [headers.join(',')].concat(
    today.map(c => headers.map(h => {
      const v = h === 'timestamp' ? c.ts : (h === 'prospect_n' ? (c.prospectN || '') : (c[h] || ''));
      return '"' + String(v).replace(/"/g,'""') + '"';
    }).join(','))
  ).join('\n');
  const blob = new Blob([csv], {type: 'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ce_calls_${todayKey()}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

function clearAll() {
  if (!confirm('Clear ALL today\'s calls? This cannot be undone.')) return;
  const tk = todayKey();
  state.calls = state.calls.filter(c => c.ts.slice(0,10) !== tk);
  saveState();
  renderStats();
  renderLog();
  flash('Today\'s calls cleared', false);
}

// ============== KEYBOARD ==============
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger when typing in inputs
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input','textarea','select'].includes(tag)) {
      // Allow Ctrl+L / Ctrl+N etc even in inputs
      if (!e.ctrlKey && !e.metaKey) return;
    }
    if (e.code === 'Space' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); toggleStartPause(); return;
    }
    if (e.key === 'R' && e.shiftKey) { e.preventDefault(); resetTimer(); return; }
    if (e.key === '1') { setVariant('A'); return; }
    if (e.key === '2') { setVariant('B'); return; }
    if (e.key === '3') { setVariant('C'); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); logCall(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); nextProspect(1); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); nextProspect(-1); return; }
    if (e.key === 'Escape') {
      const legend = document.getElementById('kbdLegend');
      if (!legend.hidden) legend.hidden = true;
    }
  });
}

// ============== INIT ==============
async function init() {
  // Set session date
  document.getElementById('sessionDate').textContent = new Date().toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});

  // Load prospect + CPC data
  try {
    const [p, m] = await Promise.all([
      fetch('prospects.json').then(r => r.json()),
      fetch('market_cpc.json').then(r => r.json()),
    ]);
    PROSPECTS = p;
    MARKET_CPC = m;
  } catch(e) {
    console.warn('Could not load prospects/market data', e);
  }

  loadState();
  renderObjections();
  renderProspectPicker();
  renderScript();
  renderProspectLeaks();
  renderStats();
  renderLog();
  tickTimer();

  // Bind
  document.getElementById('btnStartPause').onclick = toggleStartPause;
  document.getElementById('btnReset').onclick = resetTimer;
  document.querySelectorAll('.variant-tab').forEach(t => {
    t.onclick = () => setVariant(t.dataset.variant);
  });
  document.getElementById('prospectPicker').onchange = (e) => selectProspect(e.target.value);
  document.getElementById('inputCompany').oninput = () => renderScript();
  document.getElementById('inputMarket').oninput = () => renderScript();
  document.getElementById('btnLog').onclick = logCall;
  document.getElementById('csvInput').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importCSV(f);
    e.target.value = '';
  };
  document.getElementById('btnExport').onclick = exportCalls;
  document.getElementById('btnClearAll').onclick = clearAll;
  document.getElementById('kbdToggle').onclick = () => {
    const l = document.getElementById('kbdLegend');
    l.hidden = !l.hidden;
  };

  bindKeyboard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
