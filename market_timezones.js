// ============================================================================
// MARKET → TIMEZONE LOOKUP
// Maps every metro across all 4 brands to an IANA timezone.
// Used by dashboard for "callable right now" + "next 2 hours" calculations.
// Reference timezone: America/Chicago (Tony in Dallas).
// ============================================================================

const MARKET_TZ = {
  // ===== TEXAS =====
  'Dallas-Fort Worth TX': 'America/Chicago',
  'Dallas TX': 'America/Chicago',
  'Fort Worth TX': 'America/Chicago',
  'DFW TX': 'America/Chicago',
  'Houston TX': 'America/Chicago',
  'Austin TX': 'America/Chicago',
  'San Antonio TX': 'America/Chicago',
  'El Paso TX': 'America/Denver',  // El Paso is Mountain TZ
  'Lubbock TX': 'America/Chicago',
  'Corpus Christi TX': 'America/Chicago',
  'McAllen TX': 'America/Chicago',
  'Tyler TX': 'America/Chicago',
  'Waco TX': 'America/Chicago',
  'Beaumont TX': 'America/Chicago',

  // ===== OKLAHOMA / CENTRAL =====
  'Oklahoma City OK': 'America/Chicago',
  'Tulsa OK': 'America/Chicago',
  'Nashville TN': 'America/Chicago',
  'Memphis TN': 'America/Chicago',
  'Knoxville TN': 'America/New_York',  // Eastern TN
  'New Orleans LA': 'America/Chicago',
  'Baton Rouge LA': 'America/Chicago',
  'Birmingham AL': 'America/Chicago',
  'Mobile AL': 'America/Chicago',
  'Little Rock AR': 'America/Chicago',
  'Jackson MS': 'America/Chicago',
  'Kansas City MO': 'America/Chicago',
  'St Louis MO': 'America/Chicago',
  'Saint Louis MO': 'America/Chicago',
  'Omaha NE': 'America/Chicago',
  'Wichita KS': 'America/Chicago',
  'Des Moines IA': 'America/Chicago',
  'Madison WI': 'America/Chicago',
  'Milwaukee WI': 'America/Chicago',
  'Minneapolis MN': 'America/Chicago',
  'St Paul MN': 'America/Chicago',
  'Chicago IL': 'America/Chicago',

  // ===== MOUNTAIN =====
  'Denver CO': 'America/Denver',
  'Colorado Springs CO': 'America/Denver',
  'Boulder CO': 'America/Denver',
  'Fort Collins CO': 'America/Denver',
  'Salt Lake City UT': 'America/Denver',
  'Albuquerque NM': 'America/Denver',
  'Santa Fe NM': 'America/Denver',
  'Boise ID': 'America/Boise',
  'Billings MT': 'America/Denver',
  'Cheyenne WY': 'America/Denver',

  // ===== ARIZONA (no DST) =====
  'Phoenix AZ': 'America/Phoenix',
  'Tucson AZ': 'America/Phoenix',
  'Mesa AZ': 'America/Phoenix',
  'Scottsdale AZ': 'America/Phoenix',
  'Flagstaff AZ': 'America/Phoenix',

  // ===== PACIFIC =====
  'Los Angeles CA': 'America/Los_Angeles',
  'San Diego CA': 'America/Los_Angeles',
  'San Francisco CA': 'America/Los_Angeles',
  'San Jose CA': 'America/Los_Angeles',
  'Sacramento CA': 'America/Los_Angeles',
  'Oakland CA': 'America/Los_Angeles',
  'Long Beach CA': 'America/Los_Angeles',
  'Bakersfield CA': 'America/Los_Angeles',
  'Fresno CA': 'America/Los_Angeles',
  'Riverside CA': 'America/Los_Angeles',
  'Anaheim CA': 'America/Los_Angeles',
  'Seattle WA': 'America/Los_Angeles',
  'Tacoma WA': 'America/Los_Angeles',
  'Spokane WA': 'America/Los_Angeles',
  'Portland OR': 'America/Los_Angeles',
  'Eugene OR': 'America/Los_Angeles',
  'Las Vegas NV': 'America/Los_Angeles',
  'Reno NV': 'America/Los_Angeles',

  // ===== EASTERN =====
  'New York NY': 'America/New_York',
  'NYC NY': 'America/New_York',
  'Buffalo NY': 'America/New_York',
  'Rochester NY': 'America/New_York',
  'Albany NY': 'America/New_York',
  'Boston MA': 'America/New_York',
  'Worcester MA': 'America/New_York',
  'Springfield MA': 'America/New_York',
  'Philadelphia PA': 'America/New_York',
  'Pittsburgh PA': 'America/New_York',
  'Washington DC': 'America/New_York',
  'Baltimore MD': 'America/New_York',
  'Annapolis MD': 'America/New_York',
  'Richmond VA': 'America/New_York',
  'Virginia Beach VA': 'America/New_York',
  'Norfolk VA': 'America/New_York',
  'Charlotte NC': 'America/New_York',
  'Raleigh NC': 'America/New_York',
  'Greensboro NC': 'America/New_York',
  'Durham NC': 'America/New_York',
  'Charleston SC': 'America/New_York',
  'Columbia SC': 'America/New_York',
  'Atlanta GA': 'America/New_York',
  'Savannah GA': 'America/New_York',
  'Augusta GA': 'America/New_York',
  'Jacksonville FL': 'America/New_York',
  'Miami FL': 'America/New_York',
  'Tampa FL': 'America/New_York',
  'Orlando FL': 'America/New_York',
  'St Petersburg FL': 'America/New_York',
  'Fort Lauderdale FL': 'America/New_York',
  'Indianapolis IN': 'America/Indiana/Indianapolis',
  'Columbus OH': 'America/New_York',
  'Cleveland OH': 'America/New_York',
  'Cincinnati OH': 'America/New_York',
  'Toledo OH': 'America/New_York',
  'Detroit MI': 'America/Detroit',
  'Grand Rapids MI': 'America/Detroit',
  'Louisville KY': 'America/New_York',
  'Lexington KY': 'America/New_York',
  'Hartford CT': 'America/New_York',
  'New Haven CT': 'America/New_York',
  'Newark NJ': 'America/New_York',
  'Jersey City NJ': 'America/New_York',
  'Providence RI': 'America/New_York',
  'Portland ME': 'America/New_York',
  'Manchester NH': 'America/New_York',
  'Burlington VT': 'America/New_York',
  'Wilmington DE': 'America/New_York',
  'Charleston WV': 'America/New_York',

  // ===== ALASKA / HAWAII =====
  'Anchorage AK': 'America/Anchorage',
  'Honolulu HI': 'Pacific/Honolulu',
};

