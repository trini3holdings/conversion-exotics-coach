/* Conversion Exotics — Call Coach v3.1
   Multi-brand, multi-caller, Cal embed, collapsible objections,
   auto-rotation (10 calls per variant, winner-lock), auto-scoring,
   expanded CSV schema, recon card, progress bar.
*/

// ============== CONSTANTS ==============
const STORAGE_KEY = 'ce_call_coach_v3'; // keep key — auto-migrates
const VARIANT_ROTATION_THRESHOLD = 10;  // switch every N calls
const WINNER_THRESHOLD = 10;            // calls per variant before winner check
const WINNER_LOCK_GAP = 0.15;           // 15pp ahead → lock
const DEFAULT_CPC = { cpc_low: 1.20, cpc_high: 5.00, vol: 200, primary_kw: 'exotic car rental' };

const POSITIVE_PHRASES = ['interested', 'send', 'tell me more', 'email me', 'tomorrow', 'calendar', 'audit', 'show me', 'sounds good', "let's do it", 'book', 'great idea'];
const NEGATIVE_PHRASES = ['hung up', 'not interested', 'remove', 'stop calling', 'lawsuit', 'do not call', 'never call', 'fuck off'];

// Brand registry — add more brands here
const BRANDS = {
  'conversion-exotics': {
    slug: 'conversion-exotics',
    name: 'Conversion Exotics',
    short: 'CE',
    sub: 'Cold call → free CRO audit · v3.1',
    strategist: 'Tony',
    active: true,
    theme: { ink: '#1A1A1A', gold: '#B8893A', cream: '#F4F0E8', highlight: '#FFF8E8' }
  },
  'brand-2': { slug: 'brand-2', name: 'Brand 2 (slot)', short: 'B2', sub: 'Coming soon', strategist: 'Tony', active: false, theme: null },
  'brand-3': { slug: 'brand-3', name: 'Brand 3 (slot)', short: 'B3', sub: 'Coming soon', strategist: 'Tony', active: false, theme: null },
  'brand-4': { slug: 'brand-4', name: 'Brand 4 (slot)', short: 'B4', sub: 'Coming soon', strategist: 'Tony', active: false, theme: null }
};

// Loaded per-brand at runtime
let SCRIPTS = {};
let OBJECTIONS = [];
let PROSPECTS = [];
let MARKET_CPC = {};

// ============== STATE ==============
let state = {
  brand: 'conversion-exotics',
  caller: 'Zack',
  variant: 'A',
  sidePane: 'stats',
  timer: { running: false, startedAt: 0, accumulated: 0, intervalId: null },
  calls: [],
  selectedProspectN: null,
  customProspects: [],
  lockedVariant: null,  // when winner declared, locks to that variant
  manualVariant: false  // true if user manually picked variant (override auto-rotate)
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
    if (s.lockedVariant) state.lockedVariant = s.lockedVariant;
    if (s.manualVariant) state.manualVariant = s.manualVariant;
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
      customProspects: state.customProspects,
      lockedVariant: state.lockedVariant,
      manualVariant: state.manualVariant
    }));
  } catch (e) { /* quota */ }
}

