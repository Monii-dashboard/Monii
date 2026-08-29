# Product definition

## Vision

Monii is a personal wealth aggregation dashboard. It brings balances and
investment values from otherwise separate institutions into one understandable
view.

The fundamental product question is:

> What is the total current value of everything I own?

The long-term ambition is to represent a person's wealth and investments
clearly while hiding unnecessary provider complexity. This is a direction, not
a commitment to build every possible financial feature.

## V1 product outcome

V1 should show the best-known current wealth of the single user across
supported, configured financial accounts. Powens is the initial aggregation
source.

The dashboard must provide:

- one headline current-wealth value in EUR;
- a breakdown by financial institution and account;
- each account's contribution to the headline value;
- the last successful update and a visible stale or failed-sync state; and
- continued access to the latest valid data when a refresh fails.

Synchronization should happen approximately once per day. Each synchronization
should also retain a historical observation so later versions can explain how
wealth changed over time. A history chart or historical analysis is not
required in V1.

Connecting and reauthorizing Powens institutions may be operator-assisted in
V1. A polished onboarding and connection-management experience is not required
for this personal, single-user version.

## Meaning of the headline value

In V1, **current wealth** means the signed sum of the most recent usable EUR
valuation for every in-scope account.

This is not complete net worth. Dedicated loans, credit products, and other
liabilities are outside V1. A negative balance on an otherwise supported cash
account still reduces the total; supporting that ordinary account state does
not expand V1 into debt management.

The number is necessarily best-known rather than guaranteed real-time:

- A stale but previously valid account valuation remains included and is
  clearly marked stale.
- An account with no usable valuation remains visible but cannot contribute to
  the calculation. The aggregate must be marked incomplete rather than
  presented as comprehensive.
- A failed synchronization must not erase previously valid values.
- The total covers configured and supported accounts only. It cannot claim to
  include assets the system does not know about.

For an investment account, V1 needs its current estimated account value, not
the amount originally invested. Available position data may help explain or
derive that value in the future, but a holdings interface and advanced
investment analysis are not V1 requirements.

An account value and the positions inside that account must never both be added
to the total when they describe the same underlying wealth.

## V1 success criteria

V1 is successful when:

1. Supported Powens account data can be synchronized into the internal system
   without the dashboard calling Powens while rendering.
2. The user can see one best-known current-wealth value and understand which
   institutions and accounts contribute to it.
3. Included account contributions reconcile with the headline total without
   double counting cash, account balances, or investment positions.
4. A failure or incomplete response from one connection does not make other
   accounts unavailable or discard the last valid data.
5. The user can tell when displayed information was last updated and whether
   the total is stale or incomplete.
6. Daily observations begin accumulating even though V1 does not yet visualize
   wealth history.

## Explicitly outside V1

V1 does not include:

- advanced ETF, index, holdings, country, sector, or company exposure analysis;
- investment recommendations, AI recommendations, or portfolio optimization;
- tax optimization or sophisticated liquidity analysis;
- advanced return, performance, dividend, or gain/loss analytics;
- dedicated debt and liability management;
- manual assets or CSV/Excel imports;
- full multi-currency accounting and FX conversion;
- multi-user support, tenant isolation, or a multi-user authorization model; or
- polished self-service onboarding for financial-provider connections.

These boundaries are intended to protect the first version from scope drift.

## Possible future directions

Future versions may explore richer investment composition and performance,
instrument metadata and ETF normalization, historical wealth analysis,
liquidity, dividends, RSUs, manual and imported assets, more data sources,
multiple currencies, multiple users, and AI-assisted explanations.

These are possibilities rather than promises. They matter today only where a
simple V1 decision could otherwise create an obvious and unnecessary obstacle.

## Current assumptions

- The product initially serves one known user.
- EUR is the reporting currency for V1.
- Powens is the primary initial source, not the product's domain model.
- Synchronization runs approximately daily rather than on every page load.
- Exact provider coverage, freshness thresholds, synchronization scheduling,
  and valuation fallback rules will be decided during implementation.

The conceptual boundaries for those later decisions are recorded in
[Domain and engineering principles](domain-and-engineering.md).