// Fuzzy lookup — handles compound markets like "Boston MA | Springfield MA",
// "Austin TX — Central TX", "Seattle/Tacoma WA", etc.
function resolveMarketTZ(marketRaw) {
  if (!marketRaw || typeof marketRaw !== 'string') return null;
  const m = marketRaw.trim();
  if (!m || m === 'Unknown' || m === 'NOT FOUND') return null;

  // Direct hit
  if (MARKET_TZ[m]) return MARKET_TZ[m];

  // Try the first segment of a compound market
  const segments = m.split(/[\|\/]| — | - /).map(s => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (MARKET_TZ[seg]) return MARKET_TZ[seg];
  }

  // Try matching by state code fallback (last 2-3 chars)
  const stateMatch = m.match(/\b([A-Z]{2})\b\s*$/);
  if (stateMatch) {
    const state = stateMatch[1];
    const STATE_DEFAULT_TZ = {
      'TX': 'America/Chicago', 'OK': 'America/Chicago', 'AR': 'America/Chicago',
      'LA': 'America/Chicago', 'MS': 'America/Chicago', 'AL': 'America/Chicago',
      'TN': 'America/Chicago', 'MO': 'America/Chicago', 'IA': 'America/Chicago',
      'MN': 'America/Chicago', 'WI': 'America/Chicago', 'IL': 'America/Chicago',
      'KS': 'America/Chicago', 'NE': 'America/Chicago', 'ND': 'America/Chicago',
      'SD': 'America/Chicago',
      'CO': 'America/Denver', 'NM': 'America/Denver', 'UT': 'America/Denver',
      'WY': 'America/Denver', 'MT': 'America/Denver', 'ID': 'America/Boise',
      'AZ': 'America/Phoenix',
      'CA': 'America/Los_Angeles', 'WA': 'America/Los_Angeles',
      'OR': 'America/Los_Angeles', 'NV': 'America/Los_Angeles',
      'NY': 'America/New_York', 'PA': 'America/New_York', 'NJ': 'America/New_York',
      'CT': 'America/New_York', 'MA': 'America/New_York', 'RI': 'America/New_York',
      'VT': 'America/New_York', 'NH': 'America/New_York', 'ME': 'America/New_York',
      'MD': 'America/New_York', 'DE': 'America/New_York', 'DC': 'America/New_York',
      'VA': 'America/New_York', 'WV': 'America/New_York', 'NC': 'America/New_York',
      'SC': 'America/New_York', 'GA': 'America/New_York', 'FL': 'America/New_York',
      'KY': 'America/New_York', 'OH': 'America/New_York', 'MI': 'America/Detroit',
      'IN': 'America/Indiana/Indianapolis',
      'AK': 'America/Anchorage', 'HI': 'Pacific/Honolulu',
    };
    if (STATE_DEFAULT_TZ[state]) return STATE_DEFAULT_TZ[state];
  }

  return null;
}

