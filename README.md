# AI Stock Income Tracker — frontend + backend

This is a **separate, working-source replacement** for the LastApp prototype. It does not automatically update the LastApp-hosted app or produce a signed Android APK.

## Features
- Mobile-friendly web frontend with dashboard, watchlist, research, dividend research, portfolio journal, predictions journal, backups.
- Node.js backend with JSON persistence, Finnhub quote integration and Groq AI research integration.
- No stock-monitoring jobs, fake confidence percentages, simulated trading signals, or invented dividend schedules.
- Keys stay on the backend. No trades or brokerage passwords.

## Run
1. Install Node.js 20+ on a computer or server.
2. In this folder run `npm start` (no npm dependencies needed).
3. Open `http://127.0.0.1:3000` in the browser on the same machine.
4. To enable live stock quotes, set `FINNHUB_API_KEY` in the server environment. To enable AI research, set `GROQ_API_KEY` in the server environment. Restart the server. These are separate provider accounts; quotas and costs vary.

Example macOS/Linux shell: `FINNHUB_API_KEY=your_key GROQ_API_KEY=your_key npm start` (do not share real keys in chats or screenshots).

## Android phone
The web app is responsive but the backend cannot run just by opening the HTML file from Downloads. Deploy the server to a host with persistent storage and HTTPS to access it from your Android browser. **Before public deployment add authentication, access controls, durable database storage, and production security controls.** The bundled server is intended for private local development only.

## Data limitations
Prices come from Finnhub. Dividend profiles come from the documented free SmarterDividends API (https://smarterdividends.com/dividend-api), with per-record attribution links, one-hour caching, a 55-request/minute outbound limit, and request deduplication. No dividend API key is required. Provider records may lag issuer announcements or contain errors: recorded payments are not necessarily the latest and future dates are not independently confirmed. Snapshots older than seven days do not supply current rates or future dates. Missing values remain unavailable.

Income is a labeled illustration: `(saved budget / quoted price) * provider annualized dividend per share / 12`, before fees and taxes. It is not an actual payment forecast; distribution amounts can vary. AI selects educational topic IDs only and cannot author financial figures. Quotes may be delayed. No guaranteed returns.

Run regression tests with `npm test`. Tests cover dividend calculations, empty AI responses, portfolio and journal saves, concurrent writes, backup restoration including research history, and persistence across a process restart. Lifecycle tests use an isolated temporary directory and fictional records.

Backups can restore all saved categories, including research history (maximum 1 MB). Invalid imports are rejected without changing existing records. Writes are queued to prevent overlapping requests or in-flight AI research from overwriting unrelated changes.

Public-access review: this version still has shared, unauthenticated server storage. Anyone who can access `/api/state` can read the stored records, and state writes are not protected by sign-in. Do not treat portfolio entries or journal notes as private. Authentication and durable production storage remain separate unfinished requirements; a process-restart test does not prove survival across a Render redeploy.

## Original LastApp project
The original LastApp ZIP is not overwritten. This new project is standalone. Moving the changes back into LastApp would require its supported import/deployment workflow.
