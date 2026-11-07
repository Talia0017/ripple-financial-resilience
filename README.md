# Ripple — Financial Resilience Engine

**Sheridan Datathon 2026 — Tangerine Track: “Resilience Rewired”**

Ripple helps people explore how prepared a bank account is for unexpected
financial challenges. It reads the official anonymized banking CSVs, summarizes
income, spending and cash buffers, and simulates job loss, higher household bills
and emergency repairs using the track's prescribed calculations.

This is the working first phase of a solo Interaction Design project. The current
interface uses Chinese explanations with English financial terms. Personalized
emergency savings goals and backup plans are planned for the next phase.

中文使用与计算说明：[financial_resilience/README.md](financial_resilience/README.md)。

## Features

- Search and select an actual `account_id` from the supplied dataset.
- View typical monthly income, spending, fixed costs, savings buffer, household
  bills and running-loan monthly payments.
- Calculate baseline financial runway using the official judging rules.
- Combine adjustable job-loss, household-bill and one-time repair scenarios.
- Compare before/after income, spending, remaining buffer, monthly shortfall and
  runway; reset scenarios or switch accounts without carrying over old settings.
- Explain financial terms, missing data, limited history and model assumptions.
- Inspect the selected account's monthly history locally.

## Technology

- Python 3.9+ (verified locally with 3.9.6)
- Pandas 2.3.x for CSV processing and statistics
- Streamlit 1.50.x for the single-page interface
- Python `unittest` and Streamlit AppTest for automated checks

There is no database, authentication system, paid API or separate backend service.

## Vercel deployment preparation

The existing app remains Python/Streamlit. A root Dockerfile and Vercel Container
configuration let Vercel run the existing server without a React/Next.js rewrite.
See [the Chinese Vercel setup guide](VERCEL_DEPLOYMENT.md) for exact settings,
current verification limits and the restricted-data requirements.

The configuration is prepared; a container build and live Vercel deployment have
not been verified. **Official banking data is restricted-access and is not in the
deployment package.** A deployment made from this repository alone will show
missing-data guidance rather than real accounts. Authorized private data access
and access protection must be implemented before a real-data online release.

## Setup and run

You need Python 3.9 or newer. From a terminal in the directory where you keep projects:

```sh
git clone https://github.com/Talia0017/ripple-financial-resilience.git
cd ripple-financial-resilience
python3 -m venv financial_resilience/.venv
financial_resilience/.venv/bin/python -m pip install -r financial_resilience/requirements.txt
```

Obtain authorized access to the official datasets as described below, then place
them here:

```text
ripple-financial-resilience/
├── data/
│   ├── README.md
│   ├── monthly_summary.csv   # local only; ignored by Git
│   └── loans.csv             # local only; ignored by Git
└── financial_resilience/
    ├── app.py
    ├── data_access.py
    ├── engine.py
    ├── requirements.txt
    ├── tests/
    └── 启动应用.command
```

Start the app:

```sh
financial_resilience/.venv/bin/python -m streamlit run financial_resilience/app.py --server.address 127.0.0.1 --server.port 8501 --server.showEmailPrompt false --browser.gatherUsageStats false
```

Open **http://localhost:8501**. The server listens on this computer only.
On macOS, you can instead double-click `financial_resilience/启动应用.command`
in Finder; it creates/uses the local environment and installs dependencies if needed.

On Windows, create the environment with
`py -m venv financial_resilience/.venv`, then use
`financial_resilience\.venv\Scripts\python.exe` in place of the Python executable
above. The `.command` launcher is macOS-specific.

To keep the CSVs outside the repository, set `RESILIENCE_DATA_DIR` to the directory
containing both files before starting the app. The app reads the files without
modifying them. If the monthly CSV is missing, it displays setup guidance rather
than creating demo customers. If loans are unavailable, the loan-payment metric
remains unknown and the other available calculations can still run.

## Dataset attribution and access

The project uses the anonymized banking datasets supplied to participants for
**Sheridan Datathon 2026 — Tangerine Track**: `monthly_summary.csv` and `loans.csv`.
Attribution is to the event organizers and the Tangerine Track data providers;
Ripple does not claim ownership of the datasets.