// Compute local time HH:MM and weekday short name in a given IANA TZ.
function localTimeIn(tz, refDate = new Date()) {
  if (!tz) return null;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    const parts = fmt.formatToParts(refDate);
    const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
    const wd = parts.find(p => p.type === 'weekday').value;
    const minutesOfDay = h * 60 + m;
    return { h, m, minutesOfDay, weekday: wd, hhmm: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` };
  } catch (e) {
    return null;
  }
}

// Given a call_intel.json record and a Date (default now), determine status:
//   { status: 'prime' | 'soon' | 'avoid' | 'off' | 'ok', label, block }
// 'prime'  → inside a primary_block and best_days
// 'soon'   → will be inside a primary_block within `lookaheadMinutes` (default 120)
// 'avoid'  → inside avoid_windows OR on avoid_days
// 'off'    → no TZ resolvable
// 'ok'     → outside prime + outside avoid (neutral)
function callabilityStatus(callIntel, marketRaw, refDate = new Date(), lookaheadMinutes = 120) {
  if (!callIntel) return { status: 'off', label: 'No intel' };
  const tz = resolveMarketTZ(marketRaw);
  if (!tz) return { status: 'off', label: 'Unknown TZ' };
  const lt = localTimeIn(tz, refDate);
  if (!lt) return { status: 'off', label: 'TZ error' };

  const todayDay = lt.weekday;  // 'Mon', 'Tue', etc.

  const inWindow = (start, end, minutesOfDay) => {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const s = sh * 60 + sm, e = eh * 60 + em;
    return minutesOfDay >= s && minutesOfDay < e;
  };

  const avoidDays = (callIntel.avoid_days || []).map(d => d.day);
  const bestDays = callIntel.best_days || [];
  const primaryBlocks = callIntel.primary_blocks || [];
  const avoidWindows = callIntel.avoid_windows || [];

  // Avoid check first
  for (const aw of avoidWindows) {
    if (aw.day_filter && aw.day_filter !== todayDay) continue;
    if (inWindow(aw.start, aw.end, lt.minutesOfDay)) {
      return { status: 'avoid', label: aw.label || 'Avoid window', tz, localTime: lt.hhmm };
    }
  }
  if (avoidDays.includes(todayDay)) {
    return { status: 'avoid', label: `${todayDay} is a low-quality day`, tz, localTime: lt.hhmm };
  }

  // Prime check (best days + primary block)
  if (bestDays.length === 0 || bestDays.includes(todayDay)) {
    for (const pb of primaryBlocks) {
      const blockDays = pb.days || bestDays;
      if (!blockDays.includes(todayDay)) continue;
      if (inWindow(pb.start, pb.end, lt.minutesOfDay)) {
        return { status: 'prime', label: pb.label || 'Prime', block: pb, tz, localTime: lt.hhmm };
      }
    }
  }

  // Soon check (will hit prime within lookaheadMinutes today)
  if (bestDays.length === 0 || bestDays.includes(todayDay)) {
    for (const pb of primaryBlocks) {
      const blockDays = pb.days || bestDays;
      if (!blockDays.includes(todayDay)) continue;
      const [sh, sm] = pb.start.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const delta = startMin - lt.minutesOfDay;
      if (delta > 0 && delta <= lookaheadMinutes) {
        return { status: 'soon', label: `Opens in ${delta} min — ${pb.label || 'Block'}`, block: pb, tz, localTime: lt.hhmm, opensIn: delta };
      }
    }
  }

  return { status: 'ok', label: 'Neutral window', tz, localTime: lt.hhmm };
}

// Compute the next prime window's start (today or later) for a given call_intel.
// Returns { weekday, hhmm, opensInMinutes } or null.
function nextPrimeWindow(callIntel, marketRaw, refDate = new Date()) {
  const tz = resolveMarketTZ(marketRaw);
  if (!tz || !callIntel) return null;
  const lt = localTimeIn(tz, refDate);
  if (!lt) return null;

  const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayIdx = WEEKDAYS.indexOf(lt.weekday);
  const primaryBlocks = callIntel.primary_blocks || [];
  const bestDays = callIntel.best_days || [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkIdx = (todayIdx + dayOffset) % 7;
    const checkDay = WEEKDAYS[checkIdx];
    if (bestDays.length && !bestDays.includes(checkDay)) continue;
    for (const pb of primaryBlocks) {
      const blockDays = pb.days || bestDays;
      if (!blockDays.includes(checkDay)) continue;
      const [sh, sm] = pb.start.split(':').map(Number);
      const startMin = sh * 60 + sm;
      if (dayOffset === 0 && lt.minutesOfDay >= startMin) continue;  // already past today
      const minutesUntil = dayOffset * 24 * 60 + (startMin - lt.minutesOfDay);
      return {
        weekday: checkDay,
        hhmm: pb.start,
        label: pb.label,
        opensInMinutes: minutesUntil,
        tz,
        localTime: lt.hhmm,
      };
    }
  }
  return null;
}

window.MARKET_TZ = MARKET_TZ;
window.resolveMarketTZ = resolveMarketTZ;
window.localTimeIn = localTimeIn;
window.callabilityStatus = callabilityStatus;
window.nextPrimeWindow = nextPrimeWindow;
