# Ripple workspace instructions

Use simple Chinese only for direct Codex chat with the owner. All project
content uses English. Preserve the official calculations and existing work.
This is Sheridan Datathon 2026 — Tangerine Track.

## Project-wide language policy

All project content must use English: public and local interfaces, labels,
financial explanations, errors and warnings, source comments, docstrings, tests,
developer messages, generated reports, documentation and Git commit messages.
Chinese is allowed only in direct Codex chat with the owner. Apply this rule to
all future changes. Keep financial calculations, API fields, data processing and
layout unchanged during language-only updates. Preserve identifiers and paths
unless an English-only rename is necessary and references are updated.

## Authorized Git workflow

Unless the owner instructs otherwise for a specific task:

1. Implement changes and run relevant tests.
2. Review the actual Git diff and exact staged files for secrets, unrelated
   personal information, accidental raw data, local environments and large files.
3. If safe and tests pass, commit descriptively and push to `origin/main`.
   The owner has already authorized this routine workflow; do not ask again.
4. Verify the remote commit matches the intended local commit and report the
   result. Explicitly explain failures, blocked authentication or conflicts.

Origin: `https://github.com/Talia0017/ripple-financial-resilience.git`.
Never force-push or discard unrelated local/remote work. Fetch and inspect remote
state before integrating changes; stage intended files explicitly. Never print
credentials or put tokens into tracked files or command URLs.

## Architecture and checks

- Public website: `public/` — buildless HTML/CSS/JavaScript and complete account
  profiles plus the latest 12 recorded monthly cash flows per account.
  `npm run build` validates all eight assets without copying them.
- Vercel: Other framework, repo root, `npm ci --ignore-scripts`, Build Command
  `npm run build`, output `public`. Keep the build command nonempty: CLI 65.11.0
  produced an empty deployment when it was blank. No generated source output
  directory is needed. No Docker,
  Python runtime, database or environment variables.
- Preserved Python engine/local Streamlit app: `financial_resilience/`.
- Run `npm test` and `npm run build` for website changes.
- Python: `financial_resilience/.venv/bin/python -m unittest discover -s financial_resilience/tests -v`.
- Dashboard presentation/planning rules live in `public/dashboard.mjs`; charts
  live in `public/charts.mjs`. Keep `public/engine.mjs` and Python formulas intact.
- For substantial UI changes, use the optional isolated Chrome checks in
  `tests/browser/dashboard.mjs`, `tests/browser/chart-layout.mjs` and
  `tests/browser/connected-workspace.mjs`, plus `tests/browser/brand-motion.mjs`
  for color or animation changes; see README
  for setup. Check account switching, 6/12-month geometry and mobile overflow.
- Measure charts after revealing their content, using the visible cash-flow
  panel. Preserve explicit monthly plot heights (260px desktop, 240px mobile)
  and matching SVG coordinates; never magnify a hidden plot's fallback width.
- Brand: #3D38F5 for identity and historical context; #AED904 for money out,
  simulated states and differences. Use neutral surfaces, dark body text and
  dark outlines on lime chart bars. Lime does not mean a favorable outcome.
  The SVG mark uses a drop and three open perspective waves.
- Shock feedback lasts 700ms; continuous inputs get one smaller ripple after
  180ms idle. Filled After bars and savings progress can show a finite 1200ms
  water surface on relevant changes or disclosure. Never loop it, animate a
  financial amount, delay calculations or bypass reduced-motion preferences.
- Keep one connected account workspace: primary historical metrics above a
  desktop cash-flow/scenario pair, with next-step guidance and expandable full
  plans directly after the outcome. Narrow screens use a scenario disclosure
  and compact historical context. Exploration must never infer or select shocks.
- Next-step copy reuses existing savings and backup results; it must not hide a
  monthly gap behind a met savings target or retain advice after invalid input.
- Discovery evidence reuses the official engine and actual recent monthly rows.
  The B/S spending equivalent is descriptive and must not be called runway or
  total savings. Preserve sample sizes, missing-data notes and source attribution.
- If calculations or profiles change and source CSVs are available, regenerate
  with `financial_resilience/.venv/bin/python financial_resilience/export_profiles.py`
  and run both `verify_real_data.py` and `verify_web_profiles.py` in that folder.
- Never claim a live website based only on a build or push. Check the actual URL
  and both `/data/profiles.json` and `/data/history.json`. Distinguish
  Node/Streamlit tests from browser checks.

## Data permission (updated 2026-11-07)

The owner confirmed with the organizers that the official challenge datasets may
be publicly used and contain no real customer records. This supersedes earlier
restricted-data instructions. Publication of the derived official account
profiles at `public/data/profiles.json` is explicitly authorized. The owner also
requested public, compact actual monthly cash flows for the redesigned charts;
`public/data/history.json` contains only month, money in and money out.

Keep raw CSVs in `data/` or `RESILIENCE_DATA_DIR`; they stay ignored for size and
are not needed by the deployed site. Preserve source attribution and full
calculation precision. Do not publish unrelated personal information or secrets.
Synthetic fixtures must stay identified as tests; no fabricated app fallbacks.
Public data permission does not authorize changing formulas or publishing user
credentials. The owner requested Vercel; do not deploy to another hosting service.
