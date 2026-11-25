# Learning and sourced research

The learning worker is independent of the financial worker. It runs every five minutes at minutes 2, 7, 12, and so on, after the monitor's quote refresh, during weekdays 09:30–16:20 New York, records at most one prospective observation per symbol per fifteen-minute slot, and evaluates the next 60 minutes of sampled prices. Forecasts are created only with fresh feed/quotes, at least six distinct observations spanning 30 minutes, and no gap above ten minutes. Outcomes require a real quote at or after the due time within ten minutes, from the same session and not the future. Unavailable/session-ended outcomes are recorded separately, never counted as wins.

## Learning model

Two predeclared empirical candidates are compared: momentum/pullback bins, and symbol plus momentum/pullback bins. Bucket probabilities are shrunk toward a prior estimated from training data. No future or current-session labels enter a daily review. At least forty observed outcomes across eight separate sessions are required. Training uses earlier sessions; the latest thirty percent (at least three sessions) is held out. Activation requires lower Brier prediction error by at least 0.01 and no worse classification accuracy than the training-prior baseline. Minimum training/validation counts and session counts are enforced. At most three model activations per ninety days and fourteen days between activations are permitted. A model can be removed after at least twenty genuinely forward forecasts across five sessions show worse prediction error than their recorded baseline.

Learned rankings only reorder already approved, signal-qualified stocks. They cannot change the watchlist, cash allocation, cumulative buying cap, order size, entry/exit thresholds, trading calendar/session, broker safety checks, or the separate explicitly authorized one-time $1 O purchase. AI-generated prose never reaches order creation. Existing automatic alert-rule tightening remains a separate bounded learner; its real examples remain visible and are not relabeled as new laboratory forecasts.

## Sourced daily research

The existing Finnhub credential retrieves company profiles and up to two dated news headlines per approved symbol. Unsupported profiles/news remain unavailable, especially for funds. Quote values retain their provider timestamps and stale flags. Headlines are not described as full-article reviews. The existing Groq model receives only these source facts and summarized measured memory, with instructions to distinguish interpretation, risks and unknowns. Generated source IDs and symbols are checked; fabricated source references and generated URLs are rejected. Facts and interpretation are stored separately. Missing AI output never produces a fabricated report. A report is generated daily, with at most three attempts per day spaced at least an hour apart on failure.

The normal AI Research screen also receives summarized learning memory and the latest note. Actual reconciled Coinbase fills, realized net on sales and recorded fees are summarized separately from paper orders and price forecasts. Neither price gains nor simulation results are presented as actual money earned.

## Storage and operation

`stock_tracker_learning_lab` is a private RLS-enabled singleton with service-only SELECT/UPDATE and an atomic versioned CAS RPC. The server signs canonical data and version using a domain-separated HMAC with the existing Render-only ledger key. Only the exact untouched OFF-independent seed is accepted unsigned. A version trigger rejects rollback; there is no local fallback. A durable lease handles competing research workers. Memory retains a rolling maximum of 2000 observations, thirty dated research reports, ninety review entries and cumulative per-stock outcome counts. It can be downloaded from the authenticated Learning & research screen.

The scheduler uses its own signature domain and fixed endpoint, avoiding collisions with trading requests on the same second. Requests contain only short-lived signatures, not permanent tokens or broker keys. The daily research worker makes no order/transfer/deposit/withdrawal calls. A learning outage or lack of a validated ranking leaves the existing approved trading rules in effect.

## Verification

Tests cover prospective forecast deduplication, quote freshness and gaps, no future-label leakage, session-separated validation, minimum evidence, genuine forward rollback, concurrent worker leases, provider failure, source-ID and unsafe-URL rejection, signed-memory tampering, actual-fill accounting, private SQL/CAS permissions and rollback prevention, browser escaping and failure clearing, and preservation of the trading cap/scheduled entry under learned rankings. Existing financial-engine, connection, savings, dividends and authenticated HTTP checks are rerun. These verify mechanics, not profitability. No financial order is placed as a test.

The system learns bounded empirical probabilities and uses an existing language model for sourced interpretation. It does not retrain that language model, understand markets like a human, guarantee gains, or promise an order fill. New evidence must accumulate prospectively; historical observations and synthetic tests are never passed off as live learning successes.
