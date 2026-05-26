/* =========================================================
   Conversion Exotics · Call Coach
   Single-page app — script, timer, objections, session tracker
   ========================================================= */

// ---------- DATA ----------
const SCRIPTS = {
  A: {
    name: "Pattern Interrupt + City Anchor",
    beats: [
      {
        id: "open",
        name: "Open",
        time: "0:00 – 0:20",
        cue: "Disarm. Confirm right person.",
        lines: [
          "Hey — I know I'm calling out of the blue, so feel free to hang up on me.",
          "I'm not even sure you're the right person, but you guys run the Lambo and McLaren rentals out of [city], correct?"
        ],
        note: "Wait for confirmation. If wrong person — ask who runs marketing/website."
      },
      {
        id: "problem",
        name: "Problem",
        time: "0:20 – 0:50",
        cue: "Anchor the stat. Frame the leak.",
        lines: [
          "Cool. The reason I'm calling — we looked at the top 10 exotic rental markets (Miami, LA, Vegas, NYC, Houston, Dallas, Chicago, Atlanta, SF, Orlando).",
          "A 1-second mobile delay drops bookings about 32%. Most fleets we audit are leaking 70%+ of their mobile traffic before the form ever loads."
        ],
        note: "Stat first, market list second — credibility, then specificity."
      },
      {
        id: "agitation",
        name: "Agitation",
        time: "0:50 – 1:25",
        cue: "Ask the question that makes them think.",
        lines: [
          "I'm not saying that's you — but if it is, you're paying full ad cost and losing the booking before they even see the price.",
          "Out of curiosity, when's the last time someone actually stress-tested your booking flow on a phone, end to end?"
        ],
        note: "Pause. Don't fill the silence. Let them answer."
      },
      {
        id: "solution",
        name: "Solution",
        time: "1:25 – 2:00",
        cue: "Position narrow. One thing only.",
        lines: [
          "We do one thing — CRO audits for exotic and luxury rental fleets.",
          "We map every drop-off, fix the highest-leverage ones first, and the only metric we care about is more booked rentals per ad dollar."
        ],
        note: "Niche = authority. Resist the urge to mention ads/SEO/anything else."
      },
      {
        id: "audit",
        name: "Audit Offer",
        time: "2:00 – 2:45",
        cue: "Anchor $3K. Make free feel rare.",
        lines: [
          "I'd like to do a quick teardown of your site — we normally charge $3,000 for these.",
          "I'm doing five free ones this month for fleets in the top 10 markets. 30 minutes, screen-share, you keep everything we find. Worth a look?"
        ],
        note: "Industry range: $2,800–$85K. Anchor and scarcity together."
      },
      {
        id: "close",
        name: "Close",
        time: "2:45 – 3:30",
        cue: "Assume the booking. Offer two times.",
        lines: [
          "Cool. What's the best email to send the calendar to, and would Tuesday or Thursday next week work better?"
        ],
        note: "Capture email FIRST. Day-choice close. Don't ask 'does that work?'"
      }
    ]
  },
  B: {
    name: "Curiosity Hook + Mobile Leak",
    beats: [
      {
        id: "open",
        name: "Open",
        time: "0:00 – 0:25",
        cue: "Soft permission. Curiosity as problem.",
        lines: [
          "Hi there — Zack with Conversion Exotics. I was hoping you could help me for a sec.",
          "I'm not sure you're even the right person, but are you the one who'd notice if your mobile site was quietly bleeding Ferrari and Lambo bookings before people ever hit the form?"
        ],
        note: "The opener IS the problem. They have to answer one of three ways — all good for you."
      },
      {
        id: "problem",
        name: "Problem",
        time: "0:25 – 0:55",
        cue: "Name the trap.",
        lines: [
          "So here's what we keep seeing — a 1-second mobile delay drops bookings about 32%.",
          "Most exotic fleets we audit lose 70%+ of their mobile traffic before the form even loads. The site looks fine on desktop — that's the trap."
        ],
        note: "'Looks fine on desktop' is the line that disarms 'we just rebuilt it.'"
      },
      {
        id: "agitation",
        name: "Agitation",
        time: "0:55 – 1:30",
        cue: "Watching, not testing. Sensory framing.",
        lines: [
          "Out of curiosity — when's the last time you watched a real customer try to book a Huracán on their phone, start to finish?",
          "Most owners I talk to realize the leak only when we record the session for them."
        ],
        note: "'Watched' is more visceral than 'tested.' Use it."
      },
      {
        id: "solution",
        name: "Solution",
        time: "1:30 – 2:05",
        cue: "What we don't do = what we do.",
        lines: [
          "We're conversion specialists for exotic and luxury rental fleets only. We don't do ads. We don't do SEO.",
          "We find the leaks in your booking funnel, fix them in priority order, and what changes is — more booked rentals from the same traffic."
        ],
        note: "Negative positioning ('don't do ads') makes the positive ('booked rentals') hit harder."
      },
      {
        id: "audit",
        name: "Audit Offer",
        time: "2:05 – 2:50",
        cue: "Anchor + range + low-pressure 'keep it.'",
        lines: [
          "What I'd do is run a free audit on your site — we normally charge $3,000 (industry runs $2,800 to $85,000).",
          "You'd keep the deck whether you ever work with us or not. We have a strategist named [Strategist Name] who walks you through it. Open to a 30-min look?"
        ],
        note: "Free + you-keep-it = low-pressure. Strategist intro = social proof of team."
      },
      {
        id: "close",
        name: "Close",
        time: "2:50 – 3:45",
        cue: "Email first. Daypart, not date.",
        lines: [
          "Got it. Best email to send the link to, and is mornings or afternoons easier for the 30 minutes?"
        ],
        note: "Mornings vs afternoons is easier to say yes to than Tuesday vs Thursday."
      }
    ]
  }
};

