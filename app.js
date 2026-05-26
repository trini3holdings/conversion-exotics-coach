/* Conversion Exotics — Call Coach v3
   Multi-brand, multi-caller, Cal embed, collapsible objections.
   Scripts and objections loaded per-brand from JSON.
*/

// ============== CONSTANTS ==============
const STORAGE_KEY = 'ce_call_coach_v3';
const WINNER_THRESHOLD = 10;
const DEFAULT_CPC = { cpc_low: 1.20, cpc_high: 5.00, vol: 200, primary_kw: 'exotic car rental' };

// Brand registry — add more brands here
const BRANDS = {
  'conversion-exotics': {
    slug: 'conversion-exotics',
    name: 'Conversion Exotics',
    short: 'CE',
    sub: 'Cold call → free CRO audit · v3',
    strategist: 'Tony',
    active: true,
    theme: { ink: '#1A1A1A', gold: '#B8893A', cream: '#F4F0E8', highlight: '#FFF8E8' }
  },
  'brand-2': { slug: 'brand-2', name: 'Brand 2 (slot)', short: 'B2', sub: 'Coming soon', strategist: 'Tony', active: false, theme: null },
  'brand-3': { slug: 'brand-3', name: 'Brand 3 (slot)', short: 'B3', sub: 'Coming soon', strategist: 'Tony', active: false, theme: null },
  'brand-4': { slug: 'brand-4', name: 'Brand 4 (slot)', short: 'B4', sub: 'Coming soon', strategist: 'Tony', active: false, theme: null }
};

// Loaded per-brand at runtime
let SCRIPTS = {};       // { A: {...}, B: {...}, C: {...} }
let OBJECTIONS = [];
let PROSPECTS = [];
let MARKET_CPC = {};

// ============== STATE ==============
let state = {
  brand: 'conversion-exotics',
  caller: 'Zack',
  variant: 'A',
  sidePane: 'stats',   // 'stats' | 'cal'
  timer: { running: false, startedAt: 0, accumulated: 0, intervalId: null },
  calls: [],            // {ts, brand, caller, company, market, phone, variant, outcome, notes, prospectN}
  selectedProspectN: null,
  customProspects: []
};

// ============== STORAGE ==============
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (s.calls && Array.isArray(s.calls)) state.calls = s.calls;
    if (s.variant) state.variant = s.variant;
    if (s.brand && BRANDS[s.brand]) state.brand = s.brand;
    if (s.caller) state.caller = s.caller;
    if (s.sidePane) state.sidePane = s.sidePane;
    if (s.customProspects && Array.isArray(s.customProspects)) state.customProspects = s.customProspects;
  } catch (e) { /* fresh */ }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      calls: state.calls,
      variant: state.variant,
      brand: state.brand,
      caller: state.caller,
      sidePane: state.sidePane,
      customProspects: state.customProspects
    }));
  } catch (e) { /* quota */ }
}

// ============== BRAND DATA LOADING ==============
async function loadBrandData(brandSlug) {
  const brand = BRANDS[brandSlug];
  if (!brand || !brand.active) {
    // Show empty state for inactive brands
    SCRIPTS = {};
    OBJECTIONS = [];
    PROSPECTS = [];
    MARKET_CPC = {};
    return false;
  }
  const base = `brands/${brandSlug}`;
  try {
    const [scriptsRes, objRes, prospRes, cpcRes] = await Promise.all([
      fetch(`${base}/scripts.json`),
      fetch(`${base}/objections.json`),
      fetch(`${base}/prospects.json`),
      fetch(`${base}/market_cpc.json`)
    ]);
    const scriptsData = await scriptsRes.json();
    const objData = await objRes.json();
    PROSPECTS = await prospRes.json();
    MARKET_CPC = await cpcRes.json();
    SCRIPTS = scriptsData.variants;
    OBJECTIONS = objData.objections;
    // Merge in custom CSV-uploaded prospects
    PROSPECTS = PROSPECTS.concat(state.customProspects);
    return true;
  } catch (e) {
    console.error('Brand data load failed:', e);
    return false;
  }
}

