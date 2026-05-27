/**
 * Call Coach — Google Apps Script Backend (v2.0)
 * SINGLE MASTER SHEET — all 4 brands in one workbook.
 *
 * Tabs:
 *   Prospects · master list. Column "Called?" stamped with "X · YYYY-MM-DD"
 *               when any call is logged. Brand column distinguishes brand.
 *   Calls     · raw call log. Every call ever made, with Brand column.
 *
 * Endpoints (POST JSON):
 *  { action: "ping" }
 *      → { ok: true, version: "2.0" }
 *
 *  { action: "logCall", brand, call: {...} }
 *      → appends Calls row, stamps Prospects "Called?" cell with "X · date"
 *      → schedules follow-up if requested
 *
 *  { action: "addProspect", brand, prospect: {...} }
 *
 *  { action: "listProspects", brand }      // filtered by brand client-side request
 *  { action: "listProspectsAll" }          // every brand, every row
 *
 *  { action: "listCalls", brand, sinceTs }      // brand-filtered calls
 *  { action: "listCallsAll", sinceTs }          // every call
 *
 *  { action: "migrateFromLegacy" }
 *      → reads the OLD per-brand sheets (sheet_id_conversion-exotics, etc.)
 *      → copies all rows into the new master, tagging Brand
 *      → safe to re-run (de-dupes by ts + brand + prospect_id)
 *
 *  { action: "sendFollowupNow", brand, call }   // test email
 */

const VERSION = "2.0";

// Master tab headers — Brand FIRST, Called? SECOND for easy scanning
const PROSPECT_HEADERS = [
  "brand", "called", "company", "domain", "market", "phone",
  "last_called_date", "last_called_outcome", "caller", "notes",
  // legacy / extra (kept hidden but populated)
  "id", "email", "instagram", "monthly_traffic", "ad_spend_est",
  "speed", "trust", "cta", "risk",
  "issues_1", "issues_2", "issues_3",
  "last_audit_date",
  "last_called_score",
  "next_followup_date", "next_followup_time",
  "total_calls", "total_booked",
  "first_added", "last_updated"
];

// Calls tab headers
const CALL_HEADERS = [
  "ts", "date_called", "time_called", "brand", "caller", "variant",
  "prospect_id", "company", "domain", "market", "phone", "email",
  "outcome", "score", "duration_sec",
  "objection_raised", "what_worked", "next_step", "notes",
  "followup_date", "followup_time", "followup_channel", "followup_msg",
  "reminder_email_id"
];

const MASTER_SHEET_NAME = "Call Coach Master · ALL BRANDS";
const MASTER_SHEET_KEY = "master_sheet_id";

// ============== ROUTER ==============
function doGet(e) {
  return jsonResponse({ ok: true, msg: "Call Coach v2.0 master-sheet backend alive. Use POST.", version: VERSION });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;
    switch (action) {
      case "ping":             result = { ok: true, version: VERSION }; break;
      case "logCall":          result = logCall(body); break;
      case "addProspect":      result = addProspect(body); break;
      case "listProspects":    result = listProspects(body); break;
      case "listProspectsAll": result = listProspectsAll(); break;
      case "listCalls":        result = listCalls(body); break;
      case "listCallsAll":     result = listCallsAll(body); break;
      case "migrateFromLegacy": result = migrateFromLegacy(); break;
      case "sendFollowupNow":  result = sendFollowupNow(body); break;
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

// ============== MASTER SHEET HELPERS ==============
function getMasterSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(MASTER_SHEET_KEY);
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(MASTER_SHEET_NAME);
    props.setProperty(MASTER_SHEET_KEY, ss.getId());
  }
  ensureTab(ss, "Prospects", PROSPECT_HEADERS);
  ensureTab(ss, "Calls", CALL_HEADERS);
  return ss;
}

function ensureTab(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight("bold").setBackground("#1A1A1A").setFontColor("#FFFFFF");
    sh.setFrozenRows(1);
    // Freeze "brand" + "called" columns on Prospects tab for easy scanning
    if (name === "Prospects") sh.setFrozenColumns(2);
  } else {
    // Verify header row matches — if not, rewrite headers (additive, non-destructive)
    const cur = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), headers.length)).getValues()[0];
    let needsRewrite = false;
    for (let i = 0; i < headers.length; i++) {
      if (cur[i] !== headers[i]) { needsRewrite = true; break; }
    }
    if (needsRewrite) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight("bold").setBackground("#1A1A1A").setFontColor("#FFFFFF");
    }
  }
  // Remove default blank Sheet1 if it exists alongside our tabs
  const blank = ss.getSheetByName("Sheet1");
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(blank);
  }
  return sh;
}

