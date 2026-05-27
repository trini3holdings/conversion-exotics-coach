/**
 * Call Coach — Google Apps Script Backend
 * Paste this into a new Apps Script project, deploy as Web App.
 * See SETUP_GOOGLE_BACKEND.md for full instructions.
 *
 * Endpoints (POST JSON):
 *  { action: "ping" }
 *      → { ok: true, version: "1.0" }
 *
 *  { action: "logCall", brand: "conversion-exotics", call: {...} }
 *      → appends row to Calls tab; merges prospect into Prospects tab
 *      → if call.followup.date set, schedules a Gmail draft + a Calendar event
 *
 *  { action: "addProspect", brand, prospect: {...} }
 *      → adds prospect to Prospects tab (or updates if domain matches)
 *
 *  { action: "listProspects", brand }
 *      → returns all prospects from Prospects tab
 *
 *  { action: "sendFollowupNow", brand, call: {...} }
 *      → immediate test email
 */

const VERSION = "1.0";

// Headers for the Calls tab
const CALL_HEADERS = [
  "ts", "date_called", "time_called", "brand", "caller", "variant",
  "prospect_id", "company", "domain", "market", "phone", "email",
  "outcome", "score", "duration_sec",
  "objection_raised", "what_worked", "next_step", "notes",
  "followup_date", "followup_time", "followup_channel", "followup_msg",
  "reminder_email_id"
];

// Headers for the Prospects (master) tab
const PROSPECT_HEADERS = [
  "id", "company", "domain", "market", "phone", "email", "instagram",
  "monthly_traffic", "ad_spend_est",
  "speed", "trust", "cta", "risk",
  "issues_1", "issues_2", "issues_3",
  "notes",
  "last_audit_date",
  "last_called_date", "last_called_outcome", "last_called_score",
  "next_followup_date", "next_followup_time",
  "total_calls", "total_booked",
  "first_added", "last_updated"
];

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, msg: "Call Coach backend is alive. Use POST.", version: VERSION }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;
    switch (action) {
      case "ping":           result = { ok: true, version: VERSION }; break;
      case "logCall":        result = logCall(body); break;
      case "addProspect":    result = addProspect(body); break;
      case "listProspects":  result = listProspects(body); break;
      case "sendFollowupNow": result = sendFollowupNow(body); break;
      default: result = { ok: false, error: "Unknown action: " + action };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message, stack: err.stack });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============== SPREADSHEET HELPERS ==============
function getOrCreateSpreadsheet(brand) {
  const brandPretty = prettyBrand(brand);
  const name = `Call Coach Master · ${brandPretty}`;
  const props = PropertiesService.getScriptProperties();
  const key = `sheet_id_${brand}`;
  let id = props.getProperty(key);
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(name);
    props.setProperty(key, ss.getId());
  }
  ensureTab(ss, "Calls", CALL_HEADERS);
  ensureTab(ss, "Prospects", PROSPECT_HEADERS);
  return ss;
}

function ensureTab(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#1A1A1A").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
  }
  // Remove default Sheet1 if blank
  const blank = ss.getSheetByName("Sheet1");
  if (blank && blank.getLastRow() === 0 && blank.getName() === "Sheet1" && ss.getSheets().length > 1) {
    ss.deleteSheet(blank);
  }
  return sh;
}

