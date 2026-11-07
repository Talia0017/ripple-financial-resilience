# Workspace development instructions

This repository contains **Ripple — Financial Resilience Engine**, built for
Sheridan Datathon 2026, Tangerine Track. Communicate with the project owner in
simple Chinese. Preserve existing work and the official calculation rules.

## Authorized development and Git workflow

The owner has explicitly requested the following workflow for future development
in this workspace, unless they give different instructions for a specific task:

1. Implement the requested change and run the relevant available tests.
2. Review the actual Git diff and the exact files to be committed for secrets,
   private information, raw banking data, generated customer reports, and large
   unnecessary artifacts. Do not assume `.gitignore` alone proves safety.
3. If the change is safe and tests pass, create a descriptive Git commit and push
   to `origin/main`. This workflow is already authorized; do not ask again merely
   to commit or push ordinary safe code changes.
4. Verify the remote `main` commit matches the intended local commit. Report the
   result accurately. If authentication, network, permissions, tests, conflicts,
   or remote changes block a push, explain the issue explicitly.

Use the HTTPS origin:
`https://github.com/Talia0017/ripple-financial-resilience.git`.
Never force-push, rewrite unrelated remote history, or discard someone else's
changes. Inspect/fetch remote state and integrate changes carefully when needed.
Stage intended files explicitly; do not include unrelated work without review.
Never print credentials, put tokens in URLs, or commit authentication material.

## Project and verification

- App: `financial_resilience/app.py` (Python, Pandas, Streamlit).
- From the repo root, run the synthetic unit and Streamlit AppTest suite with:
  `financial_resilience/.venv/bin/python -m unittest discover -s financial_resilience/tests -v`.
- If the official local datasets are available and data/calculation behavior
  changes, also run:
  `financial_resilience/.venv/bin/python financial_resilience/verify_real_data.py`.
- If the virtual environment is absent, follow the root README setup steps.
- Do not claim browser visual verification based only on Streamlit AppTest.

## Data and scope

Official CSVs stay in the root `data/` folder or `RESILIENCE_DATA_DIR`. Their public
redistribution permission has not been established. Do not upload raw files,
row excerpts, customer exports, or screenshots exposing customer financial data
unless explicit redistribution permission is established and the owner requests
that publication. Keep synthetic test fixtures clearly identified and separate.
No fabricated customer records in the application. No deployment is authorized
by the Git commit/push workflow alone.
