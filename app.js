/* Conversion Exotics — Call Coach v3.2
   v3.2 adds: Google Apps Script backend (Sheets + Gmail), sync queue,
   structured notes, follow-up scheduling, inline add-prospect modal,
   per-brand master sheet, cloud-prospect merge.
*/

// ============== CONSTANTS ==============
const STORAGE_KEY = 'ce_call_coach_v3'; // keep key — auto-migrates
const VARIANT_ROTATION_THRESHOLD = 10;  // switch every N calls
const WINNER_THRESHOLD = 10;            // calls per variant before winner check
const WINNER_LOCK_GAP = 0.15;           // 15pp ahead → lock
const DEFAULT_CPC = { cpc_low: 1.20, cpc_high: 5.00, vol: 200, primary_kw: 'exotic car rental' };
const SYNC_RETRY_MS = 30000;            // retry drain every 30s

const POSITIVE_PHRASES = ['interested', 'send', 'tell me more', 'email me', 'tomorrow', 'calendar', 'audit', 'show me', 'sounds good', "let's do it", 'book', 'great idea'];
const NEGATIVE_PHRASES = ['hung up', 'not interested', 'remove', 'stop calling', 'lawsuit', 'do not call', 'never call', 'fuck off'];

// Brand registry — add more brands here
const BRANDS = {
  'conversion-exotics': {
    slug: 'conversion-exotics',
    name: 'Conversion Exotics',
    short: 'CE',
    sub: 'Cold call → free Website Conversion Audit · v3.2',
    strategist: 'Tony',
    caller_default: 'Zack',
    active: true,
    theme: { ink: '#1A1A1A', gold: '#B8893A', cream: '#F4F0E8', highlight: '#FFF8E8' }
  },
  'conversionjet': {
    slug: 'conversionjet',
    name: 'ConversionJet',
    short: 'CJ',
    sub: 'Cold call → free Charter Page Conversion Audit · HNW aviation · v3.2',
    strategist: 'Tony',
    caller_default: 'Tony',
    active: true,
    theme: { ink: '#0B1426', gold: '#C5A572', cream: '#F5F2EC', highlight: '#FAF6EE' }
  },
  'critterclick': {
    slug: 'critterclick',
    name: 'CritterClick',
    short: 'CC',
    sub: 'Cold call → free Wildlife Site Conversion Audit · v3.3',
    strategist: 'Tony',
    caller_default: 'Zack',
    active: true,
    theme: { ink: '#1B3A2E', gold: '#D4A04C', cream: '#F4EFE5', highlight: '#FBF6E8' }
  },
  'rme-roofing': {
    slug: 'rme-roofing',
    name: 'RME Roofing',
    short: 'RME',
    sub: 'Cold call → free Roofing Site Conversion Audit · v3.3',
    strategist: 'Tony',
    caller_default: 'Zack',
    active: true,
    theme: { ink: '#2C3E50', gold: '#C84B31', cream: '#F2EDE6', highlight: '#FBF4EC' }
  }
};
// Expose for dashboard.js
window.BRANDS = BRANDS;

// Loaded per-brand at runtime
let SCRIPTS = {};
let OBJECTIONS = [];
let PROSPECTS = [];
let MARKET_CPC = {};
let CSV_SCHEMA = null;       // per-brand column-mapping rules

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
  cloudProspects: [],         // pulled from Apps Script backend
  lockedVariant: null,
  manualVariant: false,
  // v3.2 backend
  backendUrl: '',
  syncQueue: [],
  lastSyncTs: 0,
  sheetUrlByBrand: {},        // brand → master sheet URL
  // v3.3 UX
  saidBeats: {},              // {variantKey: [beatIdx,...]} per-call tracking
  reconCardCollapsed: false,  // v3.7 sticky recon card collapse state
  lastActiveBeatIdx: -1,
  // v3.6 validation
  brandValidation: { ok: true, errors: [], warnings: [] }
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
    if (s.backendUrl) state.backendUrl = s.backendUrl;
    if (s.syncQueue && Array.isArray(s.syncQueue)) state.syncQueue = s.syncQueue;
    if (s.lastSyncTs) state.lastSyncTs = s.lastSyncTs;
    if (s.sheetUrlByBrand) state.sheetUrlByBrand = s.sheetUrlByBrand;
    if (s.cloudProspects && Array.isArray(s.cloudProspects)) state.cloudProspects = s.cloudProspects;
    if (s.saidBeats && typeof s.saidBeats === 'object') state.saidBeats = s.saidBeats;
    if (typeof s.reconCardCollapsed === 'boolean') state.reconCardCollapsed = s.reconCardCollapsed;
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
      cloudProspects: state.cloudProspects,
      lockedVariant: state.lockedVariant,
      manualVariant: state.manualVariant,
      backendUrl: state.backendUrl,
      syncQueue: state.syncQueue,
      lastSyncTs: state.lastSyncTs,
      sheetUrlByBrand: state.sheetUrlByBrand,
      saidBeats: state.saidBeats,
      reconCardCollapsed: state.reconCardCollapsed
    }));
  } catch (e) { /* quota */ }
}

