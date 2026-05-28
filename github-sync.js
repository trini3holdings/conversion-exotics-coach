// ============================================================================
// github-sync.js — v3.10.0
// GitHub-backed sheet replacement: batched auto-commit of call logs +
// prospect overrides + deletions into the repo's data/<brand>/data.json.
//
// Storage: localStorage key `cc_github_sync` = { token, owner, repo, branch,
//   batchThreshold, batchIntervalMs, pendingSince, lastSyncTs, lastError,
//   pulledShas: {brand: sha} }.
//
// Public API (exposed on window.GitHubSync):
//   - config()                  — return current config
//   - saveConfig({...})         — persist config
//   - status()                  — { configured, queueSize, lastSyncTs, lastError }
//   - pullAll()                 — fetch data/<brand>/data.json for each brand,
//                                 merge into state (call logs, overrides, deletes)
//   - pushAll(force)            — write all 4 brands' data.json (batched)
//   - maybeAutoCommit()         — called after every state-mutation; checks
//                                 thresholds and triggers pushAll if needed
//   - markDirty()               — marks the in-memory queue dirty (sets
//                                 pendingSince if unset)
//
// Depends on the app.js global `state` object, BRANDS map, and saveState().
// ============================================================================

(function () {
  'use strict';

  const CFG_KEY = 'cc_github_sync';
  const DEFAULT_BRANCH = 'data-log';
  const DEFAULT_BATCH_THRESHOLD = 10;          // calls
  const DEFAULT_BATCH_INTERVAL_MS = 60 * 60e3; // 60 min
  const API = 'https://api.github.com';

  // ---- config persistence ----
  function loadConfig() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      const cfg = raw ? JSON.parse(raw) : {};
      return Object.assign({
        token: '',
        owner: 'trini3holdings',
        repo: 'call-coach',
        branch: DEFAULT_BRANCH,
        batchThreshold: DEFAULT_BATCH_THRESHOLD,
        batchIntervalMs: DEFAULT_BATCH_INTERVAL_MS,
        pendingSince: 0,
        callsSinceLastPush: 0,
        lastSyncTs: 0,
        lastError: '',
        pulledShas: {}
      }, cfg);
    } catch (e) {
      return {
        token: '', owner: 'trini3holdings', repo: 'call-coach', branch: DEFAULT_BRANCH,
        batchThreshold: DEFAULT_BATCH_THRESHOLD, batchIntervalMs: DEFAULT_BATCH_INTERVAL_MS,
        pendingSince: 0, callsSinceLastPush: 0, lastSyncTs: 0, lastError: '', pulledShas: {}
      };
    }
  }

  function saveConfig(partial) {
    const cur = loadConfig();
    const next = Object.assign({}, cur, partial || {});
    try { localStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  function configured() {
    const c = loadConfig();
    return !!(c.token && c.owner && c.repo && c.branch);
  }

  // ---- low-level GitHub API ----
  async function ghFetch(path, opts) {
    const c = loadConfig();
    if (!c.token) throw new Error('No GitHub token configured');
    const url = path.startsWith('http') ? path : (API + path);
    // Deep-merge headers so callers can add Content-Type without wiping Authorization.
    const baseHeaders = {
      'Authorization': 'token ' + c.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    const callerHeaders = (opts && opts.headers) || {};
    const finalOpts = Object.assign({}, opts || {}, {
      headers: Object.assign({}, baseHeaders, callerHeaders)
    });
    const res = await fetch(url, finalOpts);
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      throw new Error('GitHub ' + res.status + ': ' + body.slice(0, 200));
    }
    return res.json();
  }

  function b64encode(str) {
    // UTF-8 safe base64 encode
    return btoa(unescape(encodeURIComponent(str)));
  }

  function b64decode(str) {
    try { return decodeURIComponent(escape(atob(str.replace(/\n/g, '')))); }
    catch (e) { return atob(str.replace(/\n/g, '')); }
  }

  async function getFile(brand) {
    const c = loadConfig();
    const path = 'data/' + brand + '/data.json';
    try {
      const res = await ghFetch('/repos/' + c.owner + '/' + c.repo + '/contents/' + path + '?ref=' + encodeURIComponent(c.branch));
      const content = b64decode(res.content || '');
      let parsed;
      try { parsed = JSON.parse(content); } catch (e) { parsed = null; }
      return { sha: res.sha, data: parsed };
    } catch (e) {
      // 404 means file does not exist on this branch yet — return empty shell
      if (/404/.test(e.message)) return { sha: null, data: null };
      throw e;
    }
  }

  async function putFile(brand, data, sha, message) {
    const c = loadConfig();
    const path = 'data/' + brand + '/data.json';
    const body = {
      message: message || ('chore(data): update ' + brand + ' @ ' + new Date().toISOString()),
      content: b64encode(JSON.stringify(data, null, 2)),
      branch: c.branch
    };
    if (sha) body.sha = sha;
    return ghFetch('/repos/' + c.owner + '/' + c.repo + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  // ---- branch bootstrap (creates data-log off main if missing) ----
  async function ensureBranch() {
    const c = loadConfig();
    try {
      await ghFetch('/repos/' + c.owner + '/' + c.repo + '/branches/' + encodeURIComponent(c.branch));
      return true; // exists
    } catch (e) {
      if (!/404/.test(e.message)) throw e;
      // Branch missing — create from main
      const mainRef = await ghFetch('/repos/' + c.owner + '/' + c.repo + '/git/ref/heads/main');
      await ghFetch('/repos/' + c.owner + '/' + c.repo + '/git/refs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'refs/heads/' + c.branch, sha: mainRef.object.sha })
      });
      return true;
    }
  }

  // ---- data extraction from app state ----
  function brandSlugs() {
    if (typeof BRANDS !== 'object') return [];
    return Object.keys(BRANDS).filter(s => BRANDS[s] && BRANDS[s].active !== false);
  }

  function callsForBrand(slug) {
    return (state.calls || []).filter(c => (c.brand || state.brand) === slug);
  }

  function overridesForBrand(slug) {
    // prospectOverrides is keyed by domain — and overrides are not brand-tagged.
    // We dump ALL overrides into each brand file's overrides field; on pull we
    // merge by key, last-write-wins.
    return state.prospectOverrides || {};
  }

  function deletionsForBrand(slug) {
    return state.deletedProspectKeys || {};
  }

  function buildBrandPayload(slug) {
    return {
      brand: slug,
      meta: {
        version: '3.10.0',
        last_updated: new Date().toISOString(),
        caller: state.caller || 'unknown'
      },
      call_logs: callsForBrand(slug),
      prospect_overrides: overridesForBrand(slug),
      deleted_prospects: deletionsForBrand(slug)
    };
  }

  // ---- pull (read from GitHub, merge into local state) ----
  async function pullAll() {
    if (!configured()) throw new Error('GitHub sync not configured');
    await ensureBranch();
    const c = loadConfig();
    const slugs = brandSlugs();
    const pulled = { calls: 0, overrides: 0, deletes: 0, brands: 0 };
    const shas = Object.assign({}, c.pulledShas);

    for (const slug of slugs) {
      const file = await getFile(slug);
      if (!file.data) { shas[slug] = null; continue; }
      pulled.brands++;
      shas[slug] = file.sha;

      // Merge call logs by ts — only add new ones
      const seenTs = new Set((state.calls || []).map(c => c.ts));
      (file.data.call_logs || []).forEach(call => {
        if (!seenTs.has(call.ts)) {
          state.calls.push(call);
          seenTs.add(call.ts);
          pulled.calls++;
        }
      });

      // Merge overrides — last-write-wins by ts (remote wins if newer)
      const remoteOv = file.data.prospect_overrides || {};
      state.prospectOverrides = state.prospectOverrides || {};
      Object.keys(remoteOv).forEach(k => {
        const local = state.prospectOverrides[k];
        const remote = remoteOv[k];
        const localTs = (local && local._ts) || 0;
        const remoteTs = (remote && remote._ts) || 0;
        if (!local || remoteTs > localTs) {
          state.prospectOverrides[k] = remote;
          pulled.overrides++;
        }
      });

      // Merge deletions — union (remote wins if newer)
      const remoteDel = file.data.deleted_prospects || {};
      state.deletedProspectKeys = state.deletedProspectKeys || {};
      Object.keys(remoteDel).forEach(k => {
        const local = state.deletedProspectKeys[k];
        const remote = remoteDel[k];
        const localTs = (local && local.ts) || 0;
        const remoteTs = (remote && remote.ts) || 0;
        if (!local || remoteTs > localTs) {
          state.deletedProspectKeys[k] = remote;
          pulled.deletes++;
        }
      });
    }

    saveConfig({ pulledShas: shas, lastSyncTs: Date.now(), lastError: '' });
    if (typeof saveState === 'function') saveState();
    if (typeof mergeProspects === 'function') mergeProspects();
    if (typeof renderProspectPicker === 'function') renderProspectPicker();
    return pulled;
  }

  // ---- push (write to GitHub) ----
  async function pushAll(force) {
    if (!configured()) throw new Error('GitHub sync not configured');
    const c = loadConfig();
    if (!force && c.callsSinceLastPush === 0) {
      // Nothing to push
      return { pushed: 0, skipped: 'no changes' };
    }
    await ensureBranch();
    const slugs = brandSlugs();
    let pushed = 0;
    const newShas = Object.assign({}, c.pulledShas);

    for (const slug of slugs) {
      const payload = buildBrandPayload(slug);
      const sha = c.pulledShas[slug] || null;
      try {
        const res = await putFile(slug, payload, sha,
          'chore(data): ' + slug + ' (' + (payload.call_logs.length) + ' calls)');
        if (res && res.content && res.content.sha) {
          newShas[slug] = res.content.sha;
          pushed++;
        }
      } catch (e) {
        // SHA conflict — try to refetch SHA once
        if (/409|422/.test(e.message)) {
          const cur = await getFile(slug);
          newShas[slug] = cur.sha;
          const res = await putFile(slug, payload, cur.sha,
            'chore(data): ' + slug + ' (rebased)');
          if (res && res.content && res.content.sha) {
            newShas[slug] = res.content.sha;
            pushed++;
          }
        } else {
          throw e;
        }
      }
    }

    saveConfig({
      pulledShas: newShas,
      lastSyncTs: Date.now(),
      pendingSince: 0,
      callsSinceLastPush: 0,
      lastError: ''
    });
    return { pushed: pushed, brands: slugs.length };
  }

  // ---- batched auto-commit trigger ----
  function markDirty() {
    const c = loadConfig();
    saveConfig({
      pendingSince: c.pendingSince || Date.now(),
      callsSinceLastPush: (c.callsSinceLastPush || 0) + 1
    });
  }

  let autoCommitInFlight = false;
  async function maybeAutoCommit() {
    if (!configured()) return;
    if (autoCommitInFlight) return;
    const c = loadConfig();
    const now = Date.now();
    const overThreshold = c.callsSinceLastPush >= c.batchThreshold;
    const overInterval = c.pendingSince && (now - c.pendingSince >= c.batchIntervalMs);
    if (!overThreshold && !overInterval) return;
    autoCommitInFlight = true;
    try {
      const res = await pushAll(false);
      if (typeof showToast === 'function' && res.pushed > 0) {
        showToast('Auto-saved to GitHub · ' + res.pushed + ' brand file' + (res.pushed > 1 ? 's' : ''));
      }
    } catch (e) {
      saveConfig({ lastError: String(e.message || e) });
      console.warn('GitHub auto-commit failed:', e);
    } finally {
      autoCommitInFlight = false;
    }
  }

  function status() {
    const c = loadConfig();
    return {
      configured: configured(),
      pendingCalls: c.callsSinceLastPush || 0,
      batchThreshold: c.batchThreshold,
      batchIntervalMs: c.batchIntervalMs,
      pendingSince: c.pendingSince,
      lastSyncTs: c.lastSyncTs,
      lastError: c.lastError,
      branch: c.branch,
      repo: c.owner + '/' + c.repo
    };
  }

  // Hourly tick — if interval elapsed, force a push
  setInterval(() => { maybeAutoCommit(); }, 5 * 60 * 1000);

  // Expose
  window.GitHubSync = {
    config: loadConfig,
    saveConfig: saveConfig,
    status: status,
    pullAll: pullAll,
    pushAll: pushAll,
    markDirty: markDirty,
    maybeAutoCommit: maybeAutoCommit,
    configured: configured
  };
})();
