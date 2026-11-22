# Bounded Coinbase stock engine — OFF by default

The owner selected a $25 cumulative buying cap including fees, a $10 loss threshold that stops new buys, and a 50% savings reserve strictly above $200. Start/Pause, execution and persistence are implemented in this release. No real trade has been placed for verification, and no owner trading plan has been activated.

## Reviewable proposal

`stock-pattern-v1`: choose from SGOV-USD, JEPI-USD, DIVO-USD and O-USD; buy $1 on the existing fresh hourly upward-pattern signal, one attempt per product per New York trading day and one bot position per product. Sell the bot-tracked quantity at a sampled 5% gain or loss from recorded cost. The $10 account loss threshold latches new buys off; ordinary exits remain eligible unless the owner pauses the engine. Pausing stops new submissions, not orders already in flight. Sale proceeds do not reset the cumulative $25 buying cap. The owner must accept the specific scope, approved-stock-account assertion, initial settled USD and market-order execution risk in the app before Start.

These entry/exit parameters are a proposed rule, not an owner approval or a demonstrated profitable strategy. The existing monitor can evaluate its bounded price filter, but this engine does not retrain an AI or raise its own limits. Never label simulation tests as proven investment returns.

## Execution and account checks

The separate official CLI/CDP key must expose one intended portfolio, with View and Trade. Transfer is unnecessary and no transfer, margin, crypto or withdrawal command is implemented. Startup stays OFF even if key permission changes. Account scope is verified by portfolio listing, current-key permission and scoped paginated USD balances. Start binds the displayed account fingerprint to the fresh account check; a portfolio change blocks activation. Missing values never become zero. Broker product identity, fractional minimums, increments, zero stock commission, current public fee disclosures, and sampled signal freshness are rechecked before the only write call.

The worker places ordinary dollar-sized market BUY / base-sized market SELL orders with explicit NORMAL session and persisted client_order_id. Equity previews are unsupported; this is disclosed for owner acceptance rather than treated as proof that trading is impossible. It follows the official zero-stock-trade-fee disclosure plus runtime EQUITY fee-tier checks; zero/missing historical fee totals are not used as evidence. Public fee disclosure verification expires daily and fails closed if the source changes or is unavailable. Calendar coverage is the verified NYSE 2026–2028 holiday/early-close schedule; entries/exits use a narrower 10:00–15:30 New York window (12:30 early closes). Provider halts/rejections never cause fallback to another session, currency, product or credential.

Existing non-bot holdings block a new position in that product. A sale requires the broker's total/available stock quantities to match the exact quantity recorded from bot fills. Portfolio quantity numbers are used only as an additional guard; order sizes come from exact fill strings and valid increments. Unexpected manual account changes require reconciliation.

## Durable state and unknown outcomes

A separate service-only RLS table stores versioned state. Anonymous and normal authenticated roles have no table or RPC access. An invoker RPC performs compare-and-swap. A trigger enforces consecutive versions and nondecreasing cumulative spending. A dedicated Render-only COINBASE_LEDGER_SIGNING_KEY signs canonical state with its version; unsigned changes and application-role rollback/replay fail verification. The exact untouched version-0 OFF seed is the sole unsigned bootstrap. This assumes the database owner/platform and Render administrator are trusted; it is not protection from a fully compromised infrastructure owner.

Reservation and client ID are committed before a write. Two workers cannot submit one reservation twice. Unknown writes retain their reservation and pause instead of automatically retrying, releasing cash or switching interfaces. Known order IDs are reconciled through the same interface; actual fill sizes and fees are required, including terminal partial fills. Missing or inconsistent fields stop new orders. State is not reset when pausing/resuming. A pending unknown order requires owner/broker reconciliation; no unsafe generic reset or replacement-order endpoint is provided.

## Scheduler and request authentication

The Supabase cron job checks once a minute but sends HTTP only during weekdays 09:45–16:05 New York and only when active or a known order needs reconciliation. It does not keep an OFF idle web service awake. Render may cold-start and network requests may be delayed; UI displays the actual last check rather than claiming continuous streaming.

The signing token is stored privately in Render and Vault. Requests carry a 90-second HMAC timestamp signature, with replay detection; the long-lived key is not queued as a bearer header. A default pg_net queue PUBLIC grant could not be removed by the migration role, so the design avoids placing a permanent worker credential in it. Existing unrelated tables or application policies were not changed. The worker ignores request-supplied trading instructions and uses only the owner-approved signed server ledger.

## Savings and settlement

Half of the bot trading balance above $200 is reserved only when enough bot cash is verified and available; reserved cash is excluded from buys. A split is latched until the remaining trading balance is $200 or below, preventing repeated halving of an unchanged high balance. This is app bookkeeping, not a separate bank or Coinbase portfolio transfer.

Sale proceeds remain pending, not assumed settled or withdrawable. Since available-to-trade USD does not prove settlement, the owner must confirm the exact listed sales settled in Coinbase; the app independently rechecks portfolio/USD coverage before crediting them to bot cash. Confirmation cannot credit the same sale twice or reset spending. Once sufficient verified cash exists the next active worker can reserve it automatically. There is no PayPal, bank-transfer or withdrawal endpoint. Do not describe this reserve as an insured savings account.

## Validation and limits

48 targeted tests passed across trading engine, production-adapter command construction, state signatures, account reader/readiness, savings and dividends. Scenarios include competing workers, partial fills, unknown outcomes, pause/submission races, exact portfolio binding, pre-existing holdings, fees changing, stale data, settlement confirmation and loss/budget limits. Real isolated HTTP checks cover auth, same-origin controls, disabled financial activation without setup, signed-worker denial and existing connection/savings behavior. Local DOM checks cover complete plan consent, Start gating, Pause, existing Signals/chart/speech and no fabricated balances. PostgreSQL-compatible tests verify CAS and role access; production migration checks confirm the ledger starts OFF and anonymous access is denied.

No live financial order, transfer or deposit was used to test. Actual fills, stock eligibility and provider behavior still depend on the user's account and permissions. Market prices, stops, fees and outages can produce losses; the $10 threshold is not a guaranteed realized-loss cap. Legacy research/lifecycle tests retain unrelated baseline expectations/auth-fixture failures, so this is not a clean full-suite claim.

Sources verified November 21, 2026 America/Phoenix:
- https://www.coinbase.com/stocks
- https://help.coinbase.com/en/trading-and-funding/stock-order-types
- https://help.coinbase.com/en/trading-and-funding/pricing-and-fees/stock-pricing-fees
- https://www.nyse.com/markets/hours-calendars
- https://docs.cdp.coinbase.com/coinbase-for-agents/skill.md
- Installed pinned official CLI 0.0.11 command help (current commands supersede older bundled examples).
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/database/functions