// ============== BRAND DATA LOADING ==============
async function loadBrandData(brandSlug) {
  const brand = BRANDS[brandSlug];
  if (!brand || !brand.active) {
    SCRIPTS = {}; OBJECTIONS = []; PROSPECTS = []; MARKET_CPC = {};
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

// ============== RECON CARD (audited URL — pre-call) ==============
function renderReconCard() {
  const card = document.getElementById('reconCard');
  const body = document.getElementById('reconBody');
  const riskEl = document.getElementById('reconRisk');
  const p = state.selectedProspectN ? PROSPECTS.find(x => x.n === state.selectedProspectN) : null;
  if (!p) {
    card.classList.add('empty');
    riskEl.textContent = '';
    riskEl.className = 'risk-badge';
    body.innerHTML = '<div class="recon-empty">Pick a prospect from the side panel to see their audit.</div>';
    return;
  }
  card.classList.remove('empty');
  const risk = (p.risk || 'MED').toUpperCase();
  riskEl.textContent = risk + ' RISK';
  riskEl.className = 'risk-badge ' + risk.toLowerCase();

  const domain = p.domain || '';
  const url = domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : '';
  const company = p.company || domain || `Prospect #${p.n}`;

  // Stats grid — pull any of the expanded fields if present
  const statHTML = [];
  if (p.speed !== undefined && p.speed !== '') statHTML.push(statBox('Speed', p.speed + (typeof p.speed === 'number' || /^\d+$/.test(p.speed) ? '/100' : '')));
  if (p.trust !== undefined && p.trust !== '') statHTML.push(statBox('Trust', p.trust + (typeof p.trust === 'number' || /^\d+$/.test(p.trust) ? '/100' : '')));
  if (p.cta !== undefined && p.cta !== '') statHTML.push(statBox('CTA', p.cta + (typeof p.cta === 'number' || /^\d+$/.test(p.cta) ? '/100' : '')));
  if (p.monthly_traffic) statHTML.push(statBox('Traffic / mo', p.monthly_traffic));
  if (p.ad_spend_est) statHTML.push(statBox('Est. Ad Spend', p.ad_spend_est));
  if (p.last_audit_date) statHTML.push(statBox('Audited', p.last_audit_date));

  // Leaks
  const leaks = (p.issues || []).slice(0, 5);
  const leaksHTML = leaks.length
    ? `<div class="recon-leaks-title">Audited Leaks</div><ol class="recon-leaks">${leaks.map(l => `<li>${escapeHTML(l)}</li>`).join('')}</ol>`
    : '';

  // Contact line
  const contactBits = [];
  if (p.phone) contactBits.push(`📞 ${escapeHTML(p.phone)}`);
  if (p.email) contactBits.push(`✉ ${escapeHTML(p.email)}`);
  if (p.instagram) contactBits.push(`📷 ${escapeHTML(p.instagram)}`);

  // Notes from CSV
  const notesHTML = p.notes ? `<div class="recon-notes">Note: ${escapeHTML(p.notes)}</div>` : '';

  body.innerHTML = `
    <div class="recon-title">${escapeHTML(company)} · ${escapeHTML(p.market || 'Unknown market')}</div>
    <div class="recon-meta">
      ${url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHTML(domain)} ↗</a>` : ''}
      ${contactBits.length ? ' · ' + contactBits.join(' · ') : ''}
    </div>
    ${statHTML.length ? `<div class="recon-grid">${statHTML.join('')}</div>` : ''}
    ${leaksHTML}
    ${notesHTML}
  `;
}
function statBox(label, val) {
  return `<div class="recon-stat"><div class="recon-stat-label">${escapeHTML(label)}</div><div class="recon-stat-val">${escapeHTML(String(val))}</div></div>`;
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  container.innerHTML = variant.beats.map(b => {
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
}

// ============== RENDER · OBJECTIONS (new card layout) ==============
function renderObjections() {
  const container = document.getElementById('objectionsContainer');
  if (!container) return;
  if (!OBJECTIONS.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">No objections loaded.</div>';
    return;
  }
  container.innerHTML = OBJECTIONS.map((o, i) => `
    <div class="objection-card" data-idx="${i}">
      <div class="objection-cat-bar">${o.cat}</div>
      <div class="objection-q">
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
  document.getElementById('timerHint').textContent = 'Press Ctrl+S to start';
  renderBeats();
}

// ============== AUTO-SCORING ==============
function scoreCall(call, durationSec) {
  let score = 0;
  if (['BK', 'SH', 'CL'].includes(call.outcome)) score += 30;
  if (call.outcome === 'PP') score += 10;
  if (call.outcome === 'OBJ') score += 5;
  if (durationSec >= 90) score += 15;
  else if (durationSec >= 45) score += 8;
  const notes = (call.notes || '').toLowerCase();
  POSITIVE_PHRASES.forEach(p => { if (notes.includes(p)) score += 10; });
  NEGATIVE_PHRASES.forEach(p => { if (notes.includes(p)) score -= 10; });
  // Objection category mention bonus (caller surfaced/handled the objection)
  OBJECTIONS.forEach(o => {
    if (o.cat && notes.includes(o.cat.toLowerCase())) score += 10;
  });
  return Math.max(0, Math.min(100, score));
}

function updateLiveScore() {
  const el = document.getElementById('liveScore');
  const num = document.getElementById('liveScoreNum');
  const outcome = document.getElementById('outcome').value;
  if (!outcome) { el.classList.add('hidden'); return; }
  const fake = {
    outcome,
    notes: document.getElementById('notes').value
  };
  const s = scoreCall(fake, currentElapsedSec());
  num.textContent = s;
  el.classList.remove('hidden');
}

// ============== AUTO-ROTATION ==============
function getVariantCallCounts() {
  return {
    A: state.calls.filter(c => c.variant === 'A').length,
    B: state.calls.filter(c => c.variant === 'B').length,
    C: state.calls.filter(c => c.variant === 'C').length
  };
}

/**
 * Decide what variant SHOULD be active right now.
 * Rules:
 *  - If a winner is locked → return locked variant.
 *  - If user manually picked → respect it (manualVariant=true).
 *  - Otherwise rotate A→B→C every 10 calls until each has 10.
 *  - After all 3 hit 10, check winner condition. If gap ≥15pp, lock.
 *  - If no winner yet, stay on whichever has fewest calls (round-robin).
 */
function computeAutoVariant() {
  if (state.lockedVariant) return state.lockedVariant;
  const c = getVariantCallCounts();
  const total = c.A + c.B + c.C;

  // Phase 1: still under threshold per variant → cycle every 10 calls based on total
  if (c.A < VARIANT_ROTATION_THRESHOLD || c.B < VARIANT_ROTATION_THRESHOLD || c.C < VARIANT_ROTATION_THRESHOLD) {
    // Pick the one with fewest calls (ties → alphabetical)
    const sorted = [['A', c.A], ['B', c.B], ['C', c.C]].sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0]));
    return sorted[0][0];
  }

  // Phase 2: all hit threshold → check winner
  const rates = ['A', 'B', 'C'].map(v => {
    const total = c[v];
    const booked = state.calls.filter(call => call.variant === v && ['BK', 'SH', 'CL'].includes(call.outcome)).length;
    return { v, rate: total ? booked / total : 0 };
  }).sort((a, b) => b.rate - a.rate);

  if (rates[0].rate - rates[1].rate >= WINNER_LOCK_GAP) {
    state.lockedVariant = rates[0].v;
    saveState();
    showToast(`🏆 Winner locked: Variant ${rates[0].v} (${Math.round(rates[0].rate * 100)}% book rate)`);
    return rates[0].v;
  }

  // No winner yet — keep cycling (fewest calls wins)
  const sorted = [['A', c.A], ['B', c.B], ['C', c.C]].sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0]));
  return sorted[0][0];
}

