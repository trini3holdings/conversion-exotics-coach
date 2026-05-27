/* ============================================================
 * acronyms.js — v3.7
 *
 * Glossary + acronym expander.
 *
 * Cold-call prospects (Community Managers, business owners, etc.)
 * shouldn't be expected to know marketing/dev acronyms. This module
 * expands every standalone acronym in user-visible text into a
 * plain-English form, with the original acronym preserved in parens
 * so the caller still recognises it on their screen.
 *
 * Public surface:
 *   window.CCAcronyms.GLOSSARY              — map of acronym -> plain phrase
 *   window.CCAcronyms.expandAcronyms(text)  — HTML-safe expansion
 *   window.CCAcronyms.expandLabel(text)     — short-form expansion for tight stat labels
 *
 * Notes:
 *   - Operates on plain text. Skips content inside HTML tags or inside <a>...</a>.
 *     We do that by running on the raw string BEFORE any HTML composition is done,
 *     or by being careful in the renderer to only feed plain text in.
 *   - First occurrence in a string becomes "Long Form (ACR)".
 *     Subsequent occurrences in the same string stay as "ACR".
 *   - Detection uses word-boundary regex with case-sensitive match on the acronym
 *     so e.g. "API" matches but "Api" does not (avoids polluting names like "Apinia").
 * ============================================================ */

(function (root) {
  'use strict';

  const GLOSSARY = {
    'VDP':   'Vehicle Detail Page',
    'PDP':   'Product Detail Page',
    'CTA':   'Call-To-Action button',
    'CTAs':  'Call-To-Action buttons',
    'CPC':   'Cost Per Click',
    'GBP':   'Google Business Profile',
    'LSA':   'Local Service Ads',
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
    'CL':    'Closed'
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
    'ARR':  'Annual revenue'
  };

  // Compile one big regex of all acronym keys, longest first so e.g.
  // "CTAs" (length 4) is tried before "CTA" (length 3).
  const KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  const ACR_RE = new RegExp('\\b(' + KEYS.join('|') + ')\\b', 'g');

  /**
   * Expand acronyms in `text`. Returns plain text (NOT HTML).
   * First occurrence → "Long Form (ACR)". Subsequent → "ACR".
   *
   * Use this on plain prose BEFORE building HTML. If you feed it raw HTML,
   * it will not damage tag names (they're not in the glossary) but may touch
   * acronyms inside href/title attributes — so prefer running it before
   * concatenating into HTML.
   */
  function expandAcronyms(text) {
    if (!text || typeof text !== 'string') return text;
    const seen = new Set();
    return text.replace(ACR_RE, (match) => {
      if (seen.has(match)) return match;
      seen.add(match);
      const longForm = GLOSSARY[match];
      if (!longForm) return match;
      return longForm + ' (' + match + ')';
    });
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
    SHORT_LABELS: SHORT_LABELS,
    expandAcronyms: expandAcronyms,
    expandLabel: expandLabel
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