**The datasets are not included in this repository.** The project owner has
confirmed that the official data permits restricted access, not public display.
No permission granting public redistribution was supplied with the local files.
Raw banking data, derived customer exports and local verification reports are
excluded from Git. Anonymization alone is not treated as redistribution permission.

Authorized participants should obtain the files through the official Tangerine
Track resources provided by the organizers. If you do not have access, request it
from the Sheridan Datathon organizers; this repository does not provide a public
dataset download or grant data rights. See [data/README.md](data/README.md) for the
required columns and file locations. Synthetic test records are created in tests
and are never used as application customers.

## Official calculations

| Symbol | Definition |
|---|---|
| I | Median `money_in` across the account's monthly records |
| S | Median `money_out` |
| F | Median of each month's `household_bills + insurance + loan_payments` |
| B | Mean `avg_daily_balance` across the last six rows sorted by month; use available rows when fewer than six exist and disclose the limitation |
| H | Median `household_bills` |
| P | Sum of `monthly_payment` for loans started by 2025-12-31 with status C/D; otherwise zero when complete loan data is available |

Loan statuses are interpreted as the supplied year-end-2025 snapshot. Unknown
loan data remains unknown. **`money_out` already includes loan payments; P and F
are never added to spending a second time.**

For combined shocks:

```text
income_after = I × EI replacement rate              if job loss is enabled; otherwise I
spending_after = S + H × bill increase rate           if higher bills are enabled; otherwise S
one_off_costs = repair cost                          if repair is enabled; otherwise 0

buffer_left = B − one_off_costs
gap = spending_after − income_after

if buffer_left <= 0:             runway = 0
elif gap <= 0:                   display "No shortfall (120+)"
else:                           runway = min(buffer_left / gap, 120)
```

Defaults: EI replacement **55%**, bill increase **15%**, repair cost **S**.
Numeric runway is displayed to one decimal place. Missing monetary values are
not silently filled with zero; limitations are disclosed and unsupported
calculations are disabled.

This is the official **static simplified calculation**, not a month-by-month
forecast. The model does not establish real EI eligibility, caps or benefit
duration, and does not imply that EI continues indefinitely. The buffer is a
historical balance proxy rather than a live available balance. Currency units
are taken from the supplied CSVs without assuming or converting to CAD.

## Testing

From the repository root, run the synthetic unit and UI integration tests:

```sh
financial_resilience/.venv/bin/python -m unittest discover -s financial_resilience/tests -v
```

These tests do **not** require the official datasets. They cover the official
formulas, all shock combinations, missing values and files, loan statuses,
negative balances, nonexistent accounts, short histories, zero shortfalls,
repair costs above the buffer, and interface reset/account-switch behavior.
The reference synthetic job-loss example (`I=3000`, `S=2500`, `B=5000`, EI=55%)
produces **5.9 months** of runway.

With authorized official CSVs available locally, run the separate reference check:

```sh
financial_resilience/.venv/bin/python financial_resilience/verify_real_data.py
```

It compares every account with an independent `csv`/`statistics` implementation
and checks the real-data Streamlit controls. It writes a local-only aggregate
`financial_resilience/verification_report.json`. AppTest verifies UI logic and
widget state; it does not replace visual testing in a browser.

## AI-assisted development disclosure

Ripple is a solo student project developed with assistance from **OpenAI Codex**
for Python implementation, tests, technical documentation and Git workflow.
The project owner directs the product and UX/UI decisions and remains responsible
for reviewing and explaining the submitted work. AI-generated code is checked
with automated tests and, when authorized files are available, independent
calculations against the official local data. The application itself does not
call an AI API or send customer records to an AI service at runtime.

## Next phase

Implement personalized emergency savings goals and backup plans using each
account's figures, then improve the UX/UI and visual explanation. Any future
time-based projection will be presented separately from the official static
runway calculation. Container deployment configuration is included, but no live
Vercel deployment or hosted real-data access has been verified.