function maybeRotateVariant() {
  if (state.manualVariant) return; // user override active until manualVariant cleared
  if (state.lockedVariant) {
    if (state.variant !== state.lockedVariant) {
      state.variant = state.lockedVariant;
      saveState();
      updateVariantTabs();
      renderBeats();
    }
    return;
  }
  const want = computeAutoVariant();
  if (want !== state.variant) {
    const prev = state.variant;
    state.variant = want;
    saveState();
    updateVariantTabs();
    renderBeats();
    showToast(`Auto-rotated ${prev} → ${want}`);
  }
}

// ============== STATS ==============
function renderStats() {
  const todayKey = new Date().toDateString();
  const today = state.calls.filter(c => new Date(c.ts).toDateString() === todayKey);
  const calls = today.length;
  const booked = today.filter(c => ['BK', 'SH', 'CL'].includes(c.outcome)).length;
  const closed = today.filter(c => c.outcome === 'CL').length;
  const rate = calls ? Math.round((booked / calls) * 100) : 0;
  const avgScore = calls ? Math.round(today.reduce((s, c) => s + (c.score || 0), 0) / calls) : 0;
  const remaining = Math.max(0, PROSPECTS.length - new Set(today.map(c => c.prospectN).filter(Boolean)).size);

  document.getElementById('stat-calls').textContent = calls;
  document.getElementById('stat-booked').textContent = booked;
  document.getElementById('stat-closed').textContent = closed;
  document.getElementById('stat-bookrate').textContent = `${rate}%`;
  document.getElementById('stat-avgscore').textContent = avgScore;
  document.getElementById('stat-remaining').textContent = remaining;

  // Rotation status
  const c = getVariantCallCounts();
  let rotationTxt;
  if (state.lockedVariant) {
    rotationTxt = `🔒 ${state.lockedVariant} locked`;
  } else {
    rotationTxt = `${state.variant} · ${c[state.variant]}/${VARIANT_ROTATION_THRESHOLD}`;
  }
  document.getElementById('stat-rotation').textContent = rotationTxt;

  // Per variant
  const vStats = document.getElementById('variantStats');
  if (vStats) {
    vStats.innerHTML = ['A', 'B', 'C'].map(v => {
      const vCalls = state.calls.filter(c => c.variant === v).length;
      const vBooked = state.calls.filter(c => c.variant === v && ['BK', 'SH', 'CL'].includes(c.outcome)).length;
      const isLocked = state.lockedVariant === v;
      return `<div class="variant-stats-row ${isLocked ? 'locked' : ''}"><span class="label">${v}${isLocked ? ' 🔒' : ''}</span><span>${vCalls} calls · ${vBooked} booked</span></div>`;
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
  const aN = c.A, bN = c.B, cN = c.C;
  let bannerMsg;
  if (state.lockedVariant) {
    bannerMsg = `🔒 Winner locked: Variant ${state.lockedVariant}. Manual override still works.`;
  } else if (aN >= VARIANT_ROTATION_THRESHOLD && bN >= VARIANT_ROTATION_THRESHOLD && cN >= VARIANT_ROTATION_THRESHOLD) {
    bannerMsg = `All 3 variants at ${VARIANT_ROTATION_THRESHOLD}+ calls. Watching for winner-lock (≥15pp gap).`;
  } else {
    bannerMsg = `Auto-rotating A→B→C until each hits ${VARIANT_ROTATION_THRESHOLD}. Current: A=${aN}, B=${bN}, C=${cN}.`;
  }
  document.getElementById('samplingMsg').textContent = bannerMsg;

  // Progress bar
  renderProgressBar(today.length, PROSPECTS.length);
}

function renderProgressBar(calledToday, totalProspects) {
  const fill = document.getElementById('progressFill');
  const label = document.getElementById('progressLabel');
  const total = totalProspects || 0;
  const pct = total ? Math.min(100, Math.round((calledToday / total) * 100)) : 0;
  fill.style.width = pct + '%';
  label.textContent = total
    ? `${calledToday} of ${total} prospects called today · ${pct}% done`
    : 'Load prospects to track progress';
}

// ============== CALL LOG ==============
function renderCallLog() {
  const log = document.getElementById('callLog');
  if (!log) return;
  const recent = state.calls.slice(-12).reverse();
  if (!recent.length) {
    log.innerHTML = '<div style="color:#888;font-size:12px;padding:6px;">No calls logged yet.</div>';
    return;
  }
  log.innerHTML = recent.map(c => `
    <div class="log-row">
      <span class="log-outcome ${c.outcome.toLowerCase()}">${c.outcome}</span>
      <span style="flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(c.company || '—')}</span>
      <span class="log-score" title="Auto-score">${c.score || 0}</span>
      <span style="color:#888;">${c.variant}·${(c.caller || 'Z').slice(0, 1)}</span>
      <span class="log-time">${new Date(c.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  `).join('');
}

function logCall() {
  const outcome = document.getElementById('outcome').value;
  if (!outcome) { alert('Pick an outcome first.'); return; }
  const duration = currentElapsedSec();
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
    prospectN: state.selectedProspectN,
    duration
  };
  call.score = scoreCall(call, duration);
  state.calls.push(call);
  // Clear manual override so auto-rotation resumes
  state.manualVariant = false;
  saveState();
  renderStats();
  renderCallLog();
  // Auto-reset, then rotate variant
  setTimeout(() => {
    clearForm();
    resetTimer();
    maybeRotateVariant();
  }, 1000);
}

function clearForm() {
  document.getElementById('prospectSelect').value = '';
  document.getElementById('company').value = '';
  document.getElementById('market').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('outcome').value = '';
  document.getElementById('notes').value = '';
  document.getElementById('liveScore').classList.add('hidden');
  state.selectedProspectN = null;
  renderReconCard();
  renderBeats();
}

// ============== PROSPECT PICKER ==============
function renderProspectPicker() {
  const sel = document.getElementById('prospectSelect');
  if (!sel) return;
  const byMarket = {};
  PROSPECTS.forEach(p => {
    const m = p.market || 'Unknown';
    if (!byMarket[m]) byMarket[m] = [];
    byMarket[m].push(p);
  });
  let html = '<option value="">— Select prospect or type below —</option>';
  Object.keys(byMarket).sort().forEach(m => {
    html += `<optgroup label="${escapeHTML(m)}">`;
    byMarket[m].forEach(p => {
      html += `<option value="${p.n}">#${p.n} · ${escapeHTML(p.domain || p.company || 'unnamed')}</option>`;
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
}

function selectProspect(n) {
  const p = PROSPECTS.find(x => String(x.n) === String(n));
  if (!p) {
    state.selectedProspectN = null;
    renderReconCard();
    return;
  }
  state.selectedProspectN = p.n;
  document.getElementById('company').value = p.company || p.domain || '';
  document.getElementById('market').value = p.market || '';
  document.getElementById('phone').value = p.phone || '';
  renderReconCard();
  renderBeats();
}

// ============== CSV UPLOAD — expanded schema ==============
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line, i) => {
    // Handle quoted commas
    const cells = splitCSVLine(line);
    const row = { n: 1000 + i };
    headers.forEach((h, j) => { row[h] = (cells[j] || '').trim(); });
    // Normalize known columns
    if (row.issues && typeof row.issues === 'string') {
      row.issues = row.issues.split('|').map(s => s.trim()).filter(Boolean);
    }
    // Coerce numeric scores if present
    ['speed', 'trust', 'cta', 'speed_score', 'trust_score', 'cta_score'].forEach(k => {
      if (row[k] && !isNaN(Number(row[k]))) row[k] = Number(row[k]);
    });
    // Map alt header names
    if (row.speed_score !== undefined) row.speed = row.speed_score;
    if (row.trust_score !== undefined) row.trust = row.trust_score;
    if (row.cta_score !== undefined) row.cta = row.cta_score;
    return row;
  });
}
function splitCSVLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
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
  await loadBrandData(slug);
  renderProspectPicker();
  renderReconCard();
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

// ============== TOAST ==============
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4000);
}

// ============== KEYBOARD ==============
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const inField = ['input', 'textarea', 'select'].includes(tag);
    if (e.key === 'Escape') { document.getElementById('legendBar').classList.add('hidden'); return; }
    // Ctrl+S — start/pause timer (works even inside fields)
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      toggleTimer();
      return;
    }
    if (inField) return;
    if (e.shiftKey && (e.key === 'R' || e.key === 'r')) { e.preventDefault(); resetTimer(); }
    else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); logCall(); }
    else if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); toggleSide(state.sidePane === 'stats' ? 'cal' : 'stats'); }
    else if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); nextProspect(); }
    else if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); prevProspect(); }
    else if (e.key === '1') { manualSwitchVariant('A'); }
    else if (e.key === '2') { manualSwitchVariant('B'); }
    else if (e.key === '3') { manualSwitchVariant('C'); }
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