// ============== TOKEN REPLACEMENT ==============
function getProspectContext() {
  const company = document.getElementById('company').value.trim() || '[company]';
  const market = document.getElementById('market').value.trim() || '[city]';
  const cpc = lookupMarketCPC(market);
  const prospect = state.selectedProspectN ? PROSPECTS.find(p => p.n === state.selectedProspectN) : null;
  const leak1 = prospect && prospect.issues && prospect.issues[0] ? prospect.issues[0] : 'the booking flow buries the deposit and price until checkout';
  const leak2 = prospect && prospect.issues && prospect.issues[1] ? prospect.issues[1] : 'the mobile site shows a contact form instead of live availability';
  return {
    caller: state.caller,
    strategist: BRANDS[state.brand].strategist,
    company,
    market,
    primary_kw: cpc.primary_kw,
    cpc_low: cpc.cpc_low.toFixed(2),
    cpc_high: cpc.cpc_high.toFixed(2),
    leak_1: leak1,
    leak_2: leak2
  };
}
function lookupMarketCPC(market) {
  if (!market) return { ...DEFAULT_CPC };
  const norm = market.toLowerCase().trim();
  for (const key in MARKET_CPC) {
    if (norm.includes(key.toLowerCase())) return MARKET_CPC[key];
  }
  return { ...DEFAULT_CPC };
}
function fillTokens(template, ctx) {
  return template.replace(/\{(\w+)\}/g, (_, key) => ctx[key] !== undefined ? ctx[key] : `{${key}}`);
}

// ============== RENDER · BEATS ==============
function renderBeats() {
  const container = document.getElementById('beatsContainer');
  if (!container) return;
  const variant = SCRIPTS[state.variant];
  if (!variant) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">No script loaded for this brand yet.</div>';
    return;
  }
  const ctx = getProspectContext();
  const elapsed = currentElapsedSec();
  let cumulative = 0;
  const html = variant.beats.map((b, i) => {
    const start = cumulative;
    cumulative += b.t;
    const isActive = elapsed >= start && elapsed < cumulative;
    const respHtml = (b.responses || []).map(r => `<span class="resp">"${r}"</span>`).join(' / ');
    return `
      <div class="beat ${isActive ? 'active' : ''}">
        <div class="beat-head">
          <span class="beat-phase">${b.phase || ''}</span>
          <span class="beat-time">@ ${start}s · ${b.t}s</span>
        </div>
        <div class="beat-title">${b.title}</div>
        <div class="beat-line">${state.caller}: "${fillTokens(b.line, ctx)}"</div>
        ${b.responses && b.responses.length ? `<div class="beat-responses"><span class="arrow">↳</span>Prospect likely: ${respHtml}</div>` : ''}
        ${b.followup ? `<div class="beat-followup">${state.caller}: <em>"${fillTokens(b.followup, ctx)}"</em></div>` : ''}
        ${b.note ? `<div class="beat-note">${fillTokens(b.note, ctx)}</div>` : ''}
      </div>
    `;
  }).join('');
  container.innerHTML = html;
}

// ============== RENDER · OBJECTIONS (collapsible) ==============
function renderObjections() {
  const container = document.getElementById('objectionsContainer');
  if (!container) return;
  if (!OBJECTIONS.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">No objections loaded.</div>';
    return;
  }
  container.innerHTML = OBJECTIONS.map((o, i) => `
    <div class="objection-card" data-idx="${i}">
      <div class="objection-q">
        <span class="objection-cat">${o.cat}</span>
        <span class="objection-q-text">${o.q}</span>
        <span class="objection-chevron">▸</span>
      </div>
      <div class="objection-a">${o.a}</div>
    </div>
  `).join('');
  container.querySelectorAll('.objection-card').forEach(card => {
    card.querySelector('.objection-q').addEventListener('click', () => {
      card.classList.toggle('open');
    });
  });
}

// ============== TIMER ==============
function currentElapsedSec() {
  if (state.timer.running) {
    return state.timer.accumulated + Math.floor((Date.now() - state.timer.startedAt) / 1000);
  }
  return state.timer.accumulated;
}
function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function tickTimer() {
  const el = document.getElementById('timerDisplay');
  if (el) el.textContent = fmtTime(currentElapsedSec());
  renderBeats();
}
function startTimer() {
  if (state.timer.running) return;
  state.timer.startedAt = Date.now();
  state.timer.running = true;
  state.timer.intervalId = setInterval(tickTimer, 1000);
  document.getElementById('timerStart').textContent = 'Pause';
  document.getElementById('timerHint').textContent = 'Recording…';
  tickTimer();
}
function pauseTimer() {
  if (!state.timer.running) return;
  state.timer.accumulated += Math.floor((Date.now() - state.timer.startedAt) / 1000);
  state.timer.running = false;
  clearInterval(state.timer.intervalId);
  document.getElementById('timerStart').textContent = 'Resume';
  document.getElementById('timerHint').textContent = 'Paused';
}
function toggleTimer() { state.timer.running ? pauseTimer() : startTimer(); }
function resetTimer() {
  pauseTimer();
  state.timer.accumulated = 0;
  state.timer.startedAt = 0;
  document.getElementById('timerDisplay').textContent = '00:00';
  document.getElementById('timerStart').textContent = 'Start';
  document.getElementById('timerHint').textContent = 'Press Space to start';
  renderBeats();
}