// ============== BACKEND (Google Apps Script Web App) ==============
async function backendCall(payload) {
  if (!state.backendUrl) throw new Error('No backend URL configured');
  // Apps Script web apps don't return CORS headers when sent with custom headers,
  // so we use text/plain to keep it as a simple request.
  const res = await fetch(state.backendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Backend error');
  return data;
}

function setSyncBadge(status) {
  // status: 'offline' | 'online' | 'syncing' | 'error' | 'queued'
  const el = document.getElementById('syncBadge');
  if (!el) return;
  el.className = 'sync-badge ' + status;
  const label = {
    offline: '● No sheet linked',
    online: '● Sheet synced',
    syncing: '● Syncing…',
    error: '● Sync error',
    queued: `● ${state.syncQueue.length} queued`
  }[status] || ('● ' + status);
  el.textContent = label;
  const qc = document.getElementById('queueCount');
  if (qc) qc.textContent = state.syncQueue.length;
}

async function pingBackend(silent) {
  if (!state.backendUrl) { setSyncBadge('offline'); return false; }
  try {
    const r = await backendCall({ action: 'ping' });
    if (!silent) showToast(`Backend connected · v${r.version || '?'}`);
    setSyncBadge(state.syncQueue.length ? 'queued' : 'online');
    return true;
  } catch (e) {
    setSyncBadge('error');
    if (!silent) showToast(`Backend ping failed: ${e.message}`);
    return false;
  }
}

async function enqueueCallSync(call) {
  state.syncQueue.push({ kind: 'logCall', brand: state.brand, call, queuedAt: Date.now() });
  saveState();
  setSyncBadge('queued');
  drainSyncQueue();
}

async function drainSyncQueue() {
  if (!state.backendUrl || !state.syncQueue.length) return;
  setSyncBadge('syncing');
  const queue = state.syncQueue.slice();
  const remaining = [];
  let successCount = 0;
  for (const job of queue) {
    try {
      if (job.kind === 'logCall') {
        const r = await backendCall({ action: 'logCall', brand: job.brand, call: job.call });
        if (r.sheetUrl) state.sheetUrlByBrand[job.brand] = r.sheetUrl;
        successCount++;
      }
    } catch (e) {
      console.warn('Sync job failed, will retry:', e);
      remaining.push(job);
    }
  }
  state.syncQueue = remaining;
  state.lastSyncTs = Date.now();
  saveState();
  if (remaining.length) {
    setSyncBadge('error');
    setTimeout(drainSyncQueue, SYNC_RETRY_MS);
  } else {
    setSyncBadge('online');
    if (successCount > 0) showToast(`Synced ${successCount} call${successCount > 1 ? 's' : ''} to Sheets`);
  }
}

async function loadCloudProspects() {
  if (!state.backendUrl) return;
  try {
    const r = await backendCall({ action: 'listProspects', brand: state.brand });
    if (r.prospects && Array.isArray(r.prospects)) {
      state.cloudProspects = r.prospects;
      if (r.sheetUrl) state.sheetUrlByBrand[state.brand] = r.sheetUrl;
      saveState();
      // Merge into PROSPECTS for picker
      mergeProspects();
      renderProspectPicker();
    }
  } catch (e) {
    console.warn('listProspects failed:', e);
  }
}

function mergeProspects() {
  // Combines base JSON prospects + customProspects + cloudProspects, dedup by domain
  const merged = [];
  const seen = new Set();
  const all = PROSPECTS_BASE.concat(state.customProspects || [], state.cloudProspects || []);
  all.forEach(p => {
    const key = (p.domain || p.company || ('id-' + p.n)).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(p);
  });
  PROSPECTS = merged;
}

// Holds the base (JSON file) prospects so merge can rebuild cleanly
let PROSPECTS_BASE = [];

// ============== BRAND DATA LOADING ==============
async function loadBrandData(brandSlug) {
  const brand = BRANDS[brandSlug];
  if (!brand || !brand.active) {
    SCRIPTS = {}; OBJECTIONS = []; PROSPECTS = []; PROSPECTS_BASE = []; MARKET_CPC = {};
    state.brandValidation = { ok: true, errors: [], warnings: [] };
    return false;
  }
  const base = `brands/${brandSlug}`;
  const safeFetch = (file, fallback) => fetch(`${base}/${file}`)
    .then(r => r.ok ? r.json() : fallback)
    .catch(() => fallback);
  try {
    const [scriptsRaw, objRaw, prospRaw, cpcRaw, schemaRes] = await Promise.all([
      safeFetch('scripts.json', {}),
      safeFetch('objections.json', {}),
      safeFetch('prospects.json', []),
      safeFetch('market_cpc.json', {}),
      fetch(`${base}/csv_schema.json`).catch(() => null)
    ]);
    try { CSV_SCHEMA = schemaRes && schemaRes.ok ? await schemaRes.json() : null; }
    catch (e) { CSV_SCHEMA = null; }

    // v3.6 — delegate ALL shape normalization to the validators module.
    if (!window.CCValidators || typeof window.CCValidators.validateBrandBundle !== 'function') {
      console.error('[app] validators.js missing — cannot load brand', brandSlug);
      state.brandValidation = {
        ok: false,
        errors: ['validators.js failed to load — brand data cannot be normalized'],
        warnings: []
      };
      SCRIPTS = { _meta: { target_length_sec: 220, audit_value: 0 } };
      OBJECTIONS = []; PROSPECTS_BASE = []; MARKET_CPC = {};
      if (typeof renderBrandErrorBanner === 'function') renderBrandErrorBanner();
      return false;
    }
    const result = window.CCValidators.validateBrandBundle(brandSlug, {
      prospects: prospRaw,
      scripts: scriptsRaw,
      objections: objRaw,
      callIntel: null,
      marketCpc: cpcRaw,
      hotList: null
    });
    if (result.errors && result.errors.length) {
      console.warn('[app] ' + brandSlug + ' validation errors:', result.errors);
    }
    if (result.warnings && result.warnings.length) {
      console.info('[app] ' + brandSlug + ' validation warnings:', result.warnings);
    }
    PROSPECTS_BASE = (result.value && result.value.prospects) || [];
    SCRIPTS = (result.value && result.value.scripts) || { _meta: { target_length_sec: 220, audit_value: 0 } };
    OBJECTIONS = (result.value && result.value.objections) || [];
    MARKET_CPC = (result.value && result.value.marketCpc) || {};
    state.brandValidation = {
      ok: result.ok,
      errors: result.errors || [],
      warnings: result.warnings || []
    };
    mergeProspects();
    if (typeof renderBrandErrorBanner === 'function') renderBrandErrorBanner();
    return true;
  } catch (e) {
    console.error('Brand data load failed:', e);
    state.brandValidation = {
      ok: false,
      errors: ['Load threw: ' + (e.message || String(e))],
      warnings: []
    };
    if (typeof renderBrandErrorBanner === 'function') renderBrandErrorBanner();
    return false;
  }
}

// ============== BRAND ERROR BANNER (v3.6) ==============
function renderBrandErrorBanner() {
  const banner = document.getElementById('brandErrorBanner');
  if (!banner) return;
  const v = state.brandValidation;
  if (!v || v.ok) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }
  const errs = (v.errors || []).map(e => '<li>' + escapeHtml(e) + '</li>').join('');
  const warns = (v.warnings || []).map(w => '<li>' + escapeHtml(w) + '</li>').join('');
  banner.classList.remove('hidden');
  banner.innerHTML =
    '<div class="brand-error-banner-title">⚠️ Brand data validation failed</div>' +
    (errs ? '<ul class="brand-error-banner-list">' + errs + '</ul>' : '') +
    (warns ? '<div class="brand-error-banner-title" style="margin-top:8px;color:#a60;">Warnings</div><ul class="brand-error-banner-list" style="color:#840;">' + warns + '</ul>' : '') +
    '<div style="font-size:12px;color:#666;margin-top:8px;font-style:italic;">Some script beats, objections, or prospects may not display correctly. Check console for details.</div>';
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

// ============== RECON CARD ==============
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

  const statHTML = [];
  if (p.speed !== undefined && p.speed !== '') statHTML.push(statBox('Speed', p.speed + (typeof p.speed === 'number' || /^\d+$/.test(p.speed) ? '/100' : '')));
  if (p.trust !== undefined && p.trust !== '') statHTML.push(statBox('Trust', p.trust + (typeof p.trust === 'number' || /^\d+$/.test(p.trust) ? '/100' : '')));
  if (p.cta !== undefined && p.cta !== '') statHTML.push(statBox('Action button', p.cta + (typeof p.cta === 'number' || /^\d+$/.test(p.cta) ? '/100' : '')));
  if (p.monthly_traffic) statHTML.push(statBox('Traffic / mo', p.monthly_traffic));
  if (p.ad_spend_est) statHTML.push(statBox('Est. Ad Spend', p.ad_spend_est));
  if (p.last_called_date) statHTML.push(statBox('Last Called', p.last_called_date));
  if (p.last_audit_date) statHTML.push(statBox('Audited', p.last_audit_date));

  const leaks = (p.issues || []).slice(0, 5);
  const leaksHTML = leaks.length
    ? `<div class="recon-leaks-title">Audited Leaks</div><ol class="recon-leaks">${leaks.map(l => `<li>${expEscape(l)}</li>`).join('')}</ol>`
    : '';

  const contactBits = [];
  if (p.phone) contactBits.push(`📞 ${escapeHTML(p.phone)}`);
  if (p.email) contactBits.push(`✉ ${escapeHTML(p.email)}`);
  if (p.instagram) contactBits.push(`📷 ${escapeHTML(p.instagram)}`);

  const notesHTML = p.notes ? `<div class="recon-notes">Note: ${expEscape(p.notes)}</div>` : '';

  // History: prior calls for this prospect
  const priorCalls = state.calls.filter(c => c.prospectN === p.n).slice(-3).reverse();
  const historyHTML = priorCalls.length
    ? `<div class="recon-history">
         <div class="recon-leaks-title">Recent Touches</div>
         ${priorCalls.map(c => `<div class="recon-history-row">
            <span class="log-outcome ${c.outcome.toLowerCase()}">${c.outcome}</span>
            <span>${new Date(c.ts).toLocaleDateString()} · ${c.caller || '?'} · ${c.variant}</span>
            ${c.nextStep ? `<span class="recon-history-next">→ ${escapeHTML(c.nextStep)}</span>` : ''}
         </div>`).join('')}
       </div>`
    : '';

  body.innerHTML = `
    <div class="recon-title">${expEscape(company)} · ${expEscape(p.market || 'Unknown market')}</div>
    <div class="recon-meta">
      ${url ? `<a href="${url}" target="_blank" rel="noopener">${escapeHTML(domain)} ↗</a>` : ''}
      ${contactBits.length ? ' · ' + contactBits.join(' · ') : ''}
    </div>
    ${statHTML.length ? `<div class="recon-grid">${statHTML.join('')}</div>` : ''}
    ${leaksHTML}
    ${notesHTML}
    ${historyHTML}
  `;
}
function statBox(label, val) {
  return `<div class="recon-stat"><div class="recon-stat-label">${escapeHTML(label)}</div><div class="recon-stat-val">${escapeHTML(String(val))}</div></div>`;
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// v3.7 — Acronym expansion helpers (resolve at call time so we tolerate load order).
function expandAcr(text) {
  if (!text) return text;
  if (window.CCAcronyms && typeof window.CCAcronyms.expandAcronyms === 'function') {
    return window.CCAcronyms.expandAcronyms(text);
  }
  return text;
}
function expandLabel(text) {
  if (!text) return text;
  if (window.CCAcronyms && typeof window.CCAcronyms.expandLabel === 'function') {
    return window.CCAcronyms.expandLabel(text);
  }
  return text;
}
// Convenience: expand acronyms in plain text, then HTML-escape. Use anywhere
// you'd previously have done `escapeHTML(text)` on user-facing prose.
function expEscape(text) {
  return escapeHTML(expandAcr(text == null ? '' : String(text)));
}

// ============== RENDER · BEATS ==============
function renderBeats() {
  const container = document.getElementById('beatsContainer');
  if (!container) return;
  const variant = SCRIPTS[state.variant];
  if (!variant) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">No script loaded for this brand yet.</div>';
    updateBeatsProgress(0, 0);
    return;
  }
  const ctx = getProspectContext();
  const elapsed = currentElapsedSec();
  const variantKey = state.variant;
  const said = state.saidBeats[variantKey] || [];
  let cumulative = 0;
  let activeIdx = -1;
  const beats = variant.beats;
  container.innerHTML = beats.map((b, i) => {
    const start = cumulative;
    cumulative += b.t;
    const isActive = elapsed >= start && elapsed < cumulative;
    if (isActive) activeIdx = i;
    const isSaid = said.includes(i);
    const respHtml = (b.responses || []).map(r => `<span class="resp">"${expandAcr(r)}"</span>`).join(' / ');
    const next = beats[i + 1];
    const nextPreview = next ? `<div class="beat-next-preview"><strong>Next:</strong> ${expEscape(next.title)} (${next.t}s)</div>` : '';
    return `
      <div class="beat ${isActive ? 'active' : ''} ${isSaid ? 'said-beat' : ''}" data-beat-idx="${i}">
        <div class="beat-checkbox ${isSaid ? 'said' : ''}" data-toggle-said="${i}" title="Mark this beat as said"></div>
        <div class="beat-head">
          <span class="beat-phase">${b.phase || ''}</span>
          <span class="beat-time">@ ${start}s · ${b.t}s</span>
        </div>
        <div class="beat-title">${expandAcr(b.title || '')}</div>
        <div class="beat-line"><span class="speaker-you">YOU (${state.caller}):</span> "${expandAcr(fillTokens(b.line, ctx))}"</div>
        ${b.responses && b.responses.length ? `<div class="beat-responses"><span class="speaker-prospect">↳ PROSPECT likely:</span> ${respHtml}</div>` : ''}
        ${b.followup ? `<div class="beat-followup"><span class="speaker-you-recover">YOU (if they push back):</span> <em>"${expandAcr(fillTokens(b.followup, ctx))}"</em></div>` : ''}
        ${b.note ? `<div class="beat-note"><span class="speaker-coach">🎯 COACH:</span> ${expandAcr(fillTokens(b.note, ctx))}</div>` : ''}
        ${nextPreview}
      </div>
    `;
  }).join('');
  // Wire checkmarks
  container.querySelectorAll('[data-toggle-said]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(el.getAttribute('data-toggle-said'), 10);
      toggleBeatSaid(state.variant, idx);
    });
  });
  updateBeatsProgress(said.length, beats.length);
  // Auto-scroll active beat into view when it changes
  if (activeIdx >= 0 && activeIdx !== state.lastActiveBeatIdx) {
    state.lastActiveBeatIdx = activeIdx;
    const activeEl = container.querySelector(`[data-beat-idx="${activeIdx}"]`);
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // v3.4.1 — also auto-follow the objection card for this phase
    autoFollowObjection(beats[activeIdx]);
  }
  // Update phase chip on big timer
  if (activeIdx >= 0) {
    const ph = beats[activeIdx];
    const el = document.getElementById('btPhase');
    if (el) el.textContent = `${ph.phase || 'BEAT'} · ${ph.title}`;
  }
}

