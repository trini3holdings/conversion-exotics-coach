# Conversion Exotics · Call Coach

Single-page web app for live cold-call coaching. Built for Zack at Conversion Exotics. Runs entirely in the browser — no backend, no signup, no tracking.

**Live site:** [https://YOUR-USERNAME.github.io/conversion-exotics-coach](https://YOUR-USERNAME.github.io/conversion-exotics-coach) *(auto-updated below after first deploy)*

## What it does

- **Two scripts side-by-side** — Variant A (Pattern Interrupt) vs Variant B (Curiosity Hook). Toggle in the header.
- **6-beat call timer** — Start/pause/reset with a 3–4 min target. The current beat lights up gold as you go. Display turns red when you blow past 4 minutes.
- **Click-to-reveal objection handlers** — 5 per variant with NEPQ tone notes and framework breakdown.
- **Live session tracker** — Log company, variant, outcome (NA/VM/HU/NI/PP/OBJ/BK/SH/CL), and notes. Stats and A/B winner update instantly.
- **CSV export** — Download the day's calls as CSV. Drop them into the matching Excel tracker.
- **All data lives in localStorage** — your phone, your laptop, never the cloud.

## Keyboard shortcuts

| Key       | Action                |
|-----------|-----------------------|
| `Space`   | Start / Pause timer   |
| `Shift+R` | Reset timer           |
| `1`       | Switch to Variant A   |
| `2`       | Switch to Variant B   |

## File structure

```
conversion-exotics-coach/
├── index.html      # Single-page UI
├── styles.css      # Brand tokens, layout, components
├── app.js          # State, timer, logging, exports
└── README.md
```

No build step. No dependencies. Open `index.html` locally or push to GitHub Pages.

## Local use

```bash
# Open directly in a browser
open index.html
# Or serve with any local server
python3 -m http.server 8000
```

## Deploy to GitHub Pages

Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / Folder: `/ (root)` → Save.

Pages will publish at `https://<username>.github.io/conversion-exotics-coach/` within a minute.

## Tech

Plain HTML, CSS, vanilla JS. DM Sans + Inter via Google Fonts. Brand palette: ink `#1A1A1A`, gold `#B8893A`, cream `#F4F0E8`.

---

*Built by Perplexity Computer for Zack at [conversionexotics.com](https://conversionexotics.com).*
