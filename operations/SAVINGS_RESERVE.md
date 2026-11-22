# Savings reserve status

The live engine implementation and owner controls are documented in [TRADING_SETUP.md](TRADING_SETUP.md). Start remains OFF until the owner accepts a plan and has the intended stock-account permission and settled USD.

The existing exact-cent illustration and pure savings reducer remain tested. The engine's signed ledger now performs the same >$200/50% allocation using verified bot cash, and excludes existing reserves from new buys and later splits. It never withdraws or transfers savings. Sale proceeds stay pending until the owner confirms the exact sales settled and scoped USD coverage is checked; available-to-trade balances alone are not treated as settlement proof. A funded reserve shown in Savings is bookkeeping, not a bank account or verified withdrawal balance.

At $200 exactly there is no split; $300 produces a $150 reserve only when the bot has enough verified cash. If a large split still leaves trading funds above $200, it does not repeatedly split the same crossing. Existing tracker records and manually tracked holdings are preserved. The starting cumulative buying cap remains $25, with $10 stopping new buys; neither the savings threshold nor sale proceeds increases that cap.

Validation covers strict threshold arithmetic, odd-cent rounding, repeat/replayed events, unknown/stale snapshots, role access, signed engine state, insufficient cash and existing read-only UI behavior. No real money was moved for testing.