function prettyBrand(slug) {
  if (!slug) return "";
  return String(slug).split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ============== LOG CALL ==============
function logCall(body) {
  const brand = body.brand || "conversion-exotics";
  const call = body.call || {};
  const ss = getMasterSpreadsheet();
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

  // 2. Stamp Prospects tab with "X · date" Called marker (and merge fields)
  if (call.prospectN || call.domain || call.company || call.phone) {
    stampProspectCalled(ss, brand, call);
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

// ============== STAMP PROSPECT WITH "X · date" ==============
function stampProspectCalled(ss, brand, call) {
  const sh = ss.getSheetByName("Prospects");
  const data = sh.getDataRange().getValues();
  const headers = data[0];

  const brandCol  = headers.indexOf("brand");
  const idCol     = headers.indexOf("id");
  const domainCol = headers.indexOf("domain");
  const phoneCol  = headers.indexOf("phone");

  const matchBrand  = String(brand || "").toLowerCase();
  const matchId     = call.prospectN ? String(call.prospectN) : "";
  const matchDomain = (call.domain || "").toLowerCase().trim();
  const matchPhone  = (call.phone || "").replace(/\D/g, "");

  // Match within same brand only — same prospect_id across brands stays distinct
  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    const rowBrand  = String(data[i][brandCol] || "").toLowerCase();
    if (rowBrand !== matchBrand) continue;
    const rowId     = String(data[i][idCol] || "");
    const rowDomain = String(data[i][domainCol] || "").toLowerCase().trim();
    const rowPhone  = String(data[i][phoneCol] || "").replace(/\D/g, "");
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
  const calledMarker = "X · " + today;

  if (foundRow === -1) {
    // New prospect — add row with Called? stamped
    const newRow = PROSPECT_HEADERS.map(h => {
      switch (h) {
        case "brand": return brand;
        case "called": return calledMarker;
        case "id": return call.prospectN || ("P" + Date.now());
        case "company": return call.company || "";
        case "domain": return call.domain || "";
        case "market": return call.market || "";
        case "phone": return call.phone || "";
        case "email": return call.email || "";
        case "caller": return call.caller || "";
        case "notes": return call.notes || "";
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
    // Existing prospect — update Called? + key fields
    const updates = {
      "called": calledMarker,
      "last_called_date": today,
      "last_called_outcome": call.outcome || "",
      "last_called_score": call.score || 0,
      "caller": call.caller || "",
      "last_updated": today
    };
    if (followup.date) updates.next_followup_date = followup.date;
    if (followup.time) updates.next_followup_time = followup.time;
    if (call.email) updates.email = call.email;
    if (call.notes) updates.notes = call.notes;

    // Increment counters
    const tcCol = PROSPECT_HEADERS.indexOf("total_calls");
    const tbCol = PROSPECT_HEADERS.indexOf("total_booked");
    const curTC = Number(data[foundRow - 1][tcCol] || 0);
    const curTB = Number(data[foundRow - 1][tbCol] || 0);
    updates.total_calls = curTC + 1;
    updates.total_booked = curTB + (isBooked ? 1 : 0);

    Object.keys(updates).forEach(k => {
      const c = PROSPECT_HEADERS.indexOf(k);
      if (c >= 0 && updates[k] !== "" && updates[k] !== undefined) {
        sh.getRange(foundRow, c + 1).setValue(updates[k]);
      }
    });
  }
}

// ============== ADD PROSPECT (inline UI / manual add) ==============
function addProspect(body) {
  const brand = body.brand;
  const p = body.prospect || {};
  const ss = getMasterSpreadsheet();
  const sh = ss.getSheetByName("Prospects");
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const brandCol = headers.indexOf("brand");
  const domainCol = headers.indexOf("domain");
  const matchBrand = String(brand || "").toLowerCase();
  const matchDomain = (p.domain || "").toLowerCase().trim();

  let foundRow = -1;
  if (matchDomain) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][brandCol] || "").toLowerCase() !== matchBrand) continue;
      const rowDomain = String(data[i][domainCol] || "").toLowerCase().trim();
      if (rowDomain === matchDomain) { foundRow = i + 1; break; }
    }
  }
  const tz = ss.getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  if (foundRow === -1) {
    const newRow = PROSPECT_HEADERS.map(h => {
      if (h === "brand") return brand;
      if (h === "called") return "";  // not called yet
      if (h === "first_added" || h === "last_updated") return today;
      if (h === "id") return p.id || ("P" + Date.now());
      if (h === "total_calls" || h === "total_booked") return 0;
      return p[h] !== undefined ? p[h] : "";
    });
    sh.appendRow(newRow);
    return { ok: true, action: "created", id: newRow[PROSPECT_HEADERS.indexOf("id")], sheetUrl: ss.getUrl() };
  } else {
    PROSPECT_HEADERS.forEach((h, c) => {
      if (p[h] !== undefined && p[h] !== "" && h !== "id" && h !== "first_added" && h !== "brand" && h !== "called") {
        sh.getRange(foundRow, c + 1).setValue(p[h]);
      }
    });
    sh.getRange(foundRow, PROSPECT_HEADERS.indexOf("last_updated") + 1).setValue(today);
    return { ok: true, action: "updated", row: foundRow, sheetUrl: ss.getUrl() };
  }
}

// ============== LIST PROSPECTS (filtered by brand) ==============
function listProspects(body) {
  const brand = String(body.brand || "").toLowerCase();
  const ss = getMasterSpreadsheet();
  const sh = ss.getSheetByName("Prospects");
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, prospects: [], sheetUrl: ss.getUrl() };
  const headers = data[0];
  const brandCol = headers.indexOf("brand");
  const prospects = [];
  for (let i = 1; i < data.length; i++) {
    if (brand && String(data[i][brandCol] || "").toLowerCase() !== brand) continue;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = data[i][j]; });
    obj.issues = [obj.issues_1, obj.issues_2, obj.issues_3].filter(Boolean);
    prospects.push(obj);
  }
  return { ok: true, prospects: prospects, sheetUrl: ss.getUrl() };
}