// ============== STATS ==============
function renderStats() {
  const todayKey = new Date().toDateString();
  const today = state.calls.filter(c => new Date(c.ts).toDateString() === todayKey);
  const calls = today.length;
  const booked = today.filter(c => ['BK', 'SH', 'CL'].includes(c.outcome)).length;
  const closed = today.filter(c => c.outcome === 'CL').length;
  const rate = calls ? Math.round((booked / calls) * 100) : 0;
  document.getElementById('stat-calls').textContent = calls;
  document.getElementById('stat-booked').textContent = booked;
  document.getElementById('stat-closed').textContent = closed;
  document.getElementById('stat-bookrate').textContent = `${rate}%`;

  // Per variant
  const vStats = document.getElementById('variantStats');
  if (vStats) {
    vStats.innerHTML = ['A', 'B', 'C'].map(v => {
      const vCalls = state.calls.filter(c => c.variant === v).length;
      const vBooked = state.calls.filter(c => c.variant === v && ['BK', 'SH', 'CL'].includes(c.outcome)).length;
      return `<div class="variant-stats-row"><span class="label">${v}</span><span>${vCalls} calls · ${vBooked} booked</span></div>`;
    }).join('');
  }
  // Per caller
  const cStats = document.getElementById('callerStats');
  if (cStats) {
    cStats.innerHTML = ['Zack', 'Tony'].map(name => {
      const calls = state.calls.filter(c => c.caller === name).length;
      const booked = state.calls.filter(c => c.caller === name && ['BK', 'SH', 'CL'].includes(c.outcome)).length;
      return `<div class="caller-stats-row"><span class="label">${name}</span><span>${calls} calls · ${booked} booked</span></div>`;
    }).join('');
  }
  // Sampling banner
  const aN = state.calls.filter(c => c.variant === 'A').length;
  const bN = state.calls.filter(c => c.variant === 'B').length;
  const cN = state.calls.filter(c => c.variant === 'C').length;
  document.getElementById('samplingMsg').textContent =
    `Need ${WINNER_THRESHOLD}+ calls per variant to compare. Current: A=${aN}, B=${bN}, C=${cN}.`;

  checkWinner(aN, bN, cN);
}

function checkWinner(aN, bN, cN) {
  if (aN < WINNER_THRESHOLD || bN < WINNER_THRESHOLD || cN < WINNER_THRESHOLD) return;
  const rates = ['A', 'B', 'C'].map(v => {
    const total = state.calls.filter(c => c.variant === v).length;
    const booked = state.calls.filter(c => c.variant === v && ['BK', 'SH', 'CL'].includes(c.outcome)).length;
    return { v, rate: total ? booked / total : 0 };
  }).sort((a, b) => b.rate - a.rate);
  if (rates[0].rate - rates[1].rate >= 0.15) {
    const banner = document.getElementById('winnerBanner');
    banner.innerHTML = `🏆 Winner: Variant ${rates[0].v} (${Math.round(rates[0].rate * 100)}% booking rate, ${Math.round((rates[0].rate - rates[1].rate) * 100)}pp ahead) <span class="close">×</span>`;
    banner.classList.remove('hidden');
    banner.querySelector('.close').onclick = () => banner.classList.add('hidden');
  }
}

// ============== CALL LOG ==============
function renderCallLog() {
  const log = document.getElementById('callLog');
  if (!log) return;
  const recent = state.calls.slice(-12).reverse();
  if (!recent.length) {
    log.innerHTML = '<div style="color:#888;font-size:12px;padding:6px;">No calls logged yet today.</div>';
    return;
  }
  log.innerHTML = recent.map(c => `
    <div class="log-row">
      <span class="log-outcome ${c.outcome.toLowerCase()}">${c.outcome}</span>
      <span style="flex:1;font-weight:500;">${c.company || '—'}</span>
      <span style="color:#888;">${c.variant}·${(c.caller || 'Z').slice(0, 1)}</span>
      <span class="log-time">${new Date(c.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  `).join('');
}