const OBJECTIONS = {
  A: [
    {
      label: "Not interested",
      body: "Totally get it. Out of curiosity though — if I told you the one thing on your homepage that's losing you bookings without you knowing, would you at least want to see it? Free, no pitch.",
      tone: "Reflect → Curiosity flip → No-pressure offer"
    },
    {
      label: "We already have a website",
      body: "100% — most of the fleets we work with already had one too. The question isn't whether the site exists, it's whether it's converting the traffic you're already paying for. That's what the audit shows you.",
      tone: "Agree → Reframe → Anchor to ad spend"
    },
    {
      label: "Send me an email",
      body: "Happy to. But the audit is something we screen-share so you actually see the leak in your own funnel — an email won't do it justice. Would 15 minutes Tuesday or Thursday be easier?",
      tone: "Yes-and → Anchor value → Day-choice close"
    },
    {
      label: "How much / what's the catch?",
      body: "No catch. We charge $3K for these audits — the industry runs $2,800 to $85,000. We do five free a month because the deck IS the pitch. If we find something worth fixing and you want help, great. If not, you keep the deck.",
      tone: "Anchor → Range → Low-pressure exit"
    },
    {
      label: "I need to think about it",
      body: "Totally — what part feels unclear? The audit itself, the timing, or whether your fleet's even in the bracket where this matters?",
      tone: "Permission → Multi-option diagnostic"
    }
  ],
  B: [
    {
      label: "Not interested",
      body: "Fair enough. Most fleets we audit thought the same thing — until we showed them the recording of their own mobile checkout. Would you be opposed to me sending a 90-sec Loom of yours?",
      tone: "Acknowledge → Social proof → 'Would you be opposed'"
    },
    {
      label: "We already have a website",
      body: "Of course — and that's actually the best time to audit. A new site has the most untested assumptions. We've found 6-figure leaks in sites that were 3 weeks old.",
      tone: "Reframe → Stat-backed credibility"
    },
    {
      label: "Send me an email",
      body: "Sure — but the deck only makes sense when [Strategist Name] walks you through it on screen-share. Otherwise it's just charts. Want me to grab 20 mins on the calendar and I'll send the email confirmation right after?",
      tone: "Yes-and → Value gap → Soft-book the call"
    },
    {
      label: "How much / what's the catch?",
      body: "Honest answer: it's a paid lead-gen play. The audit costs us about a half-day. We do five free per month because roughly one in five fleets hires us after. You keep the deck either way.",
      tone: "Radical honesty → Anchor → No-loss exit"
    },
    {
      label: "I need to think about it",
      body: "Makes sense. Out of curiosity, is it the 30 minutes that's the hesitation, or whether the audit will actually find something on your site?",
      tone: "Permission → Two-option isolation"
    }
  ]
};