function toggleBeatSaid(variantKey, idx) {
  if (!state.saidBeats[variantKey]) state.saidBeats[variantKey] = [];
  const arr = state.saidBeats[variantKey];
  const pos = arr.indexOf(idx);
  if (pos === -1) arr.push(idx); else arr.splice(pos, 1);
  saveState();
  renderBeats();
}

function updateBeatsProgress(said, total) {
  const el = document.getElementById('beatsProgress');
  if (el) el.textContent = total ? `${said} of ${total} beats said` : '';
}

function resetSaidBeats() {
  state.saidBeats = {};
  saveState();
}

// ============== STICKY RECON CARD COLLAPSE TOGGLE (v3.7) ==============
function toggleReconCardCollapse() {
  const card = document.getElementById('reconCard');
  if (!card) return;
  card.classList.toggle('collapsed');
  state.reconCardCollapsed = card.classList.contains('collapsed');
  const btn = document.getElementById('reconCollapseBtn');
  if (btn) btn.textContent = state.reconCardCollapsed ? '+' : '−';
  saveState();
}

// ============== AUTO-FOLLOW OBJECTION CARD (v3.4.1) ==============
// Map each script phase to the objection category most likely to surface in that beat.
// Falls back through a per-brand chain so every brand's category names work.
const PHASE_TO_OBJECTION = {
  // First category in each list that actually exists in OBJECTIONS wins.
  // Built around the real cats used across all 4 brands:
  // NOT_INTERESTED | REBUILT | EMAIL_INSTEAD | PRICE | PARTNER | BROKERS | ADS_WORK | AGENCY
  'OPEN':        ['NOT_INTERESTED', 'EMAIL_INSTEAD', 'AGENCY'],
  'PROBLEM':     ['REBUILT', 'NOT_INTERESTED', 'ADS_WORK'],
  'AGITATION':   ['REBUILT', 'ADS_WORK', 'AGENCY'],
  'SOLUTION':    ['PRICE', 'AGENCY', 'BROKERS'],
  'AUDIT OFFER': ['PRICE', 'EMAIL_INSTEAD', 'PARTNER'],
  'CLOSE':       ['EMAIL_INSTEAD', 'PARTNER', 'PRICE']
};

