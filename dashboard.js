// ============================================================================
// DASHBOARD — Call Coach v3.4
// Center view that shows per-brand vertical cards with:
//   - Brand identity + theme
//   - Audit value, prospect count, hot-list tiers
//   - Live "callable right now" + "next 2 hours" counts (per-brand only)
//   - Next prime window across all prospects (closest TZ alignment)
//   - "Train me" drilldown opening the deep training tab
// ============================================================================

// Cache for loaded brand intel — avoid re-fetching on every refresh tick
const DASH_CACHE = {};

// v3.6 — all shape normalization moved to validators.js (window.CCValidators)
// This loader only does the fetch + validate, then caches the canonical bundle.
async function loadBrandIntel(slug) {
  if (DASH_CACHE[slug]) return DASH_CACHE[slug];
  const base = `brands/${slug}`;
  const safeFetch = (file, fallback) =>
    fetch(`${base}/${file}`)
      .then(r => r.ok ? r.json() : fallback)
      .catch(() => fallback);
  try {
    const [prospectsRaw, scriptsRaw, objectionsRaw, callIntelRaw, hotListRaw, marketCpcRaw] = await Promise.all([
      safeFetch('prospects.json', []),
      safeFetch('scripts.json', {}),
      safeFetch('objections.json', {}),
      safeFetch('call_intel.json', null),
      safeFetch('_hot_list.json', null),
      safeFetch('market_cpc.json', null),
    ]);
    const V = window.CCValidators;
    if (!V) {
      console.error('CCValidators not loaded — falling back to raw bundle');
      DASH_CACHE[slug] = {
        prospects: Array.isArray(prospectsRaw) ? prospectsRaw : (prospectsRaw && prospectsRaw.prospects) || [],
        scripts: scriptsRaw || { _meta: {} },
        objections: [],
        callIntel: callIntelRaw, hotList: hotListRaw, marketCpc: marketCpcRaw,
        validation: { ok: false, errors: ['validators.js not loaded'], warnings: [] }
      };
      return DASH_CACHE[slug];
    }
    const result = V.validateBrandBundle(slug, {
      prospects: prospectsRaw, scripts: scriptsRaw, objections: objectionsRaw,
      callIntel: callIntelRaw, marketCpc: marketCpcRaw, hotList: hotListRaw
    });
    if (result.errors.length) console.warn('[dashboard] ' + slug + ' validation errors:', result.errors);
    if (result.warnings.length) console.info('[dashboard] ' + slug + ' validation warnings:', result.warnings);
    DASH_CACHE[slug] = Object.assign({}, result.value, {
      validation: { ok: result.ok, errors: result.errors, warnings: result.warnings }
    });
    return DASH_CACHE[slug];
  } catch (e) {
    console.error(`Failed to load intel for ${slug}:`, e);
    return {
      prospects: [], scripts: { _meta: {} }, objections: [],
      callIntel: null, hotList: { tier_1: [], tier_2: [], tier_3: [], tier_4: [], no_phone: [] }, marketCpc: {},
      validation: { ok: false, errors: ['Fetch threw: ' + (e && e.message || e)], warnings: [] }
    };
  }
}

// Filter prospects callable right now OR opening soon
function classifyProspects(prospects, callIntel, mode, refDate, lookaheadMin = 120) {
  if (!Array.isArray(prospects) || !callIntel) return { prime: [], soon: [], avoid: [], unknownTz: [] };
  const buckets = { prime: [], soon: [], avoid: [], unknownTz: [] };
  for (const p of prospects) {
    if (p.is_client) continue;
    // Only count callable prospects (must have a phone for "callable now")
    if (!p.phone) continue;
    const status = window.callabilityStatus(callIntel, p.market, refDate, lookaheadMin);
    if (status.status === 'off') buckets.unknownTz.push({ p, status });
    else if (status.status === 'prime') buckets.prime.push({ p, status });
    else if (status.status === 'soon') buckets.soon.push({ p, status });
    else if (status.status === 'avoid') buckets.avoid.push({ p, status });
  }
  return buckets;
}

