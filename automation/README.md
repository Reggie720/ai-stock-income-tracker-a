# Automatic stock buyer preparation — not activated

Owner confirmed a $25 total budget on November 21, 2026 (America/Phoenix). This means cumulative BUY principal plus fees and pending reservations; sale proceeds must not replenish the cap. No portfolio transfers, crypto liquidation, deposits, borrowing, or margin are authorized by this instruction.

Coinbase's connected product discovery returned EQUITY listings SGOV-USD, JEPI-USD, DIVO-USD and O-USD. Product visibility does not prove this owner's stock-trading eligibility, permission, available USD or an executable quote. These are the proposed initial symbols from the existing tracker watchlist, not a completed owner approval of scope.

`buy-budget.js` implements an exact-cent, fail-closed preparation check. It requires $25 budget, owner-approved symbols and strategy, a loss limit, explicit portfolio, verified permission and stock eligibility, fresh reconciled ledger, fresh qualified signal and market session, a proven maximum order cost including fees, and spendable USD. It never submits an order. Its output always reports liveOrdersEnabled=false.

Tests use entirely fictional approval, portfolio and loss-limit fixtures. The $2 loss value in tests is NOT an owner-selected limit. This module is not wired into production, has no browser activation control, no scheduler, no transaction ledger and no live order adapter. It is a preparatory change for review, not a completed automatic buyer.

## Required next implementation

1. Obtain maximum loss, initial symbols, per-order size and exact entry/exit strategy terms; show them on a reviewable Start/Stop screen. Pausing prevents new buys but does not cancel existing orders or liquidate holdings implicitly.
2. Verify the tracker's own key trade permission, selected-account equity eligibility and actual spendable USD using supported read operations. Do not send an order as an eligibility test. Any permission upgrade happens privately with the owner; never request a key in chat.
3. Add a durable transaction journal with an atomic conditional reservation and unique signal/client-order IDs before any order write. Persist approved policy and pause state on the server. Reject browser-supplied account proofs. This pure helper is not sufficient for concurrency control.
4. Implement the documented Coinbase order contract, fee/cost bounds, market-session checks, reconciliation and bounded recovery on the original interface. Unknown outcomes hold reservations and pause new buys until reconciled; cancellation releases only proven unspent amounts after fills are reconciled. Do not recycle sale proceeds.
5. Add a server-side scheduler with durable locking and a tested Start/Stop control. An idle/free web instance cannot be assumed to monitor continuously. No scheduler has been enabled by this branch.
6. Sell only bot-owned filled quantities under separately approved exit terms; never sell pre-existing crypto or staked holdings to fund stocks.
7. Keep learning in a labeled evaluation journal and practice validation initially. Do not let an AI rewrite its own permissions, spending cap or stop limits. Stop-new-orders threshold is not a guaranteed maximum realized loss; gaps, fees and existing fills can exceed it.

Validation: `node --test automation/buy-budget.test.js`. No real financial writes are used in testing. The existing direct account reader remains unchanged.
