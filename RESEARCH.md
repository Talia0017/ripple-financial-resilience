# Ripple research findings and methodology

Sheridan Datathon 2026 — Tangerine Track. These descriptive findings support the
Datathon presentation, UX case study and product decisions. They are not personal
insights about the account selected in the customer dashboard. The dashboard
shows only that account's actual recorded history and modeled scenario.

## Sources and permission

The organizers supplied `monthly_summary.csv` and `loans.csv`. The project owner
confirmed public use is permitted and the data contains no real customer records.
The committed derived assets cover all 4,500 accounts: full-precision summaries
in `public/data/profiles.json` and the latest 12 recorded monthly inflow/outflow
rows per account in `public/data/history.json`. Raw CSVs remain local for size.
See README for dataset attribution, export instructions and limitations.

## 1. Typical cash-flow summaries can hide monthly variation

Of 3,309 accounts whose all-history median money in is strictly above their
all-history median spending, all 3,309 have at least one complete recent recorded
cash-flow pair. Of those, 3,299 have at least one month with money out above
money in among their latest 12 recorded rows.

Each account contributes at most its latest 12 available records, not necessarily
12 consecutive calendar months. Missing pairs are excluded, never replaced with
zero. This result does not describe every historical month or a broader customer
population. Individual dashboard insights count only the selected account's
currently displayed six or twelve records.

## 2. Similar typical inflows can coexist with different estimated buffers

All 4,500 accounts have valid money-in and spending summaries in the current
export. Median typical money in is CAD 7,568.2625. The inclusive 95%–105% band is
CAD 7,189.849375–7,946.675625, containing 166 accounts.

Within this band, compare unrounded all-history median spending with unrounded
all-history median money in:

| Cash-flow group | Accounts | Valid buffer estimates | Median estimated buffer (CAD, unrounded) |
| --- | ---: | ---: | ---: |
| Money in covers spending | 116 | 116 | 30434.58583333333 |
| Spending exceeds money in | 50 | 50 | 17689.631666666668 |

Group percentages use the 166-account band as their denominator. Missing buffer
values would be excluded from the buffer median rather than substituted.
Buffers are historical balance estimates, not verified accessible savings.
The accounts need not have identical histories, commitments or recording periods.

## 3. The same modeled shock produces different runway outcomes

Reuse the preserved official engine for every account: job loss on, income
replacement 55%, and higher bills and emergency repair off. All 4,500 accounts
are calculable; none are unavailable in this export.

| Mutually exclusive outcome | Accounts |
| --- | ---: |
| Non-positive estimated buffer | 23 |
| Positive buffer with a monthly shortfall | 4,243 |
| Positive buffer with no monthly shortfall | 234 |

Apply the official precedence: non-positive buffer gives zero runway first;
otherwise a non-positive gap gives the official no-shortfall label; otherwise
divide remaining buffer by the positive gap and cap numerical runway at 120.
No-shortfall is a category, not a guaranteed 120-month duration. This compares
one common scenario, not different assumptions or verified EI eligibility.

## Design implications and limits

Keep actual monthly variation visible, distinguish estimated buffers from total
savings, and let users explore freely chosen hypothetical changes alongside
unchanged baseline information. Historical patterns do not establish a cause,
job loss or another specific event. The B/S spending equivalent is descriptive;
it does not model inflows or calculate official runway.

These are descriptive comparisons of challenge accounts. They are not causal
evidence, population estimates, forecasts or personalized financial advice.
Different record lengths and timing can affect summaries. Inflow and spending
medians may come from different months. The financial engine and plan assumptions
are documented separately in README and the optional interface methodology.

## Reproduction and retained verification

The unchanged `datasetStory` and `discoveryEvidence` functions in
`public/dashboard.mjs` perform the cohort analysis using the official assets and
engine. Research tests remain in `tests/web/discovery.test.mjs` and
`tests/web/dashboard.test.mjs`. Run:

```sh
npm test
npm run build
```

When original challenge CSVs are available, the Python verification scripts in
`financial_resilience/` independently compare profiles and recorded monthly rows
with those sources. The counts and group medians above were also independently
cross-checked with Python's `statistics` module. Removing the population panel
from the customer UI does not remove the research, source assets or test coverage.