function updateVariantTabs() {
  document.querySelectorAll('.variant-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.v === state.variant);
  });
}

// Manual switch — sets manualVariant flag so auto-rotation pauses until next log
function manualSwitchVariant(v) {
  if (!SCRIPTS[v]) return;
  state.variant = v;
  state.manualVariant = true;
  saveState();
  updateVariantTabs();
  renderBeats();
}

// Used during init to restore without flagging manual override
function switchVariantSilent(v) {
  if (!SCRIPTS[v]) return;
  state.variant = v;
  updateVariantTabs();
  renderBeats();
}

// ============== INIT ==============
async function init() {
  loadState();

  const brandSel = document.getElementById('brandSelect');
  brandSel.innerHTML = Object.values(BRANDS).map(b =>
    `<option value="${b.slug}" ${!b.active ? 'disabled' : ''}>${b.name}${!b.active ? ' (soon)' : ''}</option>`
  ).join('');
  brandSel.value = state.brand;

  document.getElementById('callerSelect').value = state.caller;

  document.getElementById('topbarDate').textContent =
    new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  await switchBrand(state.brand);

  // On init, run rotation logic to settle on correct variant
  if (!state.manualVariant && !state.lockedVariant) {
    const want = computeAutoVariant();
    state.variant = want;
    saveState();
  }
  switchVariantSilent(state.variant);
  toggleSide(state.sidePane);

  // Event bindings
  brandSel.addEventListener('change', e => switchBrand(e.target.value));
  document.getElementById('callerSelect').addEventListener('change', e => switchCaller(e.target.value));
  document.querySelectorAll('.variant-tab').forEach(t => {
    t.addEventListener('click', () => manualSwitchVariant(t.dataset.v));
  });
  document.getElementById('timerStart').addEventListener('click', toggleTimer);
  document.getElementById('timerReset').addEventListener('click', resetTimer);
  document.getElementById('logCall').addEventListener('click', logCall);
  document.getElementById('clearForm').addEventListener('click', clearForm);
  document.getElementById('prospectSelect').addEventListener('change', e => selectProspect(e.target.value));
  document.getElementById('company').addEventListener('input', renderBeats);
  document.getElementById('market').addEventListener('input', renderBeats);
  document.getElementById('outcome').addEventListener('change', updateLiveScore);
  document.getElementById('notes').addEventListener('input', updateLiveScore);
  document.getElementById('toggleStats').addEventListener('click', () => toggleSide('stats'));
  document.getElementById('toggleCal').addEventListener('click', () => toggleSide('cal'));
  document.getElementById('legendToggle').addEventListener('click', () => {
    document.getElementById('legendBar').classList.toggle('hidden');
  });
  document.getElementById('progressBar').addEventListener('click', () => {
    document.getElementById('prospectSelect').focus();
    document.getElementById('prospectSelect').click();
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
    renderStats();
    showToast(`Added ${rows.length} prospects from CSV`);
  });

  bindKeyboard();
}

document.addEventListener('DOMContentLoaded', init);