function formatMinutesAway(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function renderBrandCard(slug, brand, intel, mode) {
  const { prospects = [], scripts = {}, callIntel, hotList, marketCpc, validation } = intel || {};
  const theme = brand.theme || { ink: '#1a1a1a', gold: '#888', cream: '#f4f0e8', highlight: '#fff8e8' };

  // v3.6 — if validation fully failed, render an error card and exit
  if (validation && validation.errors && validation.errors.length && prospects.length === 0) {
    return `
      <div class="dash-brand-card dash-brand-card-error" data-brand="${slug}" style="--brand-ink:${theme.ink};--brand-gold:${theme.gold};">
        <div class="dash-brand-head">
          <div class="dash-brand-short">${brand.short || '?'}</div>
          <div class="dash-brand-meta">
            <div class="dash-brand-name">${escapeHtml(brand.name || slug)}</div>
            <div class="dash-brand-sub">Failed to load brand data</div>
          </div>
        </div>
        <div class="dash-error-body">
          <div class="dash-error-title">⚠️ Data validation failed</div>
          <ul class="dash-error-list">
            ${validation.errors.slice(0, 5).map(e => `<li>${escapeHtml(e)}</li>`).join('')}
          </ul>
          <div class="dash-error-help">Check brands/${slug}/ JSON files in the repo.</div>
        </div>
      </div>`;
  }

  const meta = (scripts._meta) || {};
  const auditValue = meta.audit_value || 3000;
  const industry = meta.industry || 'unspecified';
  const totalProspects = prospects.filter(p => !p.is_client).length;
  const withPhone = prospects.filter(p => !p.is_client && p.phone).length;

  // v3.6 — canonical unified hot list tiers
  const t1 = hotList?.tier_1?.length || 0;
  const t2 = hotList?.tier_2?.length || 0;
  const t3 = hotList?.tier_3?.length || 0;
  const t4 = hotList?.tier_4?.length || 0;
  const noPhone = hotList?.no_phone?.length || 0;

  // v3.6 — only badge for actionable warnings; suppress internal shape-normalization notices.
  const NOISE_PATTERNS = [
    /used wrapper shape/i,
    /used flat A\/B\/C shape/i,
    /call_intel\.json missing/i,
    /unwrapped/i,
  ];
  const actionableWarnings = (validation?.warnings || []).filter(w =>
    !NOISE_PATTERNS.some(rx => rx.test(w))
  );
  const warnBadge = actionableWarnings.length
    ? `<span class="dash-warn-badge" title="${escapeHtml(actionableWarnings.join(' · '))}">!</span>`
    : '';

  // Live classification
  const buckets = classifyProspects(prospects, callIntel, mode, new Date());
  const primeCount = buckets.prime.length;
  const soonCount = buckets.soon.length;
  const avoidCount = buckets.avoid.length;
  const liveCount = mode === 'soon' ? primeCount + soonCount : primeCount;
  const liveLabel = mode === 'soon' ? 'callable now or within 2h' : 'callable right now';

  // Build sample callable prospects (top 5 by tier)
  const samplePool = mode === 'soon' ? [...buckets.prime, ...buckets.soon] : [...buckets.prime];
  const sample = samplePool.slice(0, 5).map(({ p, status }) => `
    <div class="dash-sample-row" data-id="${p.id}" data-brand="${slug}">
      <div class="dsr-main">
        <div class="dsr-company">${escapeHtml(p.company || p.domain || p.id)}</div>
        <div class="dsr-market">${escapeHtml(p.market || '')} · ${status.localTime || ''}</div>
      </div>
      <div class="dsr-meta">
        <span class="dsr-risk risk-${(p.risk || 'low').toLowerCase()}">${p.risk || 'LOW'}</span>
        <span class="dsr-status status-${status.status}">${status.status === 'prime' ? '● PRIME' : status.status === 'soon' ? `◐ ${status.opensIn}m` : status.status}</span>
      </div>
    </div>
  `).join('') || `<div class="dash-empty">No prospects in window. Try the toggle, or wait for the next prime block.</div>`;

  // Compute next prime window for sample of resolved prospects (use first prospect with TZ as anchor)
  const anchor = prospects.find(p => !p.is_client && p.phone && window.resolveMarketTZ(p.market));
  let nextWindow = null;
  if (anchor && callIntel) {
    nextWindow = window.nextPrimeWindow(callIntel, anchor.market, new Date());
  }

  // Best block summary
  const primaryBlocks = (callIntel?.primary_blocks || []).map(pb => `
    <div class="dash-block-row">
      <span class="dbr-label">${pb.label}</span>
      <span class="dbr-time">${window.to12h(pb.start)}–${window.to12h(pb.end)}</span>
      <span class="dbr-days">${(pb.days || []).join(' · ')}</span>
    </div>
  `).join('');

  // Top markets (by prospect count, with CPC)
  const marketCounts = {};
  for (const p of prospects) {
    if (p.is_client || !p.market || p.market === 'Unknown') continue;
    marketCounts[p.market] = (marketCounts[p.market] || 0) + 1;
  }
  const topMarkets = Object.entries(marketCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([m, n]) => {
      const cpc = marketCpc?.[m];
      const cpcStr = cpc ? `$${cpc.cpc_low}–$${cpc.cpc_high}` : '—';
      return `<div class="dash-market-row"><span class="dmr-name">${escapeHtml(m)}</span><span class="dmr-count">${n}</span><span class="dmr-cpc">${cpcStr}</span></div>`;
    }).join('');

  return `
    <article class="dash-card" data-brand="${slug}" style="--ink:${theme.ink};--gold:${theme.gold};--cream:${theme.cream};--highlight:${theme.highlight};">
      <header class="dash-card-head">
        <div class="dch-left">
          <div class="dch-logo">${escapeHtml(brand.short || slug.slice(0,2).toUpperCase())}</div>
          <div class="dch-meta">
            <h3 class="dch-name">${escapeHtml(brand.name)}${warnBadge}</h3>
            <div class="dch-sub">${escapeHtml(brand.sub || '')}</div>
          </div>
        </div>
        <button class="dash-enter-btn" data-action="enter" data-brand="${slug}">Enter Call Coach →</button>
      </header>

      <div class="dash-card-body">

        <!-- Live status banner -->
        <div class="dash-live">
          <div class="dash-live-num">${liveCount}</div>
          <div class="dash-live-label">${liveLabel}</div>
          ${mode === 'now' && soonCount > 0 ? `<div class="dash-live-sub">+${soonCount} more in next 2 hours</div>` : ''}
          ${nextWindow ? `<div class="dash-live-sub">Next prime: ${nextWindow.weekday} ${nextWindow.hhmm12 || window.to12h(nextWindow.hhmm)} (${formatMinutesAway(nextWindow.opensInMinutes)} away)</div>` : ''}
        </div>

        <!-- Brand stats grid -->
        <div class="dash-stats-grid">
          <div class="dash-stat"><div class="ds-num">${totalProspects}</div><div class="ds-label">Total prospects</div></div>
          <div class="dash-stat"><div class="ds-num">${withPhone}</div><div class="ds-label">With phone</div></div>
          <div class="dash-stat"><div class="ds-num">$${auditValue.toLocaleString()}</div><div class="ds-label">Audit value</div></div>
          <div class="dash-stat"><div class="ds-num">${Object.keys(scripts).filter(k => !k.startsWith('_')).length}</div><div class="ds-label">Script variants</div></div>
        </div>

        <!-- Hot list tiers -->
        <div class="dash-section">
          <h4 class="dash-section-title">Hot list tiers</h4>
          <div class="dash-tiers">
            <div class="dash-tier tier-1"><span class="dt-num">${t1}</span><span class="dt-label">T1 · top</span></div>
            <div class="dash-tier tier-2"><span class="dt-num">${t2}</span><span class="dt-label">T2 · caution</span></div>
            <div class="dash-tier tier-3"><span class="dt-num">${t3}</span><span class="dt-label">T3 · solid</span></div>
            <div class="dash-tier tier-4"><span class="dt-num">${t4}</span><span class="dt-label">T4 · warm</span></div>
            <div class="dash-tier tier-x"><span class="dt-num">${noPhone}</span><span class="dt-label">No phone</span></div>
          </div>
        </div>

        <!-- Callable sample -->
        <div class="dash-section">
          <h4 class="dash-section-title">Top callable ${mode === 'soon' ? 'soon' : 'now'}</h4>
          <div class="dash-samples">${sample}</div>
        </div>

        <!-- Top markets -->
        <div class="dash-section">
          <h4 class="dash-section-title">Top markets · CPC band</h4>
          <div class="dash-markets">${topMarkets || '<div class="dash-empty">No market data.</div>'}</div>
        </div>

        <!-- Primary blocks summary -->
        <div class="dash-section">
          <h4 class="dash-section-title">Primary call blocks (prospect local time)</h4>
          <div class="dash-blocks">${primaryBlocks || '<div class="dash-empty">No call intel loaded.</div>'}</div>
        </div>

        <!-- Footer actions -->
        <footer class="dash-card-foot">
          <button class="dash-train-btn" data-action="train" data-brand="${slug}">Train me on this brand →</button>
        </footer>

      </div>
    </article>
  `;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Render the full dashboard
async function renderDashboard(mode = 'now') {
  const root = document.getElementById('dashboardRoot');
  if (!root) return;

  // Header + global toggle
  const tonyLocal = window.localTimeIn('America/Chicago');
  const tonyLocalDisplay = tonyLocal ? (tonyLocal.hhmm12 || tonyLocal.hhmm) : '';
  root.innerHTML = `
    <div class="dash-topnav">
      <div class="dash-topnav-left">
        <div class="dash-title">Call Coach Dashboard</div>
        <div class="dash-sub">Per-brand call intelligence · ${tonyLocal ? `Central time ${tonyLocalDisplay} (${tonyLocal.weekday})` : ''}</div>
      </div>
      <div class="dash-topnav-right">
        <div class="dash-mode-toggle">
          <button class="dmt-btn ${mode === 'now' ? 'active' : ''}" data-mode="now">Right now</button>
          <button class="dmt-btn ${mode === 'soon' ? 'active' : ''}" data-mode="soon">Next 2 hours</button>
        </div>
        <button class="dash-refresh-btn" data-action="refresh">↻ Refresh</button>
      </div>
    </div>
    <div class="dash-cards-grid" id="dashCardsGrid">
      <div class="dash-loading">Loading brand intel…</div>
    </div>
  `;

  // Load every active brand
  const brandSlugs = Object.keys(window.BRANDS).filter(k => window.BRANDS[k].active);
  const intels = await Promise.all(brandSlugs.map(s => loadBrandIntel(s)));
  const cardsHtml = brandSlugs.map((slug, i) => renderBrandCard(slug, window.BRANDS[slug], intels[i], mode)).join('');
  document.getElementById('dashCardsGrid').innerHTML = cardsHtml || '<div class="dash-empty">No active brands.</div>';

  // Wire toggle
  root.querySelectorAll('.dmt-btn').forEach(btn => {
    btn.addEventListener('click', () => renderDashboard(btn.dataset.mode));
  });
  root.querySelector('[data-action="refresh"]')?.addEventListener('click', () => renderDashboard(mode));

  // Wire enter / train / sample buttons
  root.querySelectorAll('[data-action="enter"]').forEach(b => {
    b.addEventListener('click', () => window.enterBrand && window.enterBrand(b.dataset.brand));
  });
  root.querySelectorAll('[data-action="train"]').forEach(b => {
    b.addEventListener('click', () => openTrainingTab(b.dataset.brand));
  });
  root.querySelectorAll('.dash-sample-row').forEach(row => {
    row.addEventListener('click', () => {
      const slug = row.dataset.brand;
      const id = row.dataset.id;
      window.enterBrand && window.enterBrand(slug, id);
    });
  });
}

// Training drill-down — opens a modal with the full call_intel.json content
async function openTrainingTab(slug) {
  const intel = await loadBrandIntel(slug);
  const callIntel = intel?.callIntel;
  const brand = window.BRANDS[slug];
  if (!callIntel) {
    alert('No call intel loaded for ' + brand.name);
    return;
  }

  const m = callIntel._meta || {};
  const renderList = (arr, key = 'label') => (arr || []).map(item => `
    <div class="train-row">
      <div class="tr-head">
        <span class="tr-label">${escapeHtml(item[key] || '')}</span>
        ${item.start ? `<span class="tr-time">${window.to12h(item.start)}–${window.to12h(item.end)}</span>` : ''}
        ${item.day ? `<span class="tr-time">${item.day}</span>` : ''}
        ${item.days ? `<span class="tr-time">${(item.days || []).join(' · ')}</span>` : ''}
      </div>
      ${item.note || item.reason ? `<div class="tr-note">${escapeHtml(item.note || item.reason)}</div>` : ''}
    </div>
  `).join('');

  const modal = document.getElementById('trainingModal');
  modal.querySelector('.modal-body').innerHTML = `
    <div class="train-head" style="--ink:${brand.theme?.ink || '#1a1a1a'};--gold:${brand.theme?.gold || '#888'};">
      <h3>${escapeHtml(brand.name)} · Call training</h3>
      <div class="train-vertical">${escapeHtml(m.vertical || '')}</div>
      <div class="train-audience">${escapeHtml(m.audience || '')}</div>
    </div>

    <div class="train-section">
      <h4>🎯 Best calling windows (prospect local time)</h4>
      ${renderList(callIntel.core_windows)}
    </div>

    <div class="train-section">
      <h4>📅 Primary blocks · ${(callIntel.best_days || []).join(' · ')} preferred</h4>
      ${renderList(callIntel.primary_blocks)}
    </div>

    <div class="train-section">
      <h4>🧪 Experimental blocks</h4>
      ${renderList(callIntel.experimental_blocks) || '<div class="dash-empty">None defined.</div>'}
    </div>

    <div class="train-section train-warn">
      <h4>⛔ Avoid windows</h4>
      ${renderList(callIntel.avoid_windows)}
    </div>

    <div class="train-section train-warn">
      <h4>⛔ Avoid days</h4>
      ${renderList(callIntel.avoid_days, 'day')}
    </div>

    <div class="train-section">
      <h4>🏠 Audience nuances</h4>
      <ul class="train-bullets">
        ${(callIntel.homeowner_nuances || []).map(n => `<li>${escapeHtml(n)}</li>`).join('')}
      </ul>
    </div>

    <div class="train-section">
      <h4>📊 Metrics to track</h4>
      <ul class="train-bullets">
        ${(callIntel.metrics_to_track || []).map(n => `<li>${escapeHtml(n)}</li>`).join('')}
      </ul>
    </div>

    <div class="train-section train-meta">
      <em>${escapeHtml(m.source_note || '')}</em>
    </div>

    <div class="form-actions" style="margin-top:18px;">
      <button class="btn btn-gold" data-action="enter-brand" data-brand="${slug}">Enter ${escapeHtml(brand.name)} Call Coach →</button>
      <button class="btn btn-ghost" data-close="trainingModal">Close</button>
    </div>
  `;
  modal.classList.remove('hidden');
  modal.querySelector('[data-action="enter-brand"]')?.addEventListener('click', () => {
    modal.classList.add('hidden');
    window.enterBrand && window.enterBrand(slug);
  });
}

window.renderDashboard = renderDashboard;
window.openTrainingTab = openTrainingTab;
