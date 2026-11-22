// This reserve is bookkeeping, not a Coinbase portfolio/bank transfer.
// No public endpoint can call applySavingsSnapshot. A future verified worker must
// persist its result atomically with the bot's cash/order ledger.
export const savingsPolicy = Object.freeze({
  currency: 'USD', threshold: '200.00', comparison: 'strictly_above',
  percentage: 50, basis: 'bot_trading_balance_excluding_existing_savings',
  funding: 'unreserved_settled_usd_only', automaticWithdrawals: false,
  activation: 'waiting_for_verified_trading_ledger'
});
export function parseUsd(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(value)) throw Error('Enter a nonnegative dollar amount with at most two decimals');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
const usd = value => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
export function savingsIllustration(balance) {
  const total = parseUsd(balance), setAside = total > 20000n ? total / 2n : 0n;
  return {illustrationOnly: true, currency: 'USD', balance: usd(total), triggers: total > 20000n,
    savings: usd(setAside), trading: usd(total - setAside),
    assumption: 'First crossing, no existing savings, and enough settled USD; no funds are moved.'};
}
export function savingsStatus() {
  return {policy: savingsPolicy, reserve: null, withdrawable: null, liveAllocationEnabled: false,
    automaticTrading: false, transfersEnabled: false,
    message: 'Rule prepared. Automatic savings is waiting for a verified bot trading ledger and settled USD. No money has been set aside or transferred.'};
}
export function emptySavingsLedger(portfolioId) {
  if (typeof portfolioId !== 'string' || !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(portfolioId)) throw Error('An explicit Coinbase portfolio is required');
  return {version: 1, portfolioId, currency: 'USD', reserve: '0.00', armed: true, lastSequence: 0, entries: []};
}
export function applySavingsSnapshot(ledger, snapshot, now = Date.now()) {
  const unchanged = reason => ({ledger, allocated: '0.00', reason});
  // These inputs must be produced by server reconciliation, not user balances,
  // AI responses, aggregate holdings or browser-supplied claims.
  try {
    if (!ledger || ledger.version !== 1 || ledger.currency !== 'USD' || typeof ledger.armed !== 'boolean' ||
        !Number.isSafeInteger(ledger.lastSequence) || ledger.lastSequence < 0 || !Array.isArray(ledger.entries)) return unchanged('invalid_ledger');
    const reserve = parseUsd(ledger.reserve);
    // A corrupt or truncated ledger must never silently restore spendable cash.
    const ids = new Set(); let sum = 0n;
    for (const entry of ledger.entries) {
      if (!entry || typeof entry.id !== 'string' || ids.has(entry.id)) return unchanged('invalid_ledger');
      ids.add(entry.id); sum += parseUsd(entry.amount);
    }
    if (sum !== reserve) return unchanged('invalid_ledger');
    if (!snapshot || snapshot.portfolioId !== ledger.portfolioId || snapshot.currency !== 'USD') return unchanged('portfolio_or_currency_mismatch');
    if (snapshot.reconciled !== true || snapshot.botPositionsIdentified !== true || snapshot.pendingOrdersResolved !== true) return unchanged('reconciliation_required');
    if (!Number.isFinite(now) || !Number.isFinite(snapshot.checkedAt) || snapshot.checkedAt > now || now - snapshot.checkedAt > 60000) return unchanged('stale_snapshot');
    if (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence <= ledger.lastSequence ||
        typeof snapshot.id !== 'string' || snapshot.id.length < 1 || snapshot.id.length > 128 || ids.has(snapshot.id)) return unchanged('duplicate_or_old_snapshot');
    const trading = parseUsd(snapshot.tradingBalance), cash = parseUsd(snapshot.unreservedSettledUsd);
    if (cash > trading) return unchanged('invalid_balance');
    if (trading <= 20000n) return {ledger: {...ledger, armed: true, lastSequence: snapshot.sequence}, allocated: '0.00', reason: 'below_threshold'};
    if (!ledger.armed) return {ledger: {...ledger, lastSequence: snapshot.sequence}, allocated: '0.00', reason: 'already_split_this_crossing'};
    const amount = trading / 2n;
    // Never sell assets, unstake crypto or count unsettled proceeds to fund savings.
    if (cash < amount) return {ledger: {...ledger, lastSequence: snapshot.sequence}, allocated: '0.00', reason: 'waiting_for_settled_usd'};
    const after = trading - amount;
    return {ledger: {...ledger, reserve: usd(reserve + amount), armed: after <= 20000n,
      lastSequence: snapshot.sequence, entries: [...ledger.entries, {
        id: snapshot.id, sequence: snapshot.sequence, amount: usd(amount),
        tradingBefore: usd(trading), tradingAfter: usd(after), checkedAt: snapshot.checkedAt
      }]}, allocated: usd(amount), tradingAfter: usd(after), reason: 'reserved_in_ledger'};
  } catch { return unchanged('invalid_or_unknown_amount'); }
}