function autoFollowObjection(beat) {
  if (!beat || !OBJECTIONS.length) return;

  // Mark the most-likely comeback button so the caller's eye lands there,
  // but DO NOT auto-pop the comeback over the screen — user pops it manually.
  let targetCat = beat.objection_likely || beat.expected_objection || null;
  if (!targetCat && beat.phase) {
    const cands = PHASE_TO_OBJECTION[String(beat.phase).toUpperCase()] || [];
    const available = new Set(OBJECTIONS.map(o => o.cat));
    targetCat = cands.find(c => available.has(c)) || null;
  }
  if (!targetCat) return;

  document.querySelectorAll('.qo-hotkey').forEach(b => {
    b.classList.toggle('likely', b.getAttribute('data-cat') === targetCat);
  });
}

// ============== QUICK-COMEBACK BAR (v3.5 — inline pop-up; no scroll) ==============
// The bar at bottom now expands UPWARD with the comeback text in place.
// Removed: middle objections column + objection-cards render.
// Still populates the "Objection raised" dropdown in the call form.
function renderQuickObjectionBar() {
  const bar = document.getElementById('quickObjInner');
  if (!bar) return;
  if (!OBJECTIONS.length) { bar.innerHTML = ''; return; }
  const cats = [...new Set(OBJECTIONS.map(o => o.cat))];
  bar.innerHTML =
    `<span class="qo-hotkey-label">QUICK COMEBACK →</span>` +
    cats.map(c => `<button type="button" class="qo-hotkey" data-cat="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('') +
    `<button type="button" class="qo-close hidden" id="qoClose" title="Close comeback">✕</button>`;
  bar.querySelectorAll('[data-cat]').forEach(b => {
    b.addEventListener('click', () => openObjection(b.getAttribute('data-cat')));
  });
  const closeBtn = document.getElementById('qoClose');
  if (closeBtn) closeBtn.addEventListener('click', closeComebackPop);
}

function openObjection(cat) {
  // Pause timer so you can read calmly
  if (state.timer.running) pauseTimer();
  const obj = OBJECTIONS.find(o => o.cat === cat);
  if (!obj) return;

  // Render the comeback popover above the bar
  const pop = document.getElementById('qoPop');
  if (pop) {
    pop.innerHTML = `
      <div class="qo-pop-head">
        <div class="qo-pop-cat">${escapeHTML(obj.cat)}</div>
        <div class="qo-pop-q">${expandAcr(obj.q || '')}</div>
      </div>
      <div class="qo-pop-a">${expandAcr(obj.a || '')}</div>
    `;
    pop.classList.remove('hidden');
  }
  // Highlight the active comeback button
  document.querySelectorAll('.qo-hotkey').forEach(b => b.classList.toggle('active', b.getAttribute('data-cat') === cat));
  const closeBtn = document.getElementById('qoClose');
  if (closeBtn) closeBtn.classList.remove('hidden');
  // Auto-set the objection-raised dropdown for the call log
  const sel = document.getElementById('objectionRaised');
  if (sel) sel.value = cat;
}

function closeComebackPop() {
  const pop = document.getElementById('qoPop');
  if (pop) pop.classList.add('hidden');
  document.querySelectorAll('.qo-hotkey.active').forEach(b => b.classList.remove('active'));
  const closeBtn = document.getElementById('qoClose');
  if (closeBtn) closeBtn.classList.add('hidden');
}

// ============== RENDER · OBJECTIONS (v3.5 — dropdown only) ==============
// Middle objections column is gone. We only repopulate the
// "Objection raised" <select> in the call form for tagging.
function renderObjections() {
  const sel = document.getElementById('objectionRaised');
  if (sel && OBJECTIONS.length) {
    const cats = [...new Set(OBJECTIONS.map(o => o.cat))];
    sel.innerHTML = '<option value="">— None / unclear —</option>' +
      cats.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
  }
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
  const sec = currentElapsedSec();
  const el = document.getElementById('timerDisplay');
  if (el) el.textContent = fmtTime(sec);
  // Big timer banner
  const btE = document.getElementById('btElapsed');
  if (btE) btE.textContent = fmtTime(sec);
  const variant = SCRIPTS[state.variant];
  const target = (SCRIPTS && variant) ? scriptTargetLength() : 0;
  const btT = document.getElementById('btTarget');
  if (btT) btT.textContent = fmtTime(target);
  const fill = document.getElementById('btBarFill');
  if (fill && target > 0) {
    const pct = Math.min(100, Math.round((sec / target) * 100));
    fill.style.width = pct + '%';
    fill.classList.toggle('over', sec > target);
  }
  renderBeats();
}
function scriptTargetLength() {
  // Sum beat times, fallback to scripts file's target_length_sec, fallback 220
  const variant = SCRIPTS[state.variant];
  if (variant && variant.beats) {
    const total = variant.beats.reduce((s, b) => s + (b.t || 0), 0);
    if (total) return total;
  }
  if (SCRIPTS && SCRIPTS._meta && SCRIPTS._meta.target_length_sec) return SCRIPTS._meta.target_length_sec;
  return 220;
}
function startTimer() {
  if (state.timer.running) return;
  state.timer.startedAt = Date.now();
  state.timer.running = true;
  state.timer.intervalId = setInterval(tickTimer, 1000);
  document.getElementById('timerStart').textContent = 'Pause';
  document.getElementById('timerHint').textContent = 'Recording…';
  const btS = document.getElementById('btStart'); if (btS) btS.textContent = '⎉ Pause';
  tickTimer();
}
function pauseTimer() {
  if (!state.timer.running) return;
  state.timer.accumulated += Math.floor((Date.now() - state.timer.startedAt) / 1000);
  state.timer.running = false;
  clearInterval(state.timer.intervalId);
  document.getElementById('timerStart').textContent = 'Resume';
  document.getElementById('timerHint').textContent = 'Paused';
  const btS = document.getElementById('btStart'); if (btS) btS.textContent = '▶ Resume';
}
function toggleTimer() { state.timer.running ? pauseTimer() : startTimer(); }
function resetTimer() {
  pauseTimer();
  state.timer.accumulated = 0;
  state.timer.startedAt = 0;
  state.lastActiveBeatIdx = -1;
  resetSaidBeats();
  document.getElementById('timerDisplay').textContent = '00:00';
  document.getElementById('timerStart').textContent = 'Start';
  document.getElementById('timerHint').textContent = 'Press Ctrl+S to start';
  const btE = document.getElementById('btElapsed'); if (btE) btE.textContent = '00:00';
  const btS = document.getElementById('btStart'); if (btS) btS.textContent = '▶ Start';
  const fill = document.getElementById('btBarFill'); if (fill) { fill.style.width = '0%'; fill.classList.remove('over'); }
  const phEl = document.getElementById('btPhase'); if (phEl) phEl.textContent = 'Press Start · Ctrl+S';
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
  if (call.whatWorked) score += 5;
  if (call.nextStep) score += 5;
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
    notes: document.getElementById('notes').value,
    whatWorked: document.getElementById('whatWorked').value,
    nextStep: document.getElementById('nextStep').value
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

function computeAutoVariant() {
  if (state.lockedVariant) return state.lockedVariant;
  const c = getVariantCallCounts();
  if (c.A < VARIANT_ROTATION_THRESHOLD || c.B < VARIANT_ROTATION_THRESHOLD || c.C < VARIANT_ROTATION_THRESHOLD) {
    const sorted = [['A', c.A], ['B', c.B], ['C', c.C]].sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0]));
    return sorted[0][0];
  }
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
  const sorted = [['A', c.A], ['B', c.B], ['C', c.C]].sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0]));
  return sorted[0][0];
}

function maybeRotateVariant() {
  if (state.manualVariant) return;
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

  const c = getVariantCallCounts();
  let rotationTxt;
  if (state.lockedVariant) {
    rotationTxt = `🔒 ${state.lockedVariant} locked`;
  } else {
    rotationTxt = `${state.variant} · ${c[state.variant]}/${VARIANT_ROTATION_THRESHOLD}`;
  }
  document.getElementById('stat-rotation').textContent = rotationTxt;

  const vStats = document.getElementById('variantStats');
  if (vStats) {
    vStats.innerHTML = ['A', 'B', 'C'].map(v => {
      const vCalls = state.calls.filter(c => c.variant === v).length;
      const vBooked = state.calls.filter(c => c.variant === v && ['BK', 'SH', 'CL'].includes(c.outcome)).length;
      const isLocked = state.lockedVariant === v;
      return `<div class="variant-stats-row ${isLocked ? 'locked' : ''}"><span class="label">${v}${isLocked ? ' 🔒' : ''}</span><span>${vCalls} calls · ${vBooked} booked</span></div>`;
    }).join('');
  }
  const cStats = document.getElementById('callerStats');
  if (cStats) {
    cStats.innerHTML = ['Zack', 'Tony'].map(name => {
      const calls = state.calls.filter(c => c.caller === name).length;
      const booked = state.calls.filter(c => c.caller === name && ['BK', 'SH', 'CL'].includes(c.outcome)).length;
      return `<div class="caller-stats-row"><span class="label">${name}</span><span>${calls} calls · ${booked} booked</span></div>`;
    }).join('');
  }

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
      ${c.followup && c.followup.date ? `<span class="log-followup" title="Follow-up ${c.followup.date}">📅</span>` : ''}
      <span class="log-score" title="Auto-score">${c.score || 0}</span>
      <span style="color:#888;">${c.variant}·${(c.caller || 'Z').slice(0, 1)}</span>
      <span class="log-time">${new Date(c.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
    </div>
  `).join('');
}