function listProspectsAll() {
  const ss = getMasterSpreadsheet();
  const sh = ss.getSheetByName("Prospects");
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, prospects: [], sheetUrl: ss.getUrl() };
  const headers = data[0];
  const prospects = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    obj.issues = [obj.issues_1, obj.issues_2, obj.issues_3].filter(Boolean);
    return obj;
  });
  return { ok: true, prospects: prospects, sheetUrl: ss.getUrl() };
}

// ============== LIST CALLS ==============
function listCalls(body) {
  const brand = String(body.brand || "").toLowerCase();
  const sinceTs = Number(body.sinceTs || 0);
  const ss = getMasterSpreadsheet();
  const sh = ss.getSheetByName("Calls");
  if (!sh) return { ok: true, calls: [], sheetUrl: ss.getUrl() };
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return { ok: true, calls: [], sheetUrl: ss.getUrl() };
  const headers = data[0];
  const idx = {};
  CALL_HEADERS.forEach(h => { idx[h] = headers.indexOf(h); });
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (brand && String(row[idx.brand] || "").toLowerCase() !== brand) continue;
    const ts = Number(row[idx.ts] || 0);
    if (sinceTs && ts < sinceTs) continue;
    out.push({
      ts: ts,
      brand: row[idx.brand] || "",
      prospect_id: row[idx.prospect_id] || "",
      company: row[idx.company] || "",
      domain: row[idx.domain] || "",
      market: row[idx.market] || "",
      caller: row[idx.caller] || "",
      outcome: row[idx.outcome] || "",
      score: Number(row[idx.score] || 0)
    });
  }
  return { ok: true, calls: out, sheetUrl: ss.getUrl() };
}

function listCallsAll(body) {
  return listCalls({ brand: "", sinceTs: body.sinceTs || 0 });
}

