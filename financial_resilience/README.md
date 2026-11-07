# Ripple — Local Financial Resilience Engine

**Sheridan Datathon 2026 — Tangerine Track · Resilience Rewired**

See the [root README](../README.md) for the public website, cross-platform setup,
dataset attribution and AI-assisted development disclosure. The public website
uses precomputed profiles for all 4,500 official accounts; see the
[Vercel deployment guide](../VERCEL_DEPLOYMENT.md) for its settings.

This directory contains the preserved **local Streamlit application**. It reads
the official CSVs, displays financial metrics, supports combined shocks, and
lets you inspect the original monthly records. It uses Python, Pandas and
Streamlit, with no database, authentication or paid API.

## Open the local app

On macOS:

1. Open this repository's `financial_resilience` directory in Finder.
2. Double-click **start_ripple.command**. It opens a Terminal window and starts
   the app without requiring you to enter a command.
3. If the browser does not open automatically, visit http://localhost:8501.
4. Keep the Terminal window open while using the app. Press **Control + C** in
   that window when you want to stop it.

If the window reports `Port 8501 is already in use`, check the address above;
the app may already be running. The launcher requires Python 3.9 or newer and
creates a project-local `.venv` if needed. Installing dependencies requires a
network connection. It does not install Python itself.

You can also start the app from the repository root:

```sh
financial_resilience/.venv/bin/python -m streamlit run financial_resilience/app.py --server.address 127.0.0.1 --server.port 8501 --server.showEmailPrompt false --browser.gatherUsageStats false
```

See the root README for environment creation and Windows executable paths.

## Try the features

1. Search for an official **Account ID** and select it from the list.
2. Review the six financial metrics and **Baseline financial runway**.
3. Enable **Job loss**, adjust the EI replacement rate, and observe the results.
4. Combine **Higher household bills** and **Emergency repair**; change the bill
   increase and repair amount.
5. Check the **Before / after comparison**. A repair reduces the buffer once;
   it is not added to monthly spending.
6. Set the repair cost above the buffer. Runway should be **0.0 months**, and the
   remaining buffer may be negative.
7. Select **Reset scenario**. All shocks turn off and the defaults return to
   **55% EI, 15% bill increase and repair cost = S**.
8. Switch accounts. The scenario resets and the repair default uses the new S.

Unknown accounts are not fabricated. Expand the monthly-records section to
inspect the selected account's source figures. Amounts retain the original
dataset units, without assuming or converting to CAD.

## Data and project files

```text
repository/
├── data/
│   ├── monthly_summary.csv     # Original official data, local only for size
│   ├── loans.csv
│   └── README.md
└── financial_resilience/
    ├── app.py                 # Local Streamlit interface
    ├── data_access.py         # CSV loading and validation
    ├── engine.py              # Official calculations and shock simulation
    ├── start_ripple.command   # macOS launcher
    ├── export_profiles.py     # Public profile generation
    ├── requirements.txt
    ├── tests/                 # Clearly identified synthetic fixtures
    ├── verify_real_data.py    # Independent CSV/statistics checks
    ├── verify_web_profiles.py # Browser/Python calculation comparison
    ├── verification_report.json # Local aggregate verification output
    └── .venv/                 # Project-local Python environment
```

Place the official files in the root `data/` directory, or set
`RESILIENCE_DATA_DIR` to their directory. The app reads without modifying them.
Missing monthly data stops the page with setup guidance. Missing or invalid
loan data leaves P **Unavailable** while other supported calculations remain
usable. No matching loan in a complete file means P = 0; that is different from
an unavailable file.

The owner reported organizer confirmation on 2026-11-07 that the challenge data
may be used publicly and contains no real customer records. The public website
ships derived profiles; raw CSVs remain excluded from Git to keep it small.
See [dataset attribution and access](../data/README.md).

## Official calculation rules

| Metric | Definition |
|---|---|
| I · Typical monthly income | Median money_in across all available months |
| S · Typical monthly spending | Median money_out |
| F · Typical fixed costs | Add household_bills + insurance + loan_payments within each month, then take the median of the totals |
| B · Savings buffer | Mean avg_daily_balance across the last six rows sorted by month |
| H · Household bills | Median household_bills |
| P · Loan payment | Sum monthly_payment for loans started by 2025-12-31 with status C/D in the supplied year-end snapshot |

A/B loans contribute zero. Loan status is not recalculated from duration.
**money_out already includes loan payments. Never add P or F to S again.**

```text
Job loss enabled:     income_after = I × EI rate; otherwise I
Higher bills enabled: spending_after = S + H × increase; otherwise S
Repair enabled:       one_off_costs = repair_cost; otherwise 0

buffer_left = B − one_off_costs
gap = spending_after − income_after

buffer_left <= 0                 → runway = 0
buffer_left > 0 and gap <= 0      → No shortfall (120+)
otherwise                       → min(buffer_left / gap, 120)
```

Calculations use unrounded values. Amounts are displayed to two decimal places;
numeric runway is displayed to one. The table shows `max(gap, 0)` as monthly
shortfall, while the runway formula uses the original signed gap.
“No shortfall (120+)” is a judging label, not a guarantee of future security.

## Missing and unusual data

- Missing amounts, invalid text and infinite values stay unavailable rather
  than becoming zero. Statistics use valid values and disclose limitations.
- F uses a month only if all three cost components are valid.
- B selects the last six rows first. Missing values inside that window are not
  replaced with older rows. Fewer than six available months are disclosed.
- Missing I, S or B prevents simulation. Missing H disables only the bill shock.
- Negative balances are preserved. A zero or negative buffer gives zero runway.
- Invalid account/month keys are excluded with a warning. Gaps in history are
  disclosed; duplicate account/month rows stop loading.
- Duplicate loan records make loan data unavailable. Missing or invalid status,
  start date or payment on a relevant loan leaves P unknown.

## Tests and verification

From this directory:

```sh
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python verify_real_data.py
.venv/bin/python verify_web_profiles.py
```

Synthetic edge-case fixtures include I=3000, S=2500, B=5000 and EI=55%: income
becomes 1650, the shortfall is 850, and runway is **5.9 months**.

The official data includes 185,326 monthly rows, 4,500 accounts and 682 loans.
The independent CSV/statistics check covers 27,000 account metrics and 36,000
shock combinations. The browser/Python comparison covers 54,000 results,
including numeric runway and its display labels.

Streamlit AppTest verifies widget state and calculations. It does not replace
visual review in a browser. Verification reports save aggregate counts locally,
not individual account exports. Synthetic test records are never app fallbacks.

## Model scope and next phase

The official runway formula is a static simplified calculation, not a
month-by-month cash-flow forecast. B is a historical balance proxy, not a live
available deposit. The EI rate is a challenge assumption; eligibility, payment
caps and duration have not been verified. EI must not be presented as indefinite.

The next phase is personalized emergency savings goals and backup plans, followed
by UX improvements directed by the project owner. Any time-based forecast must
be presented separately from the official judging calculation.

OpenAI Codex assisted with implementation, tests and documentation. The owner
leads product and UX/UI decisions. The app does not call an AI API or send account
records to an AI service at runtime. All project content is English; the owner's
preferred language for direct Codex chat is Chinese.

A successful GitHub push does not prove that Vercel is live. Check the actual
website URL and data asset before reporting a verified deployment.