// Beat timing thresholds (seconds) — used to highlight current beat
const BEAT_TIMINGS = {
  A: [
    { id: "open",      start: 0,   end: 20  },
    { id: "problem",   start: 20,  end: 50  },
    { id: "agitation", start: 50,  end: 85  },
    { id: "solution",  start: 85,  end: 120 },
    { id: "audit",     start: 120, end: 165 },
    { id: "close",     start: 165, end: 210 }
  ],
  B: [
    { id: "open",      start: 0,   end: 25  },
    { id: "problem",   start: 25,  end: 55  },
    { id: "agitation", start: 55,  end: 90  },
    { id: "solution",  start: 90,  end: 125 },
    { id: "audit",     start: 125, end: 170 },
    { id: "close",     start: 170, end: 225 }
  ]
};

const TARGET_MIN = 180; // 3 min — start of warning zone
const TARGET_MAX = 240; // 4 min — over

// ---------- STATE ----------
const STORAGE_KEY = "ce_call_coach_v1";
let state = {
  variant: "A",
  log: []
};
let timerState = {
  running: false,
  startTime: 0,
  elapsed: 0,
  interval: null
};
let beatsDone = new Set();

// ---------- STORAGE ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.log = parsed.log || [];
      state.variant = parsed.variant || "A";
    }
  } catch (e) { console.warn("Load failed", e); }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { console.warn("Save failed", e); }
}

// ---------- RENDER: SCRIPT ----------
function renderScript() {
  const container = document.getElementById("beatsContainer");
  const beats = SCRIPTS[state.variant].beats;
  document.getElementById("scriptVariantPill").textContent = state.variant;

  container.innerHTML = "";
  beats.forEach((beat, idx) => {
    const div = document.createElement("div");
    div.className = "beat-item" + (idx === 0 ? " expanded" : "");
    div.dataset.beatId = beat.id;
    div.innerHTML = `
      <div class="beat-head">
        <div class="beat-label">
          <div class="beat-num">${idx + 1}</div>
          <div>
            <div class="beat-name">${beat.name}</div>
            <div class="beat-time">${beat.time}</div>
          </div>
        </div>
        <div class="beat-toggle">
          <button class="beat-done-btn" data-beat="${beat.id}">${beatsDone.has(beat.id) ? "✓ Done" : "Mark Done"}</button>
          <span class="beat-chev">▼</span>
        </div>
      </div>
      <div class="beat-body">
        <span class="beat-cue">${beat.cue}</span>
        ${beat.lines.map(l => `<p>${l}</p>`).join("")}
        <p><em>${beat.note}</em></p>
      </div>
    `;
    container.appendChild(div);
  });

  // Click handlers
  container.querySelectorAll(".beat-head").forEach(head => {
    head.addEventListener("click", (e) => {
      if (e.target.classList.contains("beat-done-btn")) return;
      head.parentElement.classList.toggle("expanded");
    });
  });
  container.querySelectorAll(".beat-done-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.beat;
      if (beatsDone.has(id)) beatsDone.delete(id);
      else beatsDone.add(id);
      renderScript(); // re-render to update Done state
      updateBeatProgressBar();
    });
  });

  updateBeatProgressBar();
}

function updateBeatProgressBar() {
  const beats = SCRIPTS[state.variant].beats;
  document.querySelectorAll(".beats .beat-item").forEach(el => {
    const id = el.dataset.beatId;
    el.classList.toggle("done", beatsDone.has(id));
  });
  document.querySelectorAll(".beat-progress .beat").forEach(el => {
    el.classList.toggle("done", beatsDone.has(el.dataset.beat));
  });
}