function logCall() {
  const outcome = document.getElementById('outcome').value;
  if (!outcome) { alert('Pick an outcome first.'); return; }
  const duration = currentElapsedSec();

  // Build follow-up sub-object if enabled
  const fpEnabled = document.getElementById('fpEnable').checked;
  let followup = null;
  if (fpEnabled) {
    const fpDate = document.getElementById('fpDate').value;
    const fpTime = document.getElementById('fpTime').value || '10:00';
    const fpChannel = document.getElementById('fpChannel').value;
    const fpMessage = document.getElementById('fpMessage').value.trim();
    if (fpDate) {
      followup = { date: fpDate, time: fpTime, channel: fpChannel, message: fpMessage };
    }
  }

  const call = {
    ts: Date.now(),
    brand: state.brand,
    caller: state.caller,
    variant: state.variant,
    company: document.getElementById('company').value.trim(),
    domain: '',
    market: document.getElementById('market').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('prospectEmail').value.trim(),
    outcome,
    objectionRaised: document.getElementById('objectionRaised').value,
    whatWorked: document.getElementById('whatWorked').value.trim(),
    nextStep: document.getElementById('nextStep').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    prospectN: state.selectedProspectN,
    duration,
    followup
  };

  // Resolve domain from selected prospect
  if (state.selectedProspectN) {
    const p = PROSPECTS.find(x => x.n === state.selectedProspectN);
    if (p && p.domain) call.domain = p.domain;
  }

  call.score = scoreCall(call, duration);
  state.calls.push(call);
  state.lastSavedCallIdx = state.calls.length - 1;
  state.manualVariant = false;
  saveState();
  renderStats();
  renderCallLog();
  renderReconCard(); // refresh history
  renderProspectPicker(); // refresh status dots for this prospect

  // Sync to backend
  if (state.backendUrl) {
    enqueueCallSync(call);
  }

  // Show undo toast (8s)
  showUndoToast();

  setTimeout(() => {
    clearForm();
    resetTimer();
    maybeRotateVariant();
  }, 1000);
}

function showUndoToast() {
  const t = document.getElementById('undoToast');
  if (!t) return;
  t.classList.remove('hidden');
  if (state._undoTimer) clearTimeout(state._undoTimer);
  state._undoTimer = setTimeout(() => {
    t.classList.add('hidden');
    state.lastSavedCallIdx = null;
  }, 8000);
}

function undoLastCall() {
  if (state.lastSavedCallIdx == null) return;
  const idx = state.lastSavedCallIdx;
  if (idx < 0 || idx >= state.calls.length) return;
  const removed = state.calls.splice(idx, 1)[0];
  state.lastSavedCallIdx = null;
  if (state._undoTimer) { clearTimeout(state._undoTimer); state._undoTimer = null; }
  saveState();
  renderStats();
  renderCallLog();
  renderReconCard();
  renderProspectPicker();
  const t = document.getElementById('undoToast');
  if (t) t.classList.add('hidden');
  // Best-effort backend undo
  if (state.backendUrl && removed) {
    state.syncQueue.push({ kind: 'undoCall', brand: state.brand, ts: removed.ts, queuedAt: Date.now() });
    saveState();
    drainSyncQueue();
  }
}

function clearForm() {
  document.getElementById('prospectSelect').value = '';
  document.getElementById('company').value = '';
  document.getElementById('market').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('prospectEmail').value = '';
  document.getElementById('outcome').value = '';
  document.getElementById('objectionRaised').value = '';
  document.getElementById('whatWorked').value = '';
  document.getElementById('nextStep').value = '';
  document.getElementById('notes').value = '';
  document.getElementById('fpEnable').checked = false;
  document.getElementById('fpFields').classList.add('hidden');
  document.getElementById('fpDate').value = '';
  document.getElementById('fpMessage').value = '';
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
      const status = prospectStatus(p);
      const dot = STATUS_DOT[status] || '';
      const label = `${dot} #${p.n} · ${p.domain || p.company || 'unnamed'}`;
      html += `<option value="${p.n}" data-status="${status}">${escapeHTML(label)}</option>`;
    });
    html += '</optgroup>';
  });
  sel.innerHTML = html;
}

