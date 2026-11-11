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
Finnhub quote API does not supply a dividend calendar here. Research must not claim verified current dividend dates/yields. Quotes may be delayed and provider terms apply. Groq may be unavailable or rate limited; the app will display a clear error rather than fake results. AI research is educational and not a guarantee of returns.

## Original LastApp project
The original LastApp ZIP is not overwritten. This new project is standalone. Moving the changes back into LastApp would require its supported import/deployment workflow.
