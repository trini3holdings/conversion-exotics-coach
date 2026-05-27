# Google Apps Script Backend — One-Time Setup (60 seconds)

This connects Call Coach to your Google Sheets + Gmail. Once it's set up, every call you log auto-appends to a master sheet in your Drive and any follow-up reminders you schedule get emailed from your own Gmail.

## Step 1 — Open Apps Script
Go to **[script.google.com/home](https://script.google.com/home)** and click **New Project**.

## Step 2 — Paste this code
Replace the entire `Code.gs` file with the contents of `apps-script-backend.gs` (in this repo, same folder as this README).

## Step 3 — Deploy as Web App
1. Click **Deploy** (top right) → **New deployment**
2. Click the gear icon → choose **Web app**
3. Settings:
   - **Description**: Call Coach Backend
   - **Execute as**: Me (your email)
   - **Who has access**: Anyone (don't worry — only you have the URL; treat it like a password)
4. Click **Deploy**
5. Click **Authorize access** → pick your Google account → click Advanced → **Go to (project name) (unsafe)** → **Allow**
6. **Copy the Web App URL** that appears (looks like `https://script.google.com/macros/s/AKfy.../exec`)

## Step 4 — Paste the URL into the app
1. Open Call Coach
2. Click the **⚙ Backend** button in the top bar
3. Paste the URL
4. Click **Save & Test**

You're done. Every logged call now appends to a Google Sheet automatically, named **Call Coach Master · Conversion Exotics** in your Drive. Each brand gets its own sheet.

## What this gives you
- Master sheet per brand, auto-created on first call
- Every call = one new row (timestamp, caller, variant, company, market, phone, outcome, structured notes, score, follow-up date/time)
- New prospects auto-merged into a `Prospects` tab — never overwrites your existing data
- Follow-up reminder emails sent from your Gmail at the scheduled time
- Mobile-friendly — the master sheet is just a Google Sheet, open it on any device

## To re-deploy after editing the script
- Deploy → Manage deployments → click the pencil icon → Version: New version → Deploy
- The URL stays the same.