// ---------- RENDER: OBJECTIONS ----------
function renderObjections() {
  const container = document.getElementById("objectionsContainer");
  const items = OBJECTIONS[state.variant];
  container.innerHTML = "";
  items.forEach((obj, idx) => {
    const div = document.createElement("div");
    div.className = "obj-item";
    div.innerHTML = `
      <div class="obj-head">
        <strong>${idx + 1}. ${obj.label}</strong>
        <div class="obj-toggle-icon">+</div>
      </div>
      <div class="obj-body">
        <p>${obj.body}</p>
        <em>Framework: ${obj.tone}</em>
      </div>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll(".obj-head").forEach(head => {
    head.addEventListener("click", () => {
      head.parentElement.classList.toggle("expanded");
    });
  });
}

// ---------- TIMER ----------
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function startTimer() {
  if (timerState.running) return;
  timerState.running = true;
  timerState.startTime = Date.now() - timerState.elapsed * 1000;
  timerState.interval = setInterval(tickTimer, 250);
  document.getElementById("timerStart").textContent = "Running…";
  document.getElementById("timerStart").disabled = true;
  document.getElementById("timerPause").disabled = false;
  document.getElementById("timerReset").disabled = false;
}

function pauseTimer() {
  if (!timerState.running) return;
  timerState.running = false;
  clearInterval(timerState.interval);
  document.getElementById("timerStart").textContent = "Resume";
  document.getElementById("timerStart").disabled = false;
  document.getElementById("timerPause").disabled = true;
}

function resetTimer() {
  timerState.running = false;
  timerState.elapsed = 0;
  clearInterval(timerState.interval);
  beatsDone.clear();
  renderScript();
  document.getElementById("timerStart").textContent = "Start Call";
  document.getElementById("timerStart").disabled = false;
  document.getElementById("timerPause").disabled = true;
  document.getElementById("timerReset").disabled = true;
  updateTimerDisplay();
}

function tickTimer() {
  timerState.elapsed = Math.floor((Date.now() - timerState.startTime) / 1000);
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const display = document.getElementById("timerDisplay");
  display.textContent = formatTime(timerState.elapsed);
  display.classList.remove("warn", "over");
  if (timerState.elapsed >= TARGET_MAX) display.classList.add("over");
  else if (timerState.elapsed >= TARGET_MIN) display.classList.add("warn");

  // Highlight current beat
  const beats = BEAT_TIMINGS[state.variant];
  const cur = beats.find(b => timerState.elapsed >= b.start && timerState.elapsed < b.end);
  document.querySelectorAll(".beat-progress .beat").forEach(el => {
    el.classList.toggle("current", cur && el.dataset.beat === cur.id);
  });
}

// ---------- CALL LOGGING ----------
function logCall() {
  const company = document.getElementById("callCompany").value.trim();
  const contact = document.getElementById("callContact").value.trim();
  const variant = document.getElementById("callVariant").value;
  const outcome = document.getElementById("callOutcome").value;
  const notes = document.getElementById("callNotes").value.trim();

  if (!outcome) {
    alert("Pick an outcome before logging the call.");
    return;
  }

  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    company: company || "—",
    contact: contact || "—",
    variant,
    outcome,
    passedOpener: document.getElementById("passedOpener").checked,
    passedProblem: document.getElementById("passedProblem").checked,
    hitObjection: document.getElementById("hitObjection").checked,
    notes,
    duration: timerState.elapsed
  };
  state.log.unshift(entry);
  saveState();
  renderLog();
  renderStats();
  clearForm();
}

function clearForm() {
  document.getElementById("callCompany").value = "";
  document.getElementById("callContact").value = "";
  document.getElementById("callOutcome").value = "";
  document.getElementById("callNotes").value = "";
  document.getElementById("passedOpener").checked = false;
  document.getElementById("passedProblem").checked = false;
  document.getElementById("hitObjection").checked = false;
}

function deleteLog(id) {
  state.log = state.log.filter(e => e.id !== id);
  saveState();
  renderLog();
  renderStats();
}

function clearAllLogs() {
  if (!confirm("Clear ALL logged calls? This cannot be undone.")) return;
  state.log = [];
  saveState();
  renderLog();
  renderStats();
}

// ---------- RENDER: LOG ----------
function outcomeClass(o) {
  if (["BK", "SH", "CL"].includes(o)) return "win";
  if (["PP", "OBJ"].includes(o)) return "warm";
  return "miss";
}

function renderLog() {
  const list = document.getElementById("logList");
  if (state.log.length === 0) {
    list.innerHTML = '<div class="log-empty">No calls logged yet today. Start dialing.</div>';
    return;
  }
  list.innerHTML = state.log.map(e => `
    <div class="log-row">
      <div class="log-variant ${e.variant}">${e.variant}</div>
      <div class="log-body">
        <div class="log-company">${escapeHTML(e.company)}</div>
        <div class="log-meta">${escapeHTML(e.contact)} · ${new Date(e.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}${e.duration ? ` · ${formatTime(e.duration)}` : ""}</div>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <span class="log-outcome ${outcomeClass(e.outcome)}">${e.outcome}</span>
        <button class="log-delete" data-id="${e.id}" title="Delete">✕</button>
      </div>
    </div>
  `).join("");
  list.querySelectorAll(".log-delete").forEach(btn => {
    btn.addEventListener("click", () => deleteLog(parseInt(btn.dataset.id)));
  });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

// ---------- RENDER: STATS ----------
function renderStats() {
  const total = state.log.length;
  const booked = state.log.filter(e => ["BK","SH","CL"].includes(e.outcome)).length;
  const aLog = state.log.filter(e => e.variant === "A");
  const bLog = state.log.filter(e => e.variant === "B");
  const aBooked = aLog.filter(e => ["BK","SH","CL"].includes(e.outcome)).length;
  const bBooked = bLog.filter(e => ["BK","SH","CL"].includes(e.outcome)).length;

  document.getElementById("kpiTotal").textContent = total;
  document.getElementById("kpiBooked").textContent = booked;
  document.getElementById("kpiBookRate").textContent = total > 0 ? Math.round((booked / total) * 100) + "%" : "0%";

  document.getElementById("aCalls").textContent = aLog.length;
  document.getElementById("aBooked").textContent = aBooked;
  document.getElementById("aRate").textContent = aLog.length > 0 ? Math.round((aBooked / aLog.length) * 100) + "%" : "0%";

  document.getElementById("bCalls").textContent = bLog.length;
  document.getElementById("bBooked").textContent = bBooked;
  document.getElementById("bRate").textContent = bLog.length > 0 ? Math.round((bBooked / bLog.length) * 100) + "%" : "0%";

  const banner = document.getElementById("winnerBanner");
  banner.classList.remove("has-winner-a", "has-winner-b");
  if (aLog.length < 5 || bLog.length < 5) {
    banner.textContent = `Need 5+ calls per variant (A: ${aLog.length}, B: ${bLog.length})`;
  } else {
    const aRate = aBooked / aLog.length;
    const bRate = bBooked / bLog.length;
    if (Math.abs(aRate - bRate) < 0.01) {
      banner.textContent = "Tie — keep dialing";
    } else if (aRate > bRate) {
      banner.textContent = `Variant A leading by ${Math.round((aRate - bRate) * 100)}pp`;
      banner.classList.add("has-winner-a");
    } else {
      banner.textContent = `Variant B leading by ${Math.round((bRate - aRate) * 100)}pp`;
      banner.classList.add("has-winner-b");
    }
  }
}

// ---------- CSV EXPORT ----------
function exportCSV() {
  if (state.log.length === 0) {
    alert("Nothing to export yet.");
    return;
  }
  const headers = ["Date", "Time", "Company", "Contact/City", "Variant", "Outcome", "Past Opener", "Past Problem", "Hit Objection", "Duration (s)", "Notes"];
  const rows = state.log.map(e => {
    const d = new Date(e.timestamp);
    return [
      d.toLocaleDateString(),
      d.toLocaleTimeString(),
      e.company,
      e.contact,
      e.variant,
      e.outcome,
      e.passedOpener ? "Y" : "N",
      e.passedProblem ? "Y" : "N",
      e.hitObjection ? "Y" : "N",
      e.duration || 0,
      e.notes
    ];
  });
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `conversion-exotics-calls-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- VARIANT SWITCH ----------
function switchVariant(v) {
  state.variant = v;
  saveState();
  document.querySelectorAll(".variant-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.variant === v);
    b.setAttribute("aria-selected", b.dataset.variant === v ? "true" : "false");
  });
  document.getElementById("callVariant").value = v;
  beatsDone.clear();
  renderScript();
  renderObjections();
  updateTimerDisplay();
}

// ---------- INIT ----------
function init() {
  loadState();
  switchVariant(state.variant);
  renderLog();
  renderStats();
  updateTimerDisplay();

  // Wire up controls
  document.getElementById("timerStart").addEventListener("click", startTimer);
  document.getElementById("timerPause").addEventListener("click", pauseTimer);
  document.getElementById("timerReset").addEventListener("click", resetTimer);
  document.getElementById("logCallBtn").addEventListener("click", logCall);
  document.getElementById("clearFormBtn").addEventListener("click", clearForm);
  document.getElementById("clearLogBtn").addEventListener("click", clearAllLogs);
  document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);

  document.querySelectorAll(".variant-btn").forEach(btn => {
    btn.addEventListener("click", () => switchVariant(btn.dataset.variant));
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      if (timerState.running) pauseTimer(); else startTimer();
    }
    if (e.key === "r" || e.key === "R") {
      if (e.shiftKey) resetTimer();
    }
    if (e.key === "1") switchVariant("A");
    if (e.key === "2") switchVariant("B");
  });
}

document.addEventListener("DOMContentLoaded", init);
