/* ============================================================
 * Call Coach v3.6 — Brand Data Validators
 * ----------------------------------------------------------------
 * Single source of truth for normalizing every brand JSON file
 * into the CANONICAL shape the rest of the app expects.
 *
 * Each normalize* function:
 *   - Accepts any of the documented shape variations
 *   - Returns { ok: bool, value: <canonical>, errors: [string], warnings: [string] }
 *   - Never throws on bad input
 *
 * Canonical shapes (what the rest of the app must receive):
 *
 *  prospects:   Array<{ id: string, n?: number, company?, domain?, market?, phone?,
 *                       email?, risk?, is_client?, issues: string[], ...orig }>
 *               (every prospect guaranteed to have a usable `.id` AND a numeric `.n`)
 *
 *  scripts:     { _meta: { target_length_sec, audit_value, industry?, register? },
 *                 A: { name, desc, beats: [...] },
 *                 B: { name, desc, beats: [...] },
 *                 C: { name, desc, beats: [...] } }
 *
 *  objections:  Array<{ cat: string, q: string, a: string,
 *                       framework?: string, alternates?: string[] }>
 *
 *  callIntel:   { primary_blocks: [...], avoid_windows: [...], best_days: [...], ... }
 *               (passed through with light shape check)
 *
 *  marketCpc:   { _default: { cpc_low, cpc_high, vol }, [marketName]: {...}, ... }
 *
 *  hotList:     { tier_1: [...], tier_2: [...], tier_3: [...], tier_4: [...], no_phone: [...] }
 *               (unified tier names across all brands)
 *
 * ============================================================ */