const STATUS_DOT = {
  never: '🔴',
  attempted: '🟡',
  stale: '⚫',
  booked: '🟢'
};
function prospectStatus(p) {
  const myCalls = state.calls.filter(c => c.prospectN === p.n);
  if (!myCalls.length) return 'never';
  if (myCalls.some(c => ['BK', 'SH', 'CL'].includes(c.outcome))) return 'booked';
  // Count no-contacts (NA, VM, HU)
  const noContact = myCalls.filter(c => ['NA', 'VM', 'HU'].includes(c.outcome)).length;
  if (noContact >= 3) return 'stale';
  return 'attempted';
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
  document.getElementById('prospectEmail').value = p.email || '';
  renderReconCard();
  renderBeats();
}

// ============== CSV UPLOAD ==============
// Normalize header text → lowercase, alpha-only, underscore-collapsed
function normHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
// Build reverse alias map from CSV_SCHEMA.column_map (alias → canonical)
function buildAliasMap() {
  const map = {};
  if (!CSV_SCHEMA || !CSV_SCHEMA.column_map) return map;
  Object.entries(CSV_SCHEMA.column_map).forEach(([canonical, aliases]) => {
    map[normHeader(canonical)] = canonical;
    (aliases || []).forEach(a => { map[normHeader(a)] = canonical; });
  });
  return map;
}
// Infer market from US phone area code — used when CSV omits market
const AREA_CODE_TO_MARKET = {
  '305': 'Miami', '786': 'Miami', '954': 'Fort Lauderdale', '561': 'West Palm Beach',
  '212': 'New York', '646': 'New York', '917': 'New York', '718': 'New York',
  '310': 'Los Angeles', '424': 'Los Angeles', '323': 'Los Angeles', '213': 'Los Angeles',
  '702': 'Las Vegas', '725': 'Las Vegas',
  '480': 'Scottsdale', '602': 'Phoenix', '623': 'Phoenix',
  '214': 'Dallas', '469': 'Dallas', '972': 'Dallas', '817': 'Fort Worth', '682': 'Fort Worth',
  '713': 'Houston', '281': 'Houston', '832': 'Houston',
  '404': 'Atlanta', '470': 'Atlanta', '678': 'Atlanta',
  '407': 'Orlando', '321': 'Orlando',
  '415': 'San Francisco', '628': 'San Francisco', '650': 'San Francisco',
  '312': 'Chicago', '773': 'Chicago', '872': 'Chicago',
  '617': 'Boston', '857': 'Boston',
  '202': 'Washington DC', '703': 'Washington DC', '571': 'Washington DC',
  '615': 'Nashville', '629': 'Nashville',
  '843': 'Charleston', '912': 'Savannah',
  '206': 'Seattle', '425': 'Seattle',
  '503': 'Portland', '971': 'Portland',
  '720': 'Denver', '303': 'Denver'
};
function inferMarketFromPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  const ten = digits.length === 11 ? digits.slice(1) : digits;
  if (ten.length < 3) return null;
  return AREA_CODE_TO_MARKET[ten.slice(0, 3)] || null;
}
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const aliasMap = buildAliasMap();
  const rawHeaders = splitCSVLine(lines[0]).map(h => normHeader(h));
  // Map each raw header to its canonical field name (or keep raw if unknown)
  const canonicalHeaders = rawHeaders.map(h => aliasMap[h] || h);
  const required = (CSV_SCHEMA && CSV_SCHEMA.required_columns) || ['domain'];
  const missing = required.filter(r => !canonicalHeaders.includes(r));
  if (missing.length) {
    alert(`CSV missing required column(s): ${missing.join(', ')}\n\nFor ${CSV_SCHEMA ? CSV_SCHEMA.brand : 'this brand'}, recognized aliases for "${missing[0]}" include: ${(CSV_SCHEMA && CSV_SCHEMA.column_map[missing[0]]) ? CSV_SCHEMA.column_map[missing[0]].join(', ') : '(none configured)'}`);
    return [];
  }
  const defaultMarket = (CSV_SCHEMA && CSV_SCHEMA.default_market) || '';
  return lines.slice(1).map((line, i) => {
    const cells = splitCSVLine(line);
    const row = { n: 1000 + i };
    canonicalHeaders.forEach((h, j) => { row[h] = (cells[j] || '').trim(); });
    // Issues: support pipe-delimited OR semicolon-delimited
    if (row.issues && typeof row.issues === 'string') {
      row.issues = row.issues.split(/[|;]/).map(s => s.trim()).filter(Boolean);
    }
    // Numeric coercion on score fields
    ['speed', 'trust', 'cta', 'speed_score', 'trust_score', 'cta_score'].forEach(k => {
      if (row[k] && !isNaN(Number(row[k]))) row[k] = Number(row[k]);
    });
    if (row.speed_score !== undefined) row.speed = row.speed_score;
    if (row.trust_score !== undefined) row.trust = row.trust_score;
    if (row.cta_score !== undefined) row.cta = row.cta_score;
    // Market enrichment: explicit → phone area code → brand default
    if (!row.market) {
      row.market = inferMarketFromPhone(row.phone) || defaultMarket;
    }
    // CPC enrichment from market_cpc.json (read-only — stored for sheet sync)
    const cpc = lookupMarketCPC(row.market);
    if (cpc) {
      row.primary_kw = cpc.primary_kw;
      row.cpc_low = cpc.cpc_low;
      row.cpc_high = cpc.cpc_high;
    }
    // Normalize risk + cta to uppercase enums
    if (row.risk) row.risk = String(row.risk).toUpperCase().replace('MED', 'MEDIUM');
    if (row.cta && typeof row.cta === 'string') row.cta = row.cta.toUpperCase();
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

// ============== DASHBOARD <-> CALL COACH VIEW SWITCH (v3.4) ==============
function showDashboard() {
  const cc = document.getElementById('callCoachView');
  const dv = document.getElementById('dashboardView');
  if (cc) cc.classList.add('hidden');
  if (dv) dv.classList.remove('hidden');
  document.body.classList.add('view-dashboard');
  document.body.classList.remove('view-coach');
  if (window.renderDashboard) window.renderDashboard('now');
}
window.showDashboard = showDashboard;

window.enterBrand = async function(slug, prospectId) {
  const cc = document.getElementById('callCoachView');
  const dv = document.getElementById('dashboardView');
  const rc = document.getElementById('reconCard');
  if (dv) dv.classList.add('hidden');
  if (cc) cc.classList.remove('hidden');
  if (rc) rc.classList.remove('hidden'); // v3.7: reveal sticky recon card when we leave dashboard
  document.body.classList.remove('view-dashboard');
  document.body.classList.add('view-coach');
  const sel = document.getElementById('brandSelect');
  if (sel) sel.value = slug;
  await switchBrand(slug);
  if (prospectId) {
    // Try to auto-select the prospect inside the brand
    state.selectedProspectN = prospectId;
    try { saveState(); } catch (e) {}
    if (typeof renderProspectPicker === 'function') renderProspectPicker();
    if (typeof renderReconCard === 'function') renderReconCard();
  }
};

// ============== BRAND + CALLER SWITCH ==============
async function switchBrand(slug) {
  state.brand = slug;
  state.selectedProspectN = null;
  // Apply brand's default caller (Zack for Exotics, Tony for ConversionJet)
  const brand = BRANDS[slug];
  if (brand && brand.caller_default) {
    state.caller = brand.caller_default;
    const callerSel = document.getElementById('callerSelect');
    if (callerSel) callerSel.value = brand.caller_default;
  }
  saveState();
  document.getElementById('logoMark').textContent = brand.short;
  document.getElementById('brandName').textContent = `Call Coach · ${brand.name}`;
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
  renderQuickObjectionBar();
  renderStats();
  renderCallLog();
  clearForm();
  // Refresh manual sheet URL input for this brand
  const msEl = document.getElementById('manualSheetUrl');
  if (msEl) msEl.value = (state.sheetUrlByBrand && state.sheetUrlByBrand[slug]) || '';
  // Pull cloud prospects for this brand
  if (state.backendUrl) loadCloudProspects();
}

function switchCaller(name) {
  state.caller = name;
  saveState();
  renderBeats();
}

// ============== SIDE TOGGLE ==============
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

// ============== MODAL HELPERS ==============
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.classList.remove('modal-open');
}
function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.body.classList.remove('modal-open');
}

