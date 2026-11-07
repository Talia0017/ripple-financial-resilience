# Ripple — Financial Resilience Engine

**Sheridan Datathon 2026 — Tangerine Track: “Resilience Rewired”**

Ripple helps people understand financial resilience and explore what changes
when income falls, bills rise, or a one-time emergency uses their cash buffer.
The public website supports **all 4,500 official challenge accounts** with the
track's exact financial calculations and adjustable combined shock scenarios.

The challenge data does **not** contain real customer records. The project owner
confirmed with the organizers that it may be used publicly, as reported on
2026-11-07. Dataset attribution remains with the organizers and track providers.

中文部署步骤：[VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)。
原有本地版说明：[financial_resilience/README.md](financial_resilience/README.md)。

## Architecture

```text
Official CSVs → Python/Pandas + existing engine.py → public/data/profiles.json
                                                         ↓
                          Static HTML/CSS/JavaScript website → Vercel
```

Python precomputes I, S, F, B, H, P and history-quality metadata once. A compact,
full-precision JSON file includes every account. Browser JavaScript applies the
same shock and runway rules instantly. There is no database, API server,
authentication, paid service, Docker requirement or runtime Python dependency
for the public website.

The original Streamlit application and Python financial engine remain available
for local CSV inspection and independent verification. Its local monthly-history
viewer is preserved; the public website ships account summaries rather than the
full raw monthly ledger.

## Features

- Search any valid official `account_id`, or choose a random account.
- View monthly income, spending, fixed costs, buffer, household bills and loan payment.
- See baseline runway and combine job loss, higher bills and emergency repair.
- Adjust EI replacement rate, bill increase and one-off repair amount.
- Compare before/after income, spending, one-off costs, remaining buffer, monthly
  shortfall and financial runway.
- Reset all parameters; switching accounts also resets the scenario.
- Read financial definitions, missing-data explanations and model limitations.
- Handle unknown IDs, failed data loading, missing metrics, negative buffers,
  zero shortfalls and repairs that exceed the buffer without fabricated fallbacks.

## Quick start: public website

Install Node.js 22 or newer, then run these commands from the repository root:

```sh
npm ci --ignore-scripts
npm test
npm run build
```

There are no third-party npm dependencies. The build copies only the website's
five required files into `dist/` and validates all 4,500 bundled profiles.
No CSV, Python, virtual environment or developer-specific path is needed to build
or run this public version.

To preview, serve `dist/` with any static HTTP server. If Python is installed:

```sh
python3 -m http.server 8502 --bind 127.0.0.1 --directory dist
```

Open http://localhost:8502. Do not double-click `index.html` via `file://` because
browser module and fetch security rules require HTTP.

## Deploy on Vercel