// ============== MIGRATION FROM LEGACY PER-BRAND SHEETS ==============
// Reads old script properties (sheet_id_conversion-exotics, sheet_id_conversionjet, etc.)
// Copies all Prospects and Calls rows into the new master with Brand column populated.
// Safe to re-run — dedupes by (brand + ts) for calls, (brand + domain) for prospects.
function migrateFromLegacy() {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  const legacyKeys = Object.keys(allProps).filter(k => k.startsWith("sheet_id_") && k !== MASTER_SHEET_KEY);
  const master = getMasterSpreadsheet();
  const masterProspects = master.getSheetByName("Prospects");
  const masterCalls = master.getSheetByName("Calls");

  // Build existing-row index for dedup
  const existingProspects = {};  // key: brand|domain → true
  const pData = masterProspects.getDataRange().getValues();
  const pBrandCol = pData[0].indexOf("brand");
  const pDomainCol = pData[0].indexOf("domain");
  for (let i = 1; i < pData.length; i++) {
    const k = String(pData[i][pBrandCol] || "").toLowerCase() + "|" + String(pData[i][pDomainCol] || "").toLowerCase();
    existingProspects[k] = true;
  }

  const existingCalls = {};  // key: brand|ts → true
  const cData = masterCalls.getDataRange().getValues();
  const cBrandCol = cData[0].indexOf("brand");
  const cTsCol = cData[0].indexOf("ts");
  for (let i = 1; i < cData.length; i++) {
    const k = String(cData[i][cBrandCol] || "").toLowerCase() + "|" + String(cData[i][cTsCol] || "");
    existingCalls[k] = true;
  }

  const report = { brands: [], totals: { prospects: 0, calls: 0 } };

  for (const key of legacyKeys) {
    const brand = key.replace("sheet_id_", "");
    const legacyId = allProps[key];
    let legacy;
    try { legacy = SpreadsheetApp.openById(legacyId); } catch (e) {
      report.brands.push({ brand: brand, status: "skipped (sheet not accessible)", error: e.message });
      continue;
    }

    let pAdded = 0;
    let cAdded = 0;

    // Migrate Prospects
    const legacyP = legacy.getSheetByName("Prospects");
    if (legacyP) {
      const lpData = legacyP.getDataRange().getValues();
      const lpHeaders = lpData[0];
      for (let i = 1; i < lpData.length; i++) {
        const lpDomain = String(lpData[i][lpHeaders.indexOf("domain")] || "").toLowerCase();
        const dedupKey = brand.toLowerCase() + "|" + lpDomain;
        if (existingProspects[dedupKey]) continue;

        // Build a row mapping legacy columns into the new master schema
        const newRow = PROSPECT_HEADERS.map(h => {
          if (h === "brand") return brand;
          if (h === "called") {
            // Was it ever called in legacy? Use last_called_date if present.
            const lcd = lpData[i][lpHeaders.indexOf("last_called_date")] || "";
            return lcd ? ("X · " + lcd) : "";
          }
          const legacyIdx = lpHeaders.indexOf(h);
          if (legacyIdx >= 0) return lpData[i][legacyIdx];
          return "";
        });
        masterProspects.appendRow(newRow);
        existingProspects[dedupKey] = true;
        pAdded++;
      }
    }

    // Migrate Calls
    const legacyC = legacy.getSheetByName("Calls");
    if (legacyC) {
      const lcData = legacyC.getDataRange().getValues();
      const lcHeaders = lcData[0];
      for (let i = 1; i < lcData.length; i++) {
        const ts = lcData[i][lcHeaders.indexOf("ts")];
        const dedupKey = brand.toLowerCase() + "|" + String(ts || "");
        if (existingCalls[dedupKey]) continue;

        const newRow = CALL_HEADERS.map(h => {
          if (h === "brand") return brand;  // force-set even if legacy had brand column
          const legacyIdx = lcHeaders.indexOf(h);
          if (legacyIdx >= 0) return lcData[i][legacyIdx];
          return "";
        });
        masterCalls.appendRow(newRow);
        existingCalls[dedupKey] = true;
        cAdded++;
      }
    }

    report.brands.push({ brand: brand, prospectsAdded: pAdded, callsAdded: cAdded, legacySheetUrl: legacy.getUrl() });
    report.totals.prospects += pAdded;
    report.totals.calls += cAdded;
  }

  return { ok: true, masterSheetUrl: master.getUrl(), masterSheetId: master.getId(), report: report };
}

// ============== FOLLOW-UP SCHEDULING (unchanged) ==============
function scheduleFollowup(brand, call, followup) {
  const ownerEmail = Session.getActiveUser().getEmail();
  const fpDateTime = new Date(`${followup.date}T${followup.time}:00`);
  const subject = `Follow up: ${call.company || "Prospect"} (${call.market || ""}) · ${call.outcome || ""} [${prettyBrand(brand)}]`;
  const summary = buildFollowupBody(call, followup);

  let createdIds = [];

  if (followup.channel === "email" || followup.channel === "both" || !followup.channel) {
    const triggerId = createScheduledEmail(ownerEmail, subject, summary, fpDateTime);
    createdIds.push("email:" + triggerId);
  }

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
  const id = "rem_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
  PropertiesService.getScriptProperties().setProperty(id, JSON.stringify({
    to: toEmail, subject: subject, body: body, when: when.getTime()
  }));
  const trigger = ScriptApp.newTrigger("__sendQueuedEmail").timeBased().at(when).create();
  PropertiesService.getScriptProperties().setProperty("trig_" + trigger.getUniqueId(), id);
  return id;
}

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
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getUniqueId() === triggerId) ScriptApp.deleteTrigger(t);
  });
}

function sendFollowupNow(body) {
  const call = body.call || {};
  const followup = body.followup || { message: "Test reminder from Call Coach." };
  const ownerEmail = Session.getActiveUser().getEmail();
  const subject = `[TEST] Follow up: ${call.company || "Prospect"}`;
  const summary = buildFollowupBody(call, followup);
  GmailApp.sendEmail(ownerEmail, subject, summary);
  return { ok: true, sentTo: ownerEmail };
}