// ============== ADD PROSPECT (inline) ==============
async function saveNewProspect() {
  const prospect = {
    company: document.getElementById('np_company').value.trim(),
    domain: document.getElementById('np_domain').value.trim(),
    market: document.getElementById('np_market').value.trim(),
    phone: document.getElementById('np_phone').value.trim(),
    email: document.getElementById('np_email').value.trim(),
    instagram: document.getElementById('np_instagram').value.trim(),
    speed: document.getElementById('np_speed').value.trim(),
    trust: document.getElementById('np_trust').value.trim(),
    cta: document.getElementById('np_cta').value.trim(),
    risk: document.getElementById('np_risk').value,
    issues_1: document.getElementById('np_issues_1').value.trim(),
    issues_2: document.getElementById('np_issues_2').value.trim(),
    issues_3: document.getElementById('np_issues_3').value.trim(),
    notes: document.getElementById('np_notes').value.trim()
  };
  if (!prospect.company && !prospect.domain) {
    alert('Need at least a Company or Domain.');
    return;
  }

  // Build local-format prospect to add to PROSPECTS immediately
  const localProspect = {
    n: 5000 + state.customProspects.length + state.cloudProspects.length,
    company: prospect.company,
    domain: prospect.domain,
    market: prospect.market,
    phone: prospect.phone,
    email: prospect.email,
    instagram: prospect.instagram,
    speed: prospect.speed,
    trust: prospect.trust,
    cta: prospect.cta,
    risk: prospect.risk,
    issues: [prospect.issues_1, prospect.issues_2, prospect.issues_3].filter(Boolean),
    notes: prospect.notes
  };

  // Sync to backend if connected
  let cloudOk = false;
  if (state.backendUrl) {
    try {
      const r = await backendCall({ action: 'addProspect', brand: state.brand, prospect });
      if (r.sheetUrl) state.sheetUrlByBrand[state.brand] = r.sheetUrl;
      cloudOk = true;
      showToast(`Saved to master sheet (${r.action || 'created'})`);
      // Refresh cloud prospects
      loadCloudProspects();
    } catch (e) {
      showToast(`Cloud save failed (kept locally): ${e.message}`);
    }
  }

  if (!cloudOk) {
    state.customProspects.push(localProspect);
    mergeProspects();
    renderProspectPicker();
    saveState();
    showToast('Saved locally (no backend connected)');
  }

  // Clear & close
  ['np_company','np_domain','np_market','np_phone','np_email','np_instagram',
   'np_speed','np_trust','np_cta','np_issues_1','np_issues_2','np_issues_3','np_notes']
    .forEach(id => { document.getElementById(id).value = ''; });
  closeModal('prospectModal');
}