function prettyBrand(slug) {
  return slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ============== LOG CALL ==============
function logCall(body) {
  const brand = body.brand || "conversion-exotics";
  const call = body.call || {};
  const ss = getOrCreateSpreadsheet(brand);
  const sh = ss.getSheetByName("Calls");

  const ts = call.ts || Date.now();
  const d = new Date(ts);
  const tz = ss.getSpreadsheetTimeZone() || "America/Chicago";

  const followup = call.followup || {};

  // 1. Append call row
  const row = CALL_HEADERS.map(h => {
    switch (h) {
      case "ts": return ts;
      case "date_called": return Utilities.formatDate(d, tz, "yyyy-MM-dd");
      case "time_called": return Utilities.formatDate(d, tz, "HH:mm");
      case "brand": return brand;
      case "caller": return call.caller || "";
      case "variant": return call.variant || "";
      case "prospect_id": return call.prospectN || "";
      case "company": return call.company || "";
      case "domain": return call.domain || "";
      case "market": return call.market || "";
      case "phone": return call.phone || "";
      case "email": return call.email || "";
      case "outcome": return call.outcome || "";
      case "score": return call.score || 0;
      case "duration_sec": return call.duration || 0;
      case "objection_raised": return call.objectionRaised || "";
      case "what_worked": return call.whatWorked || "";
      case "next_step": return call.nextStep || "";
      case "notes": return call.notes || "";
      case "followup_date": return followup.date || "";
      case "followup_time": return followup.time || "";
      case "followup_channel": return followup.channel || "";
      case "followup_msg": return followup.message || "";
      case "reminder_email_id": return "";
      default: return "";
    }
  });
  sh.appendRow(row);
  const newRowIdx = sh.getLastRow();

  // 2. Merge into Prospects tab (update or create)
  if (call.prospectN || call.domain || call.company || call.phone) {
    mergeProspect(ss, brand, call);
  }

  // 3. Schedule follow-up if requested
  let reminderId = "";
  if (followup.date && followup.time) {
    try {
      reminderId = scheduleFollowup(brand, call, followup);
      if (reminderId) {
        sh.getRange(newRowIdx, CALL_HEADERS.indexOf("reminder_email_id") + 1).setValue(reminderId);
      }
    } catch (err) {
      reminderId = "ERROR: " + err.message;
    }
  }

  return {
    ok: true,
    rowIdx: newRowIdx,
    sheetUrl: ss.getUrl(),
    sheetId: ss.getId(),
    reminderId: reminderId
  };
}

// ============== PROSPECT MERGE ==============
function mergeProspect(ss, brand, call) {
  const sh = ss.getSheetByName("Prospects");
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf("id");
  const domainCol = headers.indexOf("domain");
  const phoneCol = headers.indexOf("phone");

  const matchId = call.prospectN ? String(call.prospectN) : "";
  const matchDomain = (call.domain || "").toLowerCase().trim();
  const matchPhone = (call.phone || "").replace(/\D/g, "");

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    const rowId = String(data[i][idCol] || "");
    const rowDomain = String(data[i][domainCol] || "").toLowerCase().trim();
    const rowPhone = String(data[i][phoneCol] || "").replace(/\D/g, "");
    if ((matchId && rowId === matchId) ||
        (matchDomain && rowDomain === matchDomain) ||
        (matchPhone && rowPhone && rowPhone === matchPhone)) {
      foundRow = i + 1;
      break;
    }
  }

  const tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const isBooked = ["BK", "SH", "CL"].indexOf(call.outcome) !== -1;
  const followup = call.followup || {};

  if (foundRow === -1) {
    // New prospect — add row
    const newRow = PROSPECT_HEADERS.map(h => {
      switch (h) {
        case "id": return call.prospectN || "P" + Date.now();
        case "company": return call.company || "";
        case "domain": return call.domain || "";
        case "market": return call.market || "";
        case "phone": return call.phone || "";
        case "email": return call.email || "";
        case "last_called_date": return today;
        case "last_called_outcome": return call.outcome || "";
        case "last_called_score": return call.score || 0;
        case "next_followup_date": return followup.date || "";
        case "next_followup_time": return followup.time || "";
        case "total_calls": return 1;
        case "total_booked": return isBooked ? 1 : 0;
        case "first_added": return today;
        case "last_updated": return today;
        default: return "";
      }
    });
    sh.appendRow(newRow);
  } else {
    // Existing prospect — update key fields
    const updates = {
      "last_called_date": today,
      "last_called_outcome": call.outcome || "",
      "last_called_score": call.score || 0,
      "last_updated": today
    };
    if (followup.date) updates.next_followup_date = followup.date;
    if (followup.time) updates.next_followup_time = followup.time;
    if (call.email) updates.email = call.email;

    // Increment counters
    const tcCol = PROSPECT_HEADERS.indexOf("total_calls");
    const tbCol = PROSPECT_HEADERS.indexOf("total_booked");
    const curTC = Number(data[foundRow - 1][tcCol] || 0);
    const curTB = Number(data[foundRow - 1][tbCol] || 0);
    updates.total_calls = curTC + 1;
    updates.total_booked = curTB + (isBooked ? 1 : 0);

    Object.keys(updates).forEach(k => {
      const c = PROSPECT_HEADERS.indexOf(k);
      if (c >= 0 && updates[k] !== "") {
        sh.getRange(foundRow, c + 1).setValue(updates[k]);
      }
    });
  }
}

// ============== ADD PROSPECT (inline UI) ==============
function addProspect(body) {
  const brand = body.brand;
  const p = body.prospect || {};
  const ss = getOrCreateSpreadsheet(brand);
  const sh = ss.getSheetByName("Prospects");
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const domainCol = headers.indexOf("domain");
  const matchDomain = (p.domain || "").toLowerCase().trim();
  let foundRow = -1;
  if (matchDomain) {
    for (let i = 1; i < data.length; i++) {
      const rowDomain = String(data[i][domainCol] || "").toLowerCase().trim();
      if (rowDomain === matchDomain) { foundRow = i + 1; break; }
    }
  }
  const tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  if (foundRow === -1) {
    const newRow = PROSPECT_HEADERS.map(h => {
      if (h === "first_added" || h === "last_updated") return today;
      if (h === "id") return p.id || ("P" + Date.now());
      if (h === "total_calls" || h === "total_booked") return 0;
      return p[h] !== undefined ? p[h] : "";
    });
    sh.appendRow(newRow);
    return { ok: true, action: "created", id: newRow[0], sheetUrl: ss.getUrl() };
  } else {
    PROSPECT_HEADERS.forEach((h, c) => {
      if (p[h] !== undefined && p[h] !== "" && h !== "id" && h !== "first_added") {
        sh.getRange(foundRow, c + 1).setValue(p[h]);
      }
    });
    sh.getRange(foundRow, PROSPECT_HEADERS.indexOf("last_updated") + 1).setValue(today);
    return { ok: true, action: "updated", row: foundRow, sheetUrl: ss.getUrl() };
  }
}

