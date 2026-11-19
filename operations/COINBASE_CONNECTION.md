# Direct Coinbase account reader

This is separate from the official Coinbase ChatGPT plugin. The app's authenticated `GET /api/coinbase/status` invokes the pinned official `@coinbase/coinbase-cli` 0.0.11 using fixed portfolio-list/get commands. No order, conversion, transfer, deposit, or withdrawal command is exposed. This release cannot enable real-money automatic trading.

## Owner authorization

1. Visit https://portal.cdp.coinbase.com/api-keys/secret and create a secret API key for this tracker. Select only the intended account under Coinbase App & Advanced Trade; enable View for verification. Trade and Transfer are not needed by this release.
2. In this service's Render Environment settings, store the downloaded JSON in `COINBASE_API_KEY_JSON`. Supported downloaded formats: `name`/`privateKey`, or `id`/`secret`. Never commit or paste the value into chat.
3. Save and deploy, then open the app at `/#coinbase` and click **Check Coinbase connection**.
4. If the key exposes multiple portfolios, scope it to one intended account or explicitly set `COINBASE_PORTFOLIO_ID` in Render. An inaccessible explicit portfolio stops verification; the reader never substitutes another portfolio.

Alternatively, supported CLI environment inputs `COINBASE_KEY_ID` and `COINBASE_KEY_SECRET` can be set instead of the JSON variable. Configuration and credentials remain server-side. The child receives a minimal environment, request-history/update checks are disabled, configuration lives in an empty private temporary directory, and no shell is used. Raw provider errors are never sent to the browser. Successful and failed read snapshots are cached for 60 seconds and concurrent requests share one verification.

A successful check proves read access to the selected account, not stock-trading approval, spendable USD, profitability, or an authorized trading strategy. Total holdings can include staked assets. Missing totals stay unavailable. Cash-equivalent totals are not relabeled as exact USD buying power. No API key was supplied or live direct verification performed during implementation.

## Validation

- `node --test coinbase-reader.test.js dividends.test.js`
- `node operations/verify-coinbase-connection.mjs` (isolated real server; no live provider)
- UI verification used the existing linkedom sandbox to check the new panel, stale/failed responses, escaped provider text, and existing Signals/read-aloud behavior.

Sources checked during implementation: https://docs.cdp.coinbase.com/coinbase-for-agents/skill.md and the official CLI npm package README/command help. A separate tested order workflow and explicit user limits would be required before any future write capability.

The legacy full suite is not clean: older research expectations and unauthenticated lifecycle fixtures fail. The targeted reader, dividend, authenticated-connection, and UI checks listed above passed.
