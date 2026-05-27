# Call Coach v3.4

Multi-brand cold-call cockpit. Center dashboard surfaces per-brand call intelligence: which prospects are callable *right now* in their local time, top markets, hot-list tier counts, audit value, and a deep "Train me" drilldown per vertical. Drill in to any brand to run the live A/B/C script + objection coach + recon card + Sheet sync.

Active brands: Conversion Exotics, ConversionJet, CritterClick, RME Roofing.

**Live:** https://trini3holdings.github.io/call-coach/

---

## What v2 adds over v1

### 3 script variants (was 1)
- **Variant A — Pattern Interrupt** *(control)*
- **Variant B — Curiosity Hook** *(soft open with a specific observation)*
- **Variant C — Paid-Ads Leak** *(NEW — anchored on real Google Ads CPC data)*

Variant C names the prospect's market CPC out loud so the cost of their broken landing page becomes concrete:

> "You're bidding on **exotic car rental miami** in **Miami FL** — that keyword runs about **$1.61 – $7.17 per click** right now. Every click hits a page that loses people in under 4 seconds."

CPC ranges come from Google Ads Keyword Planner (real top-of-page bids, May 2026): Miami $1.61–$7.17 (480/mo, HIGH); Houston $0.37–$2.64 (4,400/mo); LA $1.09–$5.19; Atlanta $0.51–$2.10; Las Vegas $1.62–$4.37. "Near me" variants top **$14.49/click**.

### Prospect picker
51 pre-audited prospects from the audit XLSX live in `prospects.json`. Select one from the dropdown and the app:
1. Auto-fills company, market, and phone
2. Surfaces the 3 named CRO leaks (speed, trust, CTA) with risk badge
3. Injects the leaks + market CPC into Variant C's script in real time

### 3-column layout, no accordions
Full script always visible (left), 8 objections always visible (middle), today's stats + active call + recent log (right). Nothing collapses.

### Keyboard shortcuts (with legend)
Press the **Shortcuts** button in the topbar to toggle the legend:
- `Space` — start/stop timer
- `Shift + R` — reset timer
- `1` / `2` / `3` — switch variant A / B / C
- `Ctrl + L` — log call (saves + auto-resets form)
- `Ctrl + N` — new call (clear active)
- `Ctrl + P` — focus prospect picker
- `Esc` — close any open panel

### Auto-reset
Form clears 1 second after Log Call so the next dial starts clean.

### CSV upload
Drop a CSV with the same column shape as `prospects.json` to append your own list. Persists in `localStorage` under `_imported`.

### Winner threshold: 10 calls per variant
Was 5 in v1 (statistically thin). Raised to 10 per variant (30 calls total) which the 51-prospect list can support. Winner banner fires when one variant beats the others by ≥15% close rate after each has 10+ calls.

---

## Tech

- Pure static site: `index.html` + `styles.css` + `app.js` + 2 JSON files
- No build step, no framework
- `localStorage` key `ce_call_coach_v2`
- Served by GitHub Pages over HTTPS

## Brand

Ink `#1A1A1A` · Gold `#B8893A` · Cream `#F4F0E8` · Highlight `#FFF8E8` · DM Sans display, Inter body.

## Audit value referenced in scripts

$3,000 (free for the first 5 booked calls each week).

## Outcomes

NA · VM · HU · NI · PP · OBJ · BK · SH · CL
*Booked = BK/SH/CL · Closed = CL only*
