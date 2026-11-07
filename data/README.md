# Official Tangerine challenge data

Source: **Sheridan Datathon 2026 — Tangerine Track**. Credit belongs to the event
organizers and track data providers; Ripple does not claim ownership.

On 2026-11-07, the project owner reported organizer confirmation that these
challenge datasets may be publicly used because they contain no real customer
data. This supersedes the earlier restricted-access assumption.

The public website publishes compact, derived profiles for every official
account in `public/data/profiles.json`. Raw CSVs remain Git-ignored to keep the
repository and deployment small, rather than because public use is forbidden.
No credentials, unrelated personal data or additional datasets are authorized
for publication by this confirmation.

## Obtain and regenerate

Use the organizers' official Tangerine Track resources to obtain:

- `data/monthly_summary.csv`
- `data/loans.csv`

Alternatively set `RESILIENCE_DATA_DIR` to a directory containing both files.
Then run `financial_resilience/.venv/bin/python financial_resilience/export_profiles.py`.
The website itself does not need these CSVs: it loads the committed public JSON.

## Required columns

`monthly_summary.csv`:

```text
account_id, month, money_in, money_out, household_bills,
insurance, loan_payments, avg_daily_balance
```

`month` uses `YYYY-MM`; account IDs are kept as text.

`loans.csv`:

```text
account_id, monthly_payment, status, loan_start
```

`loan_start` uses `YYYY-MM-DD`; C/D are running statuses at the official
2025-year-end snapshot. `loan_id`, if present, is used for duplicate detection.

Synthetic edge-case fixtures exist only in automated tests and never replace
missing official profiles on the public website.
