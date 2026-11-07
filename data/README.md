# Official datasets — local files only

Ripple uses `monthly_summary.csv` and `loans.csv` supplied to authorized
participants of **Sheridan Datathon 2026 — Tangerine Track**. Credit belongs to
the event organizers and the track's data providers. The repository does not
grant rights to the data.

No public redistribution license was supplied with the local files, so the raw
banking datasets are intentionally excluded from Git. Do not attach CSVs or
customer-level exports to issues, pull requests or public demo artifacts.

## How to obtain the files

1. Use the official Tangerine Track resources shared by the Datathon organizers.
2. If you lack access, contact the organizers for authorization and download
   instructions. There is no public dataset download bundled with Ripple.
3. Save the official files under their original names in this directory:
   `data/monthly_summary.csv` and `data/loans.csv`.
4. Alternatively, set `RESILIENCE_DATA_DIR` to another directory containing both
   files. No code edit is required.

For the project owner: your existing CSVs remain in this local folder. Uploading
code to GitHub does not move, delete or publish them.

## Required schema

`monthly_summary.csv` requires:

```text
account_id, month, money_in, money_out, household_bills,
insurance, loan_payments, avg_daily_balance
```

`month` uses `YYYY-MM`. Account IDs are read as text to retain leading zeroes.
Other official columns may be present and are preserved by the loader.

`loans.csv` requires:

```text
account_id, monthly_payment, status, loan_start
```

`loan_start` uses `YYYY-MM-DD`. Statuses C/D mean running at the official
year-end-2025 snapshot; A/B mean finished. `loan_id`, when supplied, is used to
detect duplicates. Do not infer additional data licensing terms from this schema.

The automated test suite generates explicitly synthetic fixtures and can run
without either official file. The actual app never substitutes synthetic
customers when official data is unavailable.
