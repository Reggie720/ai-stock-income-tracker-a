// Preparation only. This module never submits orders or enables live trading.
// Integrators must persist/reserve inside a database transaction before any write.
export const TOTAL_CAP_CENTS = 2500n;
export const proposedProducts = Object.freeze(['SGOV-USD', 'JEPI-USD', 'DIVO-USD', 'O-USD']);

export function cents(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(value)) {
    throw new Error('An exact nonnegative USD amount with at most two decimals is required');
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
const dollars = amount => `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
const fresh = (timestamp, now) => Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= 60000;

// Consumes server-verified snapshots, never browser-supplied evidence.
// Ledger fields include fees. Sell proceeds do not reset lifetime buy spending.
export function assessBuy({policy, ledger, evidence, order, now = Date.now()} = {}) {
  const blocked = reason => ({readyForReservation: false, liveOrdersEnabled: false, reason});
  try {
    if (!policy || !ledger || !evidence || !order || !Number.isFinite(now)) return blocked('incomplete_inputs');
    if (policy.currency !== 'USD' || cents(policy.totalBudget) !== TOTAL_CAP_CENTS) return blocked('budget_must_be_25_usd');
    if (policy.ownerApproved !== true || policy.productsApproved !== true || policy.strategyApproved !== true) return blocked('owner_terms_required');
    if (!Array.isArray(policy.products) || !policy.products.length || policy.products.some(p => !proposedProducts.includes(p))) return blocked('product_scope_required');
    const lossLimit = cents(policy.maximumLoss);
    if (lossLimit <= 0n || lossLimit > TOTAL_CAP_CENTS) return blocked('loss_limit_required');
    if (!uuid(policy.portfolioId) || policy.portfolioId !== evidence.portfolioId || ledger.portfolioId !== policy.portfolioId) return blocked('portfolio_mismatch');
    if (ledger.currency !== 'USD' || ledger.complete !== true || ledger.reconciled !== true || ledger.unresolvedOrders !== 0) return blocked('reconciliation_required');
    if (!fresh(ledger.checkedAt, now) || !fresh(evidence.checkedAt, now)) return blocked('stale_account_or_ledger');
    if (evidence.canTrade !== true || evidence.equityEligible !== true) return blocked('stock_trading_access_unverified');
    if (evidence.marketOpen !== true || evidence.session !== 'NORMAL') return blocked('regular_market_required');
    if (evidence.strategyQualified !== true || !fresh(evidence.quoteAt, now)) return blocked('fresh_qualified_signal_required');
    if (cents(ledger.lossToDate) >= lossLimit) return blocked('loss_limit_reached');
    if (policy.paused !== false) return blocked('paused');
    if (order.side !== 'BUY' || order.currency !== 'USD' || !policy.products.includes(order.productId)) return blocked('order_outside_scope');
    if (order.productType !== 'EQUITY' || order.session !== 'NORMAL') return blocked('equity_regular_session_only');
    if (evidence.productId !== order.productId || evidence.currency !== 'USD') return blocked('quote_product_mismatch');
    if (evidence.previewVerified !== true || evidence.costBoundVerified !== true) return blocked('verified_cost_bound_required');
    const amount = cents(order.maximumPrincipal), fees = cents(order.maximumFees);
    if (amount <= 0n) return blocked('positive_order_required');
    const cost = amount + fees;
    const used = cents(ledger.lifetimeBuyCost), reserved = cents(ledger.pendingBuyCost);
    if (used + reserved + cost > TOTAL_CAP_CENTS) return blocked('total_budget_exceeded');
    if (cost > cents(evidence.spendableUsd)) return blocked('insufficient_spendable_usd');
    return {readyForReservation: true, liveOrdersEnabled: false, reason: 'transactional_reservation_required', maximumCost: dollars(cost), remainingAfterReservation: dollars(TOTAL_CAP_CENTS - used - reserved - cost)};
  } catch {
    return blocked('invalid_or_unknown_amount');
  }
}