(function (root) {
  'use strict';

  // -------- helpers --------
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function isArr(x) { return Array.isArray(x); }
  function safeStr(x, fallback) {
    if (x === null || x === undefined) return fallback || '';
    return String(x);
  }

  function makeResult(value, errors, warnings) {
    return {
      ok: !errors.length,
      value: value,
      errors: errors || [],
      warnings: warnings || []
    };
  }

  // -------- PROSPECTS --------
  // Accept:
  //   A. Array<prospect>           (CE / CJ / RME)
  //   B. { prospects: [...] }      (CritterClick)
  //   C. { data: [...] }           (defensive)
  // Each prospect normalized:
  //   - .id always set (uses existing .id, or 'n-{n}', or domain-slug, or 'p-{idx}')
  //   - .n always set as integer (uses existing .n, or index+1)
  //   - .issues always an array (built from leak_1/leak_2/leak_3 if missing)
  function normalizeProspects(raw, brandSlug) {
    const errors = [];
    const warnings = [];
    let arr;

    if (isArr(raw)) {
      arr = raw;
    } else if (isObj(raw) && isArr(raw.prospects)) {
      arr = raw.prospects;
      warnings.push('prospects.json used wrapper shape {prospects:[]} \u2014 unwrapped');
    } else if (isObj(raw) && isArr(raw.data)) {
      arr = raw.data;
      warnings.push('prospects.json used wrapper shape {data:[]} \u2014 unwrapped');
    } else {
      errors.push('prospects.json: expected an array or {prospects:[]} wrapper, got ' + (raw === null ? 'null' : typeof raw));
      return makeResult([], errors, warnings);
    }

    if (!arr.length) warnings.push('prospects.json contained 0 prospects');

    const normalized = arr.map(function (p, idx) {
      if (!isObj(p)) return null;
      const out = Object.assign({}, p);

      // Unified numeric .n
      if (typeof out.n !== 'number' || isNaN(out.n)) {
        out.n = idx + 1;
      }
      // Unified string .id
      if (!out.id) {
        if (p.domain) out.id = String(p.domain).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        else if (p.company) out.id = String(p.company).toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        else out.id = (brandSlug || 'p') + '-' + out.n;
      } else {
        out.id = String(out.id);
      }

      // Unified .issues array (RME uses leak_1/leak_2/leak_3)
      if (!isArr(out.issues)) {
        const leaks = [];
        if (p.leak_1) leaks.push(p.leak_1);
        if (p.leak_2) leaks.push(p.leak_2);
        if (p.leak_3) leaks.push(p.leak_3);
        if (leaks.length) out.issues = leaks;
        else if (typeof out.issues === 'string') out.issues = [out.issues];
        else out.issues = [];
      }

      // Coerce truthy booleans
      out.is_client = !!out.is_client;
      return out;
    }).filter(Boolean);

    return makeResult(normalized, errors, warnings);
  }

  // -------- SCRIPTS --------
  // Accept:
  //   A. { brand, audit_value, target_length_sec, variants: { A, B, C } }  (CE/CJ/CC)
  //   B. { _meta: {...}, A, B, C }                                          (RME)
  // Canonical:
  //   { _meta: {target_length_sec, audit_value, industry?, register?},
  //     A: {name, desc, beats:[]}, B: {...}, C: {...} }
  function normalizeScripts(raw) {
    const errors = [];
    const warnings = [];
    if (!isObj(raw)) {
      errors.push('scripts.json: expected an object, got ' + (raw === null ? 'null' : typeof raw));
      return makeResult({ _meta: { target_length_sec: 220, audit_value: 0 } }, errors, warnings);
    }

    let variantsSrc;
    let metaSrc;
    if (raw.variants && isObj(raw.variants)) {
      variantsSrc = raw.variants;
      metaSrc = {
        target_length_sec: raw.target_length_sec || 220,
        audit_value: raw.audit_value || 0,
        industry: raw.industry,
        register: raw.register
      };
    } else if (raw.A || raw.B || raw.C) {
      variantsSrc = {};
      ['A', 'B', 'C'].forEach(function (k) { if (raw[k]) variantsSrc[k] = raw[k]; });
      const m = raw._meta || {};
      metaSrc = {
        target_length_sec: m.target_length_sec || raw.target_length_sec || 220,
        audit_value: m.audit_value || raw.audit_value || 0,
        industry: m.industry || raw.industry,
        register: m.register || raw.register
      };
      warnings.push('scripts.json used flat A/B/C shape \u2014 wrapped into .variants');
    } else {
      errors.push('scripts.json: no variants found. Expected either .variants or top-level A/B/C');
      return makeResult({ _meta: { target_length_sec: 220, audit_value: 0 } }, errors, warnings);
    }

    const out = { _meta: metaSrc };
    let hasAnyBeats = false;
    ['A', 'B', 'C'].forEach(function (k) {
      const v = variantsSrc[k];
      if (!v) return;
      if (!isObj(v)) {
        warnings.push('scripts.json variant ' + k + ': not an object, skipping');
        return;
      }
      // Map RME (variant_id/label/thesis) \u2192 (name/desc)
      const name = v.name || v.label || v.variant_id || ('Variant ' + k);
      const desc = v.desc || v.thesis || '';
      let beats = isArr(v.beats) ? v.beats : [];
      if (!beats.length) warnings.push('scripts.json variant ' + k + ': 0 beats');
      else hasAnyBeats = true;
      // Normalize each beat: ensure t is numeric, title/line are strings
      beats = beats.map(function (b, i) {
        if (!isObj(b)) return null;
        return Object.assign({}, b, {
          t: typeof b.t === 'number' ? b.t : parseInt(b.t || 0, 10) || 30,
          phase: safeStr(b.phase, ''),
          title: safeStr(b.title, 'Beat ' + (i + 1)),
          line: safeStr(b.line, ''),
          responses: isArr(b.responses) ? b.responses : [],
          followup: safeStr(b.followup, ''),
          note: safeStr(b.note, ''),
          objection_likely: b.objection_likely || b.expected_objection || null
        });
      }).filter(Boolean);
      out[k] = { name: name, desc: desc, beats: beats };
    });

    if (!hasAnyBeats) errors.push('scripts.json: no usable beats in any variant');
    if (!out.A && !out.B && !out.C) errors.push('scripts.json: no usable variants after normalization');

    return makeResult(out, errors, warnings);
  }

  // -------- OBJECTIONS --------
  // Accept:
  //   A. { objections: [{cat, q, a, framework?}, ...] }                  (CE/CJ)
  //   B. { brand, objections: [{cat, trigger, comeback, framework?}] }   (CritterClick \u2014 trigger/comeback)
  //   C. { _meta, CAT_NAME: { label, comebacks: [str,str], framework? }} (RME)
  //   D. [ { cat, q, a } ]                                                (plain array)
  // Canonical:
  //   Array<{ cat, q, a, framework?, alternates?: [string] }>
  function normalizeObjections(raw) {
    const errors = [];
    const warnings = [];

    // Shape D: plain array
    if (isArr(raw)) {
      const items = raw.filter(isObj).map(function (o) {
        return {
          cat: safeStr(o.cat, 'UNKNOWN'),
          q: safeStr(o.q || o.trigger || o.question, ''),
          a: safeStr(o.a || o.comeback || o.answer, ''),
          framework: o.framework || null,
          alternates: isArr(o.comebacks) ? o.comebacks.slice(1) : (isArr(o.alternates) ? o.alternates : [])
        };
      });
      if (!items.length) errors.push('objections.json: array contained 0 valid items');
      return makeResult(items, errors, warnings);
    }

    if (!isObj(raw)) {
      errors.push('objections.json: expected object or array, got ' + (raw === null ? 'null' : typeof raw));
      return makeResult([], errors, warnings);
    }

    // Shapes A or B: .objections array exists
    if (isArr(raw.objections)) {
      const items = raw.objections.filter(isObj).map(function (o) {
        // CritterClick uses trigger/comeback, CE/CJ use q/a
        const q = safeStr(o.q || o.trigger || o.question, '');
        const a = safeStr(o.a || o.comeback || o.answer, '');
        const alts = isArr(o.comebacks) ? o.comebacks.slice(o.a || o.comeback ? 1 : 0) : (isArr(o.alternates) ? o.alternates : []);
        return {
          cat: safeStr(o.cat, 'UNKNOWN'),
          q: q,
          a: a,
          framework: o.framework || null,
          alternates: alts
        };
      });
      if (!items.length) errors.push('objections.json: .objections array contained 0 valid items');
      // Warn if many items missing q or a
      const missingQ = items.filter(function (i) { return !i.q; }).length;
      const missingA = items.filter(function (i) { return !i.a; }).length;
      if (missingQ > items.length / 2) warnings.push('objections.json: ' + missingQ + '/' + items.length + ' items missing question/trigger');
      if (missingA > items.length / 2) warnings.push('objections.json: ' + missingA + '/' + items.length + ' items missing answer/comeback');
      return makeResult(items, errors, warnings);
    }

    // Shape C: { _meta, CAT_NAME: { label, comebacks: [] } }
    const items = [];
    Object.keys(raw).forEach(function (k) {
      if (k === '_meta' || k === 'brand' || k === '_doc') return;
      const v = raw[k];
      if (!isObj(v)) return;
      // Must have label/q/trigger AND comebacks/a/comeback
      const q = safeStr(v.label || v.q || v.trigger || v.question, '');
      let a = '';
      let alternates = [];
      if (isArr(v.comebacks) && v.comebacks.length) {
        a = safeStr(v.comebacks[0], '');
        alternates = v.comebacks.slice(1);
      } else {
        a = safeStr(v.a || v.comeback || v.answer, '');
      }
      if (!q && !a) return;
      items.push({
        cat: k,
        q: q,
        a: a,
        framework: v.framework || null,
        alternates: alternates
      });
    });
    if (!items.length) errors.push('objections.json: no recognizable objection categories found in object');
    return makeResult(items, errors, warnings);
  }

  // -------- CALL INTEL --------
  // Passthrough with shape check
  function normalizeCallIntel(raw) {
    const errors = [];
    const warnings = [];
    if (raw === null || raw === undefined) {
      warnings.push('call_intel.json missing \u2014 callability features disabled');
      return makeResult(null, errors, warnings);
    }
    if (!isObj(raw)) {
      errors.push('call_intel.json: expected object, got ' + typeof raw);
      return makeResult(null, errors, warnings);
    }
    if (!isArr(raw.primary_blocks)) warnings.push('call_intel.json: no primary_blocks array');
    return makeResult(raw, errors, warnings);
  }

  // -------- MARKET CPC --------
  // Accept: { City: priceObj } OR { _default, City: priceObj } OR { brand, _default, City: priceObj }
  // Canonical: { _default?, [city]: priceObj }
  function normalizeMarketCpc(raw) {
    const errors = [];
    const warnings = [];
    if (raw === null || raw === undefined) {
      warnings.push('market_cpc.json missing \u2014 CPC lookups will use defaults');
      return makeResult({}, errors, warnings);
    }
    if (!isObj(raw)) {
      errors.push('market_cpc.json: expected object, got ' + typeof raw);
      return makeResult({}, errors, warnings);
    }
    // Strip metadata keys, keep city entries + _default
    const out = {};
    const META_KEYS = ['brand', 'industry', 'currency', 'conversion_rate_baseline', '_note', '_meta'];
    Object.keys(raw).forEach(function (k) {
      if (META_KEYS.indexOf(k) >= 0) return;
      out[k] = raw[k];
    });
    return makeResult(out, errors, warnings);
  }

  // -------- HOT LIST --------
  // Accept any of:
  //   { tier_1_priority_calls, tier_2_call_with_caution, tier_3_solid_calls, tier_4_warm_calls, no_phone_email_path } (RME)
  //   { tier_1_high_risk_callable, tier_2_medium_risk_callable, tier_3_low_risk_callable, no_phone_skip }              (CC)
  //   { tier1_HIGH_risk_callable, tier2_MEDIUM_risk_callable }                                                          (CJ)
  //   missing entirely                                                                                                  (CE)
  // Canonical:
  //   { tier_1: [...], tier_2: [...], tier_3: [...], tier_4: [...], no_phone: [...] }
  function normalizeHotList(raw) {
    const errors = [];
    const warnings = [];
    const out = { tier_1: [], tier_2: [], tier_3: [], tier_4: [], no_phone: [] };
    if (raw === null || raw === undefined) {
      // not an error \u2014 brand may not have one yet
      return makeResult(out, errors, warnings);
    }
    if (!isObj(raw)) {
      errors.push('_hot_list.json: expected object, got ' + typeof raw);
      return makeResult(out, errors, warnings);
    }
    // Map any key matching pattern. Values may be a flat array OR
    // a dict {count, description, prospects: [...]} (CritterClick).
    Object.keys(raw).forEach(function (k) {
      let v = raw[k];
      if (!v) return;
      if (isObj(v) && isArr(v.prospects)) v = v.prospects;
      if (!isArr(v)) return;
      const lk = k.toLowerCase();
      if (/(tier[_-]?1|priority|high[_-]?risk)/.test(lk)) out.tier_1 = out.tier_1.concat(v);
      else if (/(tier[_-]?2|caution|medium[_-]?risk)/.test(lk)) out.tier_2 = out.tier_2.concat(v);
      else if (/(tier[_-]?3|solid|low[_-]?risk)/.test(lk)) out.tier_3 = out.tier_3.concat(v);
      else if (/(tier[_-]?4|warm)/.test(lk)) out.tier_4 = out.tier_4.concat(v);
      else if (/(no[_-]?phone|skip)/.test(lk)) out.no_phone = out.no_phone.concat(v);
    });
    return makeResult(out, errors, warnings);
  }

  // -------- TOP-LEVEL BRAND BUNDLE --------
  // Validates the full bundle, returns aggregated errors/warnings
  // brandSlug is used to prefix error messages
  function validateBrandBundle(brandSlug, raw) {
    const p = normalizeProspects(raw.prospects, brandSlug);
    const s = normalizeScripts(raw.scripts);
    const o = normalizeObjections(raw.objections);
    const c = normalizeCallIntel(raw.callIntel);
    const m = normalizeMarketCpc(raw.marketCpc);
    const h = normalizeHotList(raw.hotList);

    const prefix = function (label, arr) {
      return arr.map(function (e) { return '[' + brandSlug + '] ' + label + ': ' + e; });
    };

    const allErrors = [].concat(
      prefix('prospects', p.errors),
      prefix('scripts', s.errors),
      prefix('objections', o.errors),
      prefix('callIntel', c.errors),
      prefix('marketCpc', m.errors),
      prefix('hotList', h.errors)
    );
    const allWarnings = [].concat(
      prefix('prospects', p.warnings),
      prefix('scripts', s.warnings),
      prefix('objections', o.warnings),
      prefix('callIntel', c.warnings),
      prefix('marketCpc', m.warnings),
      prefix('hotList', h.warnings)
    );

    return {
      ok: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      value: {
        prospects: p.value,
        scripts: s.value,
        objections: o.value,
        callIntel: c.value,
        marketCpc: m.value,
        hotList: h.value
      }
    };
  }

  // -------- EXPORT --------
  const api = {
    normalizeProspects: normalizeProspects,
    normalizeScripts: normalizeScripts,
    normalizeObjections: normalizeObjections,
    normalizeCallIntel: normalizeCallIntel,
    normalizeMarketCpc: normalizeMarketCpc,
    normalizeHotList: normalizeHotList,
    validateBrandBundle: validateBrandBundle,
    version: '3.6.0'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CCValidators = api;
})(typeof window !== 'undefined' ? window : globalThis);