// ============== KEYBOARD ==============
function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const inField = ['input', 'textarea', 'select'].includes(tag);
    if (e.key === 'Escape') {
      closeAllModals();
      document.getElementById('legendBar').classList.add('hidden');
      return;
    }
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      toggleTimer();
      return;
    }
    // Ctrl++ → add prospect modal
    if (e.ctrlKey && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      openModal('prospectModal');
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

function manualSwitchVariant(v) {
  if (!SCRIPTS[v]) return;
  state.variant = v;
  state.manualVariant = true;
  saveState();
  updateVariantTabs();
  renderBeats();
}

function switchVariantSilent(v) {
  if (!SCRIPTS[v]) return;
  state.variant = v;
  updateVariantTabs();
  renderBeats();
}

// ============== FOLLOW-UP HELPERS ==============
function setFollowupDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Format YYYY-MM-DD in local time
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  document.getElementById('fpDate').value = `${yyyy}-${mm}-${dd}`;
  document.getElementById('fpEnable').checked = true;
  document.getElementById('fpFields').classList.remove('hidden');
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

  // v3.4: dashboard is the default landing view. Don't auto-switch into a brand.
  // BRANDS is already exposed on window for dashboard.js.
  // Wire the topbar Dashboard button.
  const dashBtn = document.getElementById('dashboardBtn');
  if (dashBtn) dashBtn.addEventListener('click', () => showDashboard());

  // Render dashboard immediately
  if (window.renderDashboard) {
    window.renderDashboard('now');
  }

  // Still load the last brand's data in the background so app is ready when user enters
  await switchBrand(state.brand);
  // But keep call-coach view hidden until user picks a brand from dashboard
  document.getElementById('callCoachView').classList.add('hidden');
  document.getElementById('dashboardView').classList.remove('hidden');
  document.body.classList.add('view-dashboard');

  if (!state.manualVariant && !state.lockedVariant) {
    const want = computeAutoVariant();
    state.variant = want;
    saveState();
  }
  switchVariantSilent(state.variant);
  toggleSide(state.sidePane);

  // Restore backend URL into input
  if (state.backendUrl) {
    document.getElementById('backendUrl').value = state.backendUrl;
    pingBackend(true);
    if (state.syncQueue.length) drainSyncQueue();
  } else {
    setSyncBadge('offline');
  }
  // Restore manual sheet URL for current brand (if set)
  if (state.sheetUrlByBrand[state.brand]) {
    const m = document.getElementById('manualSheetUrl');
    if (m) m.value = state.sheetUrlByBrand[state.brand];
  }

  // ============== EVENT BINDINGS ==============
  brandSel.addEventListener('change', e => switchBrand(e.target.value));
  // Sync badge — click opens Backend modal so user can wire the sheet
  const syncBadgeEl = document.getElementById('syncBadge');
  if (syncBadgeEl) syncBadgeEl.addEventListener('click', () => openModal('backendModal'));

  // Topbar "📊 Sheet" button — opens the master sheet for the current brand
  document.getElementById('openSheetBtn').addEventListener('click', () => {
    const url = state.sheetUrlByBrand[state.brand];
    if (url) {
      window.open(url, '_blank');
    } else {
      showToast('No sheet URL yet — paste one in ⚙ Backend → "Master Sheet URL" or log a call to auto-set.');
      openModal('backendModal');
    }
  });
  // Manual sheet URL field — save on blur
  const manualSheetEl = document.getElementById('manualSheetUrl');
  if (manualSheetEl) {
    manualSheetEl.addEventListener('blur', () => {
      const v = manualSheetEl.value.trim();
      if (v) {
        state.sheetUrlByBrand[state.brand] = v;
        saveState();
        showToast('Master sheet URL saved for ' + (BRANDS[state.brand]?.name || state.brand));
      }
    });
  }
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
  document.getElementById('whatWorked').addEventListener('input', updateLiveScore);
  document.getElementById('nextStep').addEventListener('input', updateLiveScore);
  document.getElementById('toggleStats').addEventListener('click', () => toggleSide('stats'));
  document.getElementById('toggleCal').addEventListener('click', () => toggleSide('cal'));
  document.getElementById('legendToggle').addEventListener('click', () => {
    document.getElementById('legendBar').classList.toggle('hidden');
  });
  document.getElementById('progressBar').addEventListener('click', () => {
    document.getElementById('prospectSelect').focus();
  });

  // CSV upload
  document.getElementById('csvUpload').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { alert('No rows parsed.'); return; }
    state.customProspects = state.customProspects.concat(rows);
    mergeProspects();
    saveState();
    renderProspectPicker();
    renderStats();
    showToast(`Added ${rows.length} prospects from CSV`);

    // If backend connected, push each to master sheet
    if (state.backendUrl) {
      let okCount = 0;
      for (const r of rows) {
        try {
          await backendCall({
            action: 'addProspect',
            brand: state.brand,
            prospect: {
              company: r.company || '',
              domain: r.domain || '',
              market: r.market || '',
              phone: r.phone || '',
              email: r.email || '',
              instagram: r.instagram || '',
              speed: r.speed || '',
              trust: r.trust || '',
              cta: r.cta || '',
              risk: r.risk || 'MED',
              issues_1: (r.issues && r.issues[0]) || r.issues_1 || '',
              issues_2: (r.issues && r.issues[1]) || r.issues_2 || '',
              issues_3: (r.issues && r.issues[2]) || r.issues_3 || '',
              notes: r.notes || ''
            }
          });
          okCount++;
        } catch (e) {
          console.warn('CSV row sync failed:', e);
        }
      }
      if (okCount) showToast(`Synced ${okCount}/${rows.length} CSV rows to master sheet`);
      loadCloudProspects();
    }
  });

  // ============== BACKEND MODAL ==============
  document.getElementById('backendBtn').addEventListener('click', () => openModal('backendModal'));
  document.getElementById('backendTest').addEventListener('click', async () => {
    const url = document.getElementById('backendUrl').value.trim();
    const statusEl = document.getElementById('backendStatus');
    if (!url) { statusEl.textContent = 'Paste a URL first.'; statusEl.className = 'backend-status err'; return; }
    state.backendUrl = url;
    saveState();
    statusEl.textContent = 'Testing connection…';
    statusEl.className = 'backend-status';
    const ok = await pingBackend(false);
    if (ok) {
      statusEl.textContent = '✓ Connected. Master sheet ready.';
      statusEl.className = 'backend-status ok';
      loadCloudProspects();
      drainSyncQueue();
    } else {
      statusEl.textContent = '✗ Could not reach backend. Check the URL and that the script is deployed as a Web App with "Anyone" access.';
      statusEl.className = 'backend-status err';
    }
  });
  document.getElementById('backendOpenSheet').addEventListener('click', () => {
    const url = state.sheetUrlByBrand[state.brand];
    if (url) {
      window.open(url, '_blank');
    } else {
      showToast('No master sheet URL yet — log a call or save a prospect first.');
    }
  });
  document.getElementById('backendSyncNow').addEventListener('click', () => drainSyncQueue());
  document.querySelectorAll('.modal-close, [data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      if (id) closeModal(id);
    });
  });
  // Click outside modal box closes
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) closeModal(m.id);
    });
  });

  // ============== ADD PROSPECT MODAL ==============
  document.getElementById('addProspectBtn').addEventListener('click', () => openModal('prospectModal'));
  document.getElementById('np_save').addEventListener('click', saveNewProspect);

  // ============== FOLLOW-UP UI ==============
  document.getElementById('fpEnable').addEventListener('change', (e) => {
    document.getElementById('fpFields').classList.toggle('hidden', !e.target.checked);
    if (e.target.checked && !document.getElementById('fpDate').value) {
      // Default to +3 days
      setFollowupDays(3);
    }
  });
  document.querySelectorAll('.fp-quick button[data-days]').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = parseInt(btn.getAttribute('data-days'), 10);
      setFollowupDays(days);
    });
  });

  // Big timer banner buttons
  document.getElementById('btStart').addEventListener('click', toggleTimer);
  document.getElementById('btReset').addEventListener('click', resetTimer);

  // Sticky recon-card collapse toggle (v3.7)
  const reconCollapseBtn = document.getElementById('reconCollapseBtn');
  if (reconCollapseBtn) reconCollapseBtn.addEventListener('click', toggleReconCardCollapse);

  // Quick-objection hotkey bar
  renderQuickObjectionBar();

  // FAB removed in v3.5 — keep listeners null-safe in case of stale DOM
  const fabEl = document.getElementById('fabLog');
  if (fabEl) {
    fabEl.addEventListener('click', () => openModal('quickOutcomeModal'));
    document.querySelectorAll('#quickOutcomeModal [data-outcome]').forEach(b => {
      b.addEventListener('click', () => {
        const oc = b.getAttribute('data-outcome');
        document.getElementById('outcome').value = oc;
        closeModal('quickOutcomeModal');
        if (['BK', 'PP'].includes(oc)) {
          document.getElementById('fpEnable').checked = true;
          document.getElementById('fpFields').classList.remove('hidden');
          if (!document.getElementById('fpDate').value) setFollowupDays(oc === 'BK' ? 1 : 3);
        }
        logCall();
      });
    });
  }

  // Undo-last-call toast button
  const undoBtn = document.getElementById('undoToastBtn');
  if (undoBtn) undoBtn.addEventListener('click', undoLastCall);

  // Restore recon-card collapse state (v3.7)
  if (state.reconCardCollapsed) {
    const card = document.getElementById('reconCard');
    if (card) card.classList.add('collapsed');
    const btn = document.getElementById('reconCollapseBtn');
    if (btn) btn.textContent = '+';
  }

  // Set initial big-timer target on load
  setTimeout(() => {
    const btT = document.getElementById('btTarget');
    if (btT) btT.textContent = fmtTime(scriptTargetLength());
  }, 200);

  bindKeyboard();

  // Background drain every 30s
  setInterval(() => {
    if (state.backendUrl && state.syncQueue.length) drainSyncQueue();
  }, SYNC_RETRY_MS);

  // Online/offline status
  window.addEventListener('online', () => {
    if (state.backendUrl) {
      setSyncBadge('syncing');
      drainSyncQueue();
    }
  });
  window.addEventListener('offline', () => setSyncBadge('offline'));
}

document.addEventListener('DOMContentLoaded', init);