Import `Talia0017/ripple-financial-resilience`, production branch `main`.
Use **Framework Preset: Other**, **Root Directory: ./**, **Build Command:
`npm run build`**, **Install Command: `npm ci --ignore-scripts`**,
**Output Directory: `dist`**. No environment variables or `PORT` are required.
`vercel.json` declares these settings. Remove any old Container/Streamlit build
overrides if an existing Vercel project was configured for the earlier approach.
See the [full Chinese guide](VERCEL_DEPLOYMENT.md) for deployment verification.

A local build or a GitHub push is not proof of a live deployment. Only report the
site as live after the actual Vercel URL and its profile asset have been checked.

## Dataset attribution and public-use permission

Source: `monthly_summary.csv` and `loans.csv` from **Sheridan Datathon 2026 —
Tangerine Track**. Credit belongs to the event organizers and the Tangerine Track
data providers. Ripple does not claim ownership or apply a new license to the data.

Public use was confirmed by the organizers as relayed by the project owner on
2026-11-07; the supplied challenge datasets do not contain real customer records.
This supersedes the earlier restricted-data deployment assumption.

The repository publishes the derived account profiles in
[`public/data/profiles.json`](public/data/profiles.json): **424,141 bytes** for
all 4,500 accounts at the current export. A column list and compact rows avoid
repeating field names. No precision is removed from financial values. The asset
contains account IDs, six financial metrics and history-quality metadata, with
source-file SHA-256 hashes and attribution. It contains no raw transactions,
names, addresses, credentials or access tokens.

Raw CSVs remain excluded to keep the repository and deployment small. They are
needed only to regenerate or independently verify the profiles. Obtain the
original files from the organizers' official track resources, then place them in
`data/` or set `RESILIENCE_DATA_DIR`. See [data/README.md](data/README.md).

## Regenerate profiles / use the local Streamlit version

```sh
python3 -m venv financial_resilience/.venv
financial_resilience/.venv/bin/python -m pip install -r financial_resilience/requirements.txt
financial_resilience/.venv/bin/python financial_resilience/export_profiles.py
```

The exporter reuses `engine.py`, validates the expected account count, retains
full precision, and writes deterministic JSON. Missing/invalid source files do
not trigger a fake-data fallback. Commit the regenerated JSON after testing;
Vercel builds use that committed asset rather than trying to read your computer.

To run the preserved local interface:

```sh
financial_resilience/.venv/bin/python -m streamlit run financial_resilience/app.py --server.address 127.0.0.1 --server.port 8501 --server.showEmailPrompt false --browser.gatherUsageStats false
```

On macOS you can also double-click `financial_resilience/启动应用.command`.
On Windows use `py` to create the environment and
`financial_resilience\.venv\Scripts\python.exe` in place of the executable above.

## Exact official calculations

| Metric | Definition |
|---|---|
| I | Median `money_in` over all available monthly records |
| S | Median `money_out` |
| F | Median of each month's `household_bills + insurance + loan_payments` |
| B | Mean `avg_daily_balance` across the last six rows sorted by month; use available rows if fewer and disclose this |
| H | Median `household_bills` |
| P | Sum of `monthly_payment` for loans started by 2025-12-31 and marked C/D in the official year-end snapshot; otherwise 0 when loan data is complete |

**`money_out` already includes loan payments. P and F are never added to S.**
Missing data is not silently filled with zero. Fixed costs require all three
same-month components; the buffer never reaches outside the last-six-row window
to replace missing values. Unsupported metrics remain unknown.

```text
Job loss enabled:     income_after = I × EI rate          (default 55%)
Higher bills enabled: spending_after = S + H × increase   (default 15%)
Repair enabled:       one_off_costs = repair_cost         (default S)
Disabled shocks leave the corresponding baseline unchanged.

buffer_left = B − one_off_costs
gap = spending_after − income_after

buffer_left <= 0                 → runway = 0
buffer_left > 0 and gap <= 0      → "No shortfall (120+)"
otherwise                       → min(buffer_left / gap, 120)
```

Numeric runway is displayed to one decimal place, including Python-compatible
ties-to-even formatting. Amounts retain the CSV's original units; no CAD currency
assumption or conversion is made.

The runway is a static simplified judging calculation, not a time-based forecast.
EI eligibility, benefit caps and duration are not established; EI is not assumed
to last indefinitely. B is a historical proxy, not a live available balance.
Personalized savings goals and backup plans remain a future phase.

## Tests and verification

```sh
npm test
npm run build
financial_resilience/.venv/bin/python -m unittest discover -s financial_resilience/tests -v
```

The Python synthetic fixtures and JavaScript edge tests cover medians, fixed-cost
ordering, last-six-month selection, loan status/cutoff, missing values/files,
negative balances, missing IDs, zero shortfall, caps and excessive repair costs.
The synthetic I=3000, S=2500, B=5000, EI=55% example yields **5.9 months**.
JavaScript also validates all shipped profiles and 50 seeded random lookups.

With the official CSVs locally available:

```sh
financial_resilience/.venv/bin/python financial_resilience/verify_real_data.py
financial_resilience/.venv/bin/python financial_resilience/verify_web_profiles.py
```

The first tool independently checks all 4,500 accounts with Python `csv` and
`statistics`. The second checks all exported profiles against the original
engine and compares **54,000 JavaScript/Python shock results**, including exact
runway labels. No generated check report is required by the deployed website.

## AI-assisted development disclosure

Ripple is a solo Interaction Design student project, developed with assistance
from OpenAI Codex for implementation, tests, documentation and Git workflow.
The owner directs product and UX/UI decisions and remains responsible for
reviewing and explaining the submitted work. Outputs are tested against the
original engine and independently checked against the official challenge data.
The website does not call an AI API or transmit account selections to an AI
service at runtime.
