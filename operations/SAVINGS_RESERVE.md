# Savings rule: above $200, reserve 50%

Owner authorized this rule on November 21, 2026, America/Phoenix. The separate $25 starting buy budget remains unchanged; raising the savings threshold is not authorization to spend $200 or recycle sales into unlimited purchases.

## Shipped in this change

- Savings tab and `/#savings` deep link, showing the requested threshold and half-balance arithmetic.
- Authenticated `GET /api/savings` reports the configured rule and honestly unavailable reserve/withdrawable balance. Automatic allocation, withdrawals and trading are OFF.
- Authenticated `POST /api/savings/illustrate` performs exact-cent example arithmetic only, without reading/writing accounts or storage. At $200 exactly there is no split. At $300, the example allocates $150 to savings and $150 to trading; odd cents remain in trading.
- Internal pure ledger reducer for the future worker. It verifies explicit portfolio, USD currency, reconciled bot-owned positions and pending orders, fresh snapshot sequence, reserve journal integrity and enough unreserved settled cash. It rejects stale/replayed events, does not mutate its input, and serializes without losing precision. Existing reserves are excluded from input trading balance.
- One split per threshold crossing. If half of a large balance still exceeds $200, repeated polling must not repeatedly halve it; rearm after the remaining trading balance is $200 or less.

## Not activated

There is no funded savings balance, financial write endpoint, PayPal connection, withdrawal facility, live savings worker or completed automatic trading engine in this release. No Coinbase permissions or environment secrets are changed. No real funds are moved. The read-only Coinbase account connection remains unchanged, and existing tracker records are not migrated or overwritten.

The reducer is not called by an HTTP route. A future worker must derive bot-owned equity and settled cash from authoritative reconciliation (excluding existing reserve and open-buy holds), and persist the reserve journal atomically with cash and order reservations. A pure function cannot guarantee concurrency safety. All buy reservations must subtract this reserve before orders are sent. Unknown/reconciliation failures block allocation and new orders; a timeout is not permission to release held cash. Bookkeeping does not physically segregate funds on Coinbase or prevent the owner from spending outside this app.

No automatic sale, crypto liquidation, unstaking, deposit or transfer is authorized to fund this reserve. If sufficient settled dollars are unavailable, the reducer reports waiting_for_settled_usd and reserves nothing. A future cash-out/transfer implementation requires supported account capabilities and explicit destination/amount approval. This change makes no claim of insured bank savings or withdrawability.

The automatic buyer still requires an owner-chosen loss limit and approved entry/exit/per-order terms, durable order/reservation storage, account/key trading verification and a tested scheduler. Learning must not modify permissions or these money limits.

## Validation

- `node --test savings-rule.test.js coinbase-reader.test.js dividends.test.js` — 24 passed.
- `node operations/verify-coinbase-connection.mjs` — real isolated server verifies login requirements, no-store responses, strict threshold arithmetic, malformed amount rejection, and absent financial write routes. No real provider calls or secrets used.
- Local DOM verification covers the Savings tab, exact-$200/no-split example, $300 example, failure states and existing Coinbase/Signals/chart/read-aloud behavior. No device withdrawal or trading test was performed.

Legacy research/lifecycle tests retain their pre-existing mismatched expectations and unauthenticated fixtures; this is not a clean full-suite claim.