// ============== LIST PROSPECTS ==============
function listProspects(body) {
  const brand = body.brand;
  const ss = getOrCreateSpreadsheet(brand);
  const sh = ss.getSheetByName("Prospects");
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, prospects: [] };
  const headers = data[0];
  const prospects = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    // Build issues array
    obj.issues = [obj.issues_1, obj.issues_2, obj.issues_3].filter(Boolean);
    return obj;
  });
  return { ok: true, prospects: prospects, sheetUrl: ss.getUrl() };
}

// ============== FOLLOW-UP SCHEDULING ==============
function scheduleFollowup(brand, call, followup) {
  // followup = { date: "2026-05-30", time: "14:00", channel: "email"|"calendar"|"both", message: "...", toProspect: bool }
  const ownerEmail = Session.getActiveUser().getEmail();
  const fpDateTime = new Date(`${followup.date}T${followup.time}:00`);
  const subject = `Follow up: ${call.company || "Prospect"} (${call.market || ""}) · ${call.outcome || ""}`;
  const summary = buildFollowupBody(call, followup);

  let createdIds = [];

  // 1. Self-reminder email scheduled via time-driven trigger
  if (followup.channel === "email" || followup.channel === "both" || !followup.channel) {
    const triggerId = createScheduledEmail(ownerEmail, subject, summary, fpDateTime);
    createdIds.push("email:" + triggerId);
  }

  // 2. Optional Calendar event (visible reminder)
  if (followup.channel === "calendar" || followup.channel === "both") {
    try {
      const ev = CalendarApp.getDefaultCalendar().createEvent(
        subject,
        fpDateTime,
        new Date(fpDateTime.getTime() + 15 * 60 * 1000),
        { description: summary }
      );
      ev.addPopupReminder(15);
      createdIds.push("cal:" + ev.getId());
    } catch (err) {
      createdIds.push("cal:ERROR:" + err.message);
    }
  }

  return createdIds.join("|");
}

function buildFollowupBody(call, followup) {
  const lines = [
    `Prospect: ${call.company || "(no name)"}`,
    `Domain: ${call.domain || "—"}`,
    `Market: ${call.market || "—"}`,
    `Phone: ${call.phone || "—"}`,
    `Email: ${call.email || "—"}`,
    "",
    `Last call: ${new Date(call.ts).toLocaleString()} · ${call.outcome} (score ${call.score})`,
    `Variant used: ${call.variant} · Caller: ${call.caller}`,
    "",
    "Objection raised: " + (call.objectionRaised || "—"),
    "What worked: " + (call.whatWorked || "—"),
    "Next step: " + (call.nextStep || "—"),
    "Notes: " + (call.notes || "—"),
    "",
    "—— Your follow-up plan ——",
    followup.message || "(no message drafted — write one when you call)"
  ];
  return lines.join("\n");
}

function createScheduledEmail(toEmail, subject, body, when) {
  // Store payload in script properties keyed by trigger id, then create a one-shot trigger
  const id = "rem_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  PropertiesService.getScriptProperties().setProperty(id, JSON.stringify({
    to: toEmail, subject: subject, body: body, when: when.getTime()
  }));
  const trigger = ScriptApp.newTrigger("__sendQueuedEmail").timeBased().at(when).create();
  PropertiesService.getScriptProperties().setProperty("trig_" + trigger.getUniqueId(), id);
  return id;
}

/**
 * Triggered by Apps Script at the scheduled time.
 * Looks up the payload, sends the email, cleans up properties.
 */
function __sendQueuedEmail(e) {
  const triggerId = e.triggerUid;
  const props = PropertiesService.getScriptProperties();
  const payloadId = props.getProperty("trig_" + triggerId);
  if (!payloadId) return;
  const raw = props.getProperty(payloadId);
  if (!raw) return;
  const payload = JSON.parse(raw);
  GmailApp.sendEmail(payload.to, payload.subject, payload.body);
  props.deleteProperty(payloadId);
  props.deleteProperty("trig_" + triggerId);
  // Trigger auto-clears since it's one-shot, but clean up just in case
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getUniqueId() === triggerId) ScriptApp.deleteTrigger(t);
  });
}

// ============== TEST: send follow-up immediately ==============
function sendFollowupNow(body) {
  const call = body.call || {};
  const followup = body.followup || { message: "Test reminder from Call Coach." };
  const ownerEmail = Session.getActiveUser().getEmail();
  const subject = `[TEST] Follow up: ${call.company || "Prospect"}`;
  const summary = buildFollowupBody(call, followup);
  GmailApp.sendEmail(ownerEmail, subject, summary);
  return { ok: true, sentTo: ownerEmail };
}