function logCall() {
  const outcome = document.getElementById('outcome').value;
  if (!outcome) { alert('Pick an outcome first.'); return; }
  const call = {
    ts: Date.now(),
    brand: state.brand,
    caller: state.caller,
    variant: state.variant,
    company: document.getElementById('company').value.trim(),
    market: document.getElementById('market').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    outcome,
    notes: document.getElementById('notes').value.trim(),
    prospectN: state.selectedProspectN
  };
  state.calls.push(call);
  saveState();
  renderStats();
  renderCallLog();
  // Auto-reset after 1s
  setTimeout(() => { clearForm(); resetTimer(); }, 1000);
}

function clearForm() {
  document.getElementById('prospectSelect').value = '';
  document.getElementById('company').value = '';
  document.getElementById('market').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('outcome').value = '';
  document.getElementById('notes').value = '';
  document.getElementById('leaksPanel').classList.add('hidden');
  state.selectedProspectN = null;
  renderBeats();
}

// ============== PROSPECT PICKER ==============
function renderProspectPicker() {
  const sel = document.getElementById('prospectSelect');
  if (!sel) return;
  // Group by market
  const byMarket = {};
  PROSPECTS.forEach(p => {
    const m = p.market || 'Unknown';
    if (!byMarket[m]) byMarket[m] = [];
    byMarket[m].push(p);
  });
  let html = '<option value="">— Select prospect or type below —</option>';
  Object.keys(byMarket).sort().forEach(m => {
    html += `<optgroup label="${m}">`;
    byMarket[m].forEach(p => {
      html += `<option value="${p.n}">#${p.n} · ${p.domain || p.company || 'unnamed'}</option>`;
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
}

function selectProspect(n) {
  const p = PROSPECTS.find(x => String(x.n) === String(n));
  if (!p) { state.selectedProspectN = null; document.getElementById('leaksPanel').classList.add('hidden'); return; }
  state.selectedProspectN = p.n;
  document.getElementById('company').value = p.company || p.domain || '';
  document.getElementById('market').value = p.market || '';
  document.getElementById('phone').value = p.phone || '';

  const panel = document.getElementById('leaksPanel');
  const list = document.getElementById('leaksList');
  const risk = document.getElementById('leaksRisk');
  if (p.issues && p.issues.length) {
    list.innerHTML = p.issues.slice(0, 3).map(i => `<li>${i}</li>`).join('');
    risk.textContent = (p.risk || 'MED').toUpperCase();
    risk.className = 'risk-badge ' + (p.risk || 'med').toLowerCase();
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }
  renderBeats();
}

// ============== CSV UPLOAD ==============
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map((line, i) => {
    const cells = line.split(',').map(c => c.trim());
    const row = { n: 1000 + i };
    headers.forEach((h, j) => { row[h] = cells[j] || ''; });
    if (row.issues && typeof row.issues === 'string') row.issues = row.issues.split('|').map(s => s.trim());
    return row;
  });
}

// ============== BRAND + CALLER SWITCH ==============
async function switchBrand(slug) {
  state.brand = slug;
  state.selectedProspectN = null;
  saveState();
  const brand = BRANDS[slug];
  document.getElementById('logoMark').textContent = brand.short;
  document.getElementById('brandName').textContent = `${brand.name} · Call Coach`;
  document.querySelector('.brand-sub').textContent = brand.sub;
  if (brand.theme) {
    const root = document.documentElement;
    root.style.setProperty('--ink', brand.theme.ink);
    root.style.setProperty('--gold', brand.theme.gold);
    root.style.setProperty('--cream', brand.theme.cream);
    root.style.setProperty('--highlight', brand.theme.highlight);
  }
  const ok = await loadBrandData(slug);
  renderProspectPicker();
  renderBeats();
  renderObjections();
  renderStats();
  renderCallLog();
  clearForm();
}

function switchCaller(name) {
  state.caller = name;
  saveState();
  renderBeats();
}

// ============== SIDE TOGGLE (stats <-> cal) ==============
function toggleSide(which) {
  state.sidePane = which;
  saveState();
  document.getElementById('statsPane').classList.toggle('hidden', which !== 'stats');
  document.getElementById('calPane').classList.toggle('hidden', which !== 'cal');
  document.getElementById('toggleStats').classList.toggle('active', which === 'stats');
  document.getElementById('toggleCal').classList.toggle('active', which === 'cal');
}

// ============== KEYBOARD ==============
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const inField = ['input', 'textarea', 'select'].includes(tag);
    if (e.key === 'Escape') { document.getElementById('legendBar').classList.add('hidden'); return; }
    if (inField) return;
    if (e.code === 'Space') { e.preventDefault(); toggleTimer(); }
    else if (e.shiftKey && (e.key === 'R' || e.key === 'r')) { e.preventDefault(); resetTimer(); }
    else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); logCall(); }
    else if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); toggleSide(state.sidePane === 'stats' ? 'cal' : 'stats'); }
    else if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); nextProspect(); }
    else if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); prevProspect(); }
    else if (e.key === '1') { switchVariant('A'); }
    else if (e.key === '2') { switchVariant('B'); }
    else if (e.key === '3') { switchVariant('C'); }
  });
}

