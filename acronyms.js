/* ============================================================
 * acronyms.js — v3.7.1
 *
 * Glossary + acronym/phrase expander.
 *
 * Cold-call prospects (Community Managers, business owners, etc.)
 * shouldn't be expected to know marketing/dev acronyms. This module
 * expands every standalone acronym AND every multi-word jargon phrase
 * in user-visible text into a plain-English form, with the original
 * acronym/phrase preserved in parens so the caller still recognises
 * it on their screen.
 *
 * Public surface:
 *   window.CCAcronyms.GLOSSARY              — map of acronym -> plain phrase
 *   window.CCAcronyms.PHRASES               — map of jargon phrase -> plain phrase
 *   window.CCAcronyms.expandAcronyms(text)  — HTML-safe full expansion (acronyms + phrases)
 *   window.CCAcronyms.expandLabel(text)     — short-form expansion for tight stat labels
 *
 * v3.7.1: +52 new acronyms (PAS, NEPQ, CTR, ROAS, TLD, FBO, MRO, FET,
 *         TOFU/MOFU/BOFU, ICP, MQL, MVP, CRM, USP, DM, VP, CEO, HQ, LLC,
 *         BBB, TTI, DOM, FID, LCP, FCP, CLS, INP, TTFB, UX, UI, WP, SERP,
 *         GAF, ERP, AMP, AE, MEL, AOG, plurals, etc.) + 14 phrase patterns
 *         (above the fold, hero section, decision-maker, no-show, gatekeeper,
 *         social proof, click-through, cross-sell, paid traffic, organic
 *         traffic, retargeting, funnel, urgency, decoy).
 *
 * Notes:
 *   - Operates on plain text. Skips content inside HTML tags or inside <a>...</a>.
 *     We do that by running on the raw string BEFORE any HTML composition is done,
 *     or by being careful in the renderer to only feed plain text in.
 *   - First occurrence in a string becomes "Long Form (ACR)".
 *     Subsequent occurrences in the same string stay as "ACR".
 *   - Detection uses word-boundary regex with case-sensitive match on the acronym
 *     so e.g. "API" matches but "Api" does not (avoids polluting names like "Apinia").
 *   - PHRASES are case-INSENSITIVE so "above the fold" and "Above the Fold" both match.
 * ============================================================ */