function nextProspect() {
  if (!PROSPECTS.length) return;
  const idx = state.selectedProspectN
    ? PROSPECTS.findIndex(p => p.n === state.selectedProspectN)
    : -1;
  const next = PROSPECTS[(idx + 1) % PROSPECTS.length];
  document.getElementById('prospectSelect').value = next.n;
  selectProspect(next.n);
}
function prevProspect() {
  if (!PROSPECTS.length) return;
  const idx = state.selectedProspectN
    ? PROSPECTS.findIndex(p => p.n === state.selectedProspectN)
    : 0;
  const prev = PROSPECTS[(idx - 1 + PROSPECTS.length) % PROSPECTS.length];
  document.getElementById('prospectSelect').value = prev.n;
  selectProspect(prev.n);
}

function switchVariant(v) {
  if (!SCRIPTS[v]) return;
  state.variant = v;
  saveState();
  document.querySelectorAll('.variant-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.v === v);
  });
  renderBeats();
}

// ============== INIT ==============
async function init() {
  loadState();

  // Populate brand dropdown
  const brandSel = document.getElementById('brandSelect');
  brandSel.innerHTML = Object.values(BRANDS).map(b =>
    `<option value="${b.slug}" ${!b.active ? 'disabled' : ''}>${b.name}${!b.active ? ' (soon)' : ''}</option>`
  ).join('');
  brandSel.value = state.brand;

  // Caller dropdown
  document.getElementById('callerSelect').value = state.caller;

  // Date
  document.getElementById('topbarDate').textContent =
    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Load brand data
  await switchBrand(state.brand);
  // Restore variant
  switchVariant(state.variant);
  // Restore side pane
  toggleSide(state.sidePane);

  // Event bindings
  brandSel.addEventListener('change', e => switchBrand(e.target.value));
  document.getElementById('callerSelect').addEventListener('change', e => switchCaller(e.target.value));
  document.querySelectorAll('.variant-tab').forEach(t => {
    t.addEventListener('click', () => switchVariant(t.dataset.v));
  });
  document.getElementById('timerStart').addEventListener('click', toggleTimer);
  document.getElementById('timerReset').addEventListener('click', resetTimer);
  document.getElementById('logCall').addEventListener('click', logCall);
  document.getElementById('clearForm').addEventListener('click', clearForm);
  document.getElementById('prospectSelect').addEventListener('change', e => selectProspect(e.target.value));
  document.getElementById('company').addEventListener('input', renderBeats);
  document.getElementById('market').addEventListener('input', renderBeats);
  document.getElementById('toggleStats').addEventListener('click', () => toggleSide('stats'));
  document.getElementById('toggleCal').addEventListener('click', () => toggleSide('cal'));
  document.getElementById('legendToggle').addEventListener('click', () => {
    document.getElementById('legendBar').classList.toggle('hidden');
  });
  document.getElementById('csvUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { alert('No rows parsed.'); return; }
    state.customProspects = state.customProspects.concat(rows);
    PROSPECTS = PROSPECTS.concat(rows);
    saveState();
    renderProspectPicker();
    alert(`Added ${rows.length} prospects.`);
  });

  bindKeyboard();
}

document.addEventListener('DOMContentLoaded', init);