(function (root) {
  'use strict';

  const GLOSSARY = {
    // === Original 40 entries (v3.7) ===
    'VDP':   'Vehicle Detail Page',
    'PDP':   'Product Detail Page',
    'CTA':   'Call-To-Action button',
    'CTAs':  'Call-To-Action buttons',
    'CPC':   'Cost Per Click',
    'CPCs':  'Cost Per Click rates',
    'GBP':   'Google Business Profile',
    'LSA':   'Local Service Ads',
    'LSAs':  'Local Service Ads',
    'LP':    'Landing Page',
    'CRO':   'Conversion Rate Optimization',
    'PPC':   'Pay-Per-Click ads',
    'SEO':   'Search Engine Optimization',
    'AOV':   'Average Order Value',
    'LTV':   'Lifetime Value',
    'CPL':   'Cost Per Lead',
    'KPI':   'Key Performance Indicator',
    'KPIs':  'Key Performance Indicators',
    'SAB':   'Service-Area Business',
    'NAP':   'Name / Address / Phone listing',
    'TCPA':  'phone-call consent rules',
    'SMS':   'text message',
    'UTM':   'tracking tag',
    'API':   'integration',
    'CMS':   'content system',
    'TZ':    'timezone',
    'FAQ':   'Frequently Asked Questions',
    'FAQs':  'Frequently Asked Questions',
    'EOQ':   'end of quarter',
    'EOY':   'end of year',
    'HNW':   'high-net-worth client',
    'ROI':   'Return On Investment',
    'CAC':   'Cost to Acquire a Customer',
    'MRR':   'Monthly Recurring Revenue',
    'ARR':   'Annual Recurring Revenue',
    'B2B':   'business-to-business',
    'B2C':   'business-to-consumer',
    'CDN':   'content delivery network',
    'OBJ':   'Objection',
    'VM':    'Voicemail',
    'NA':    'No Answer',
    'HU':    'Hung Up',
    'NI':    'Not Interested',
    'PP':    'Pitched & Passed',
    'BK':    'Audit Booked',
    'SH':    'Audit Showed',
    'CL':    'Closed',

    // === v3.7.1 additions — sales/copy frameworks ===
    'PAS':   'Problem-Agitate-Solution framework',
    'NEPQ':  'Neuro-Emotional Persuasion Questioning method',
    'ROAS':  'Return On Ad Spend',
    'CTR':   'Click-Through Rate',
    'USP':   'Unique Selling Proposition',

    // === v3.7.1 — funnel/lead jargon ===
    'TOFU':  'top-of-funnel (cold awareness)',
    'MOFU':  'middle-of-funnel (engaged research)',
    'BOFU':  'bottom-of-funnel (ready to buy)',
    'ICP':   'Ideal Customer Profile',
    'MQL':   'Marketing Qualified Lead',
    'SDR':   'Sales Development Rep',
    'BDR':   'Business Development Rep',

    // === v3.7.1 — business / org ===
    'CEO':   'Chief Executive Officer',
    'VP':    'Vice President',
    'GM':    'General Manager',
    'HQ':    'Headquarters',
    'LLC':   'Limited Liability Company',
    'BBB':   'Better Business Bureau',
    'CRM':   'Customer Relationship system',
    'ERP':   'Enterprise business software',
    'MVP':   'Minimum Viable Product',
    'NPS':   'Net Promoter Score',
    'CSAT':  'Customer Satisfaction score',

    // === v3.7.1 — web/dev jargon (Core Web Vitals + page health) ===
    'SERP':  'Search Engine Results Page',
    'TLD':   'top-level domain (.com / .net / etc.)',
    'WP':    'WordPress',
    'UX':    'User Experience',
    'UI':    'User Interface',
    'DOM':   'page structure load',
    'TTI':   'Time To Interactive (load speed)',
    'TTFB':  'Time To First Byte (server speed)',
    'LCP':   'Largest Contentful Paint (load speed)',
    'FCP':   'First Contentful Paint (load speed)',
    'CLS':   'Cumulative Layout Shift (page stability)',
    'FID':   'First Input Delay (responsiveness)',
    'INP':   'Interaction-to-Next-Paint (responsiveness)',
    'AMP':   'Accelerated Mobile Pages',
    'DA':    'Domain Authority',
    'PA':    'Page Authority',

    // === v3.7.1 — social/contact channels ===
    'DM':    'Direct Message (Instagram/social)',
    'DMs':   'Direct Messages',

    // === v3.7.1 — roofing-specific ===
    'GAF':   'top shingle manufacturer',
    'TPO':   'TPO flat-roof membrane',
    'EPDM':  'EPDM rubber roofing',

    // === v3.7.1 — aviation-specific (ConversionJet) ===
    'FBO':   'Fixed-Base Operator (private terminal)',
    'MRO':   'Maintenance, Repair & Overhaul shop',
    'FET':   'Federal Excise Tax surcharge',
    'AOG':   'Aircraft On Ground (urgent grounded jet)',
    'MEL':   'Minimum Equipment List (jet dispatch rule)',

    // === v3.7.1 — call status (extends VM/NA/HU stack) ===
    'CB':    'Callback'
  };

  // ----- Multi-word jargon phrases (case-insensitive) -----
  const PHRASES = {
    'above the fold':   'top of the page (above the fold)',
    'below the fold':   'lower on the page (below the fold)',
    'hero section':     'top banner (hero section)',
    'hero image':       'top banner image (hero image)',
    'decision-makers':  'the people who can say yes (decision-makers)',
    'decision-maker':   'the person who can say yes (decision-maker)',
    'decision makers':  'the people who can say yes (decision-makers)',
    'decision maker':   'the person who can say yes (decision-maker)',
    'no-shows':         'booked but didn\'t show (no-shows)',
    'no shows':         'booked but didn\'t show (no-shows)',
    'no-show':          'booked but didn\'t show (no-show)',
    'no show':          'booked but didn\'t show (no-show)',
    'gatekeeper':       'receptionist or filter (gatekeeper)',
    'social proof':     'reviews/testimonials (social proof)',
    'click-through':    'click rate (click-through)',
    'click through':    'click rate (click-through)',
    'cross-sell':       'sell related service (cross-sell)',
    'paid traffic':     'visitors from ads (paid traffic)',
    'organic traffic':  'visitors from search (organic traffic)',
    'retargeting':      'ads that follow visitors (retargeting)',
    'lookalike':        'similar-audience targeting (lookalike)',
    'lead magnet':      'free download offer (lead magnet)',
    'core web vitals':  'Google page-speed scores (Core Web Vitals)'
  };

  // Short labels (for stat tiles where space is tight)
  const SHORT_LABELS = {
    'CTA':  'Action button',
    'VDP':  'Vehicle page',
    'PDP':  'Product page',
    'CPC':  'Click cost',
    'GBP':  'Google profile',
    'LSA':  'Local Service Ads',
    'LP':   'Landing page',
    'CRO':  'Conversion rate',
    'PPC':  'Paid ads',
    'SEO':  'Search ranking',
    'AOV':  'Avg order',
    'LTV':  'Customer value',
    'CPL':  'Lead cost',
    'KPI':  'Key metric',
    'NAP':  'Name/Address/Phone',
    'FAQ':  'FAQ',
    'API':  'integration',
    'ROI':  'Return',
    'CAC':  'Acquisition cost',
    'MRR':  'Monthly revenue',
    'ARR':  'Annual revenue',
    // v3.7.1 short forms
    'CTR':  'Click rate',
    'ROAS': 'Ad return',
    'USP':  'Selling point',
    'ICP':  'Ideal customer',
    'MQL':  'Qualified lead',
    'NPS':  'Promoter score',
    'CSAT': 'CSAT score',
    'SERP': 'Search results',
    'UX':   'User experience',
    'UI':   'User interface',
    'DM':   'Direct Message',
    'BBB':  'Better Business Bureau',
    // v3.8.4 — objection-category humanizers (used by quick-comeback bar)
    'NOT_INTERESTED': 'Not interested',
    'EMAIL_INSTEAD':  'Email instead',
    'ADS_WORK':       'Ads already work',
    'REBUILT':        'Already rebuilt',
    'PRICE':          'Price',
    'PARTNER':        'Partner / spouse',
    'BROKERS':        'Use brokers',
    'AGENCY':         'Have an agency',
    'CALLBACK':       'Call me back',
    'SEND_INFO':      'Send info',
    'TIMING':         'Bad timing',
    'INHOUSE':        'In-house already',
    'BUDGET':         'No budget',
    'NO_PHONE':       'No phone',
    'GHOST':          'Ghosted prior',
    'CEO':  'CEO',
    'VP':   'VP',
    'GM':   'GM',
    'HQ':   'HQ',
    'LLC':  'LLC',
    'FBO':  'Private terminal',
    'TLD':  'Domain ending',
    'GAF':  'GAF shingles'
  };

  // Compile one big regex of all acronym keys, longest first so e.g.
  // "CTAs" (length 4) is tried before "CTA" (length 3).
  const KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  const ACR_RE = new RegExp('\\b(' + KEYS.join('|') + ')\\b', 'g');

  // Compile phrases regex. Longest first to avoid "hero" matching inside "hero section".
  const PHRASE_KEYS = Object.keys(PHRASES).sort((a, b) => b.length - a.length);
  // Escape regex special chars in phrases
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  const PHRASE_RE = new RegExp('\\b(' + PHRASE_KEYS.map(escRe).join('|') + ')\\b', 'gi');

  /**
   * Expand acronyms AND phrases in `text`. Returns plain text (NOT HTML).
   * First occurrence of each → "Long Form (ACR)". Subsequent → "ACR".
   *
   * Use this on plain prose BEFORE building HTML. If you feed it raw HTML,
   * it will not damage tag names (they're not in the glossary) but may touch
   * acronyms inside href/title attributes — so prefer running it before
   * concatenating into HTML.
   */
  function expandAcronyms(text) {
    if (!text || typeof text !== 'string') return text;
    const seen = new Set();
    // Pass 1: multi-word phrases (case-insensitive). Replace each phrase only
    // once per string. Phrase replacements already include the original term
    // in parens, so we just substitute on first occurrence.
    let out = text.replace(PHRASE_RE, (match) => {
      const key = match.toLowerCase();
      const seenKey = 'PHRASE::' + key;
      if (seen.has(seenKey)) return match;
      seen.add(seenKey);
      const replacement = PHRASES[key];
      if (!replacement) return match;
      return replacement;
    });
    // Pass 2: case-sensitive acronyms.
    out = out.replace(ACR_RE, (match) => {
      if (seen.has(match)) return match;
      seen.add(match);
      const longForm = GLOSSARY[match];
      if (!longForm) return match;
      return longForm + ' (' + match + ')';
    });
    return out;
  }

  /**
   * Expand a SHORT label (for stat tiles, dropdowns). Returns the
   * short, friendly form with no parens. Falls back to expandAcronyms
   * for any acronym not in SHORT_LABELS.
   */
  function expandLabel(text) {
    if (!text || typeof text !== 'string') return text;
    // First check if the WHOLE label is a single acronym we have a short form for.
    if (SHORT_LABELS[text]) return SHORT_LABELS[text];
    // Otherwise do per-word substitution.
    return text.replace(ACR_RE, (m) => SHORT_LABELS[m] || GLOSSARY[m] || m);
  }

  root.CCAcronyms = {
    GLOSSARY: GLOSSARY,
    PHRASES: PHRASES,
    SHORT_LABELS: SHORT_LABELS,
    expandAcronyms: expandAcronyms,
    expandLabel: expandLabel
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
