# Ripple — Financial Resilience Engine

**Sheridan Datathon 2026 — Tangerine Track: “Resilience Rewired”**

Ripple helps people understand financial resilience and explore what changes
when income falls, bills rise, or a one-time emergency uses their cash buffer.
The public website supports **all 4,500 official challenge accounts** with the
track's exact financial calculations and adjustable combined shock scenarios.

The challenge data does **not** contain real customer records. The project owner
confirmed with the organizers that it may be used publicly, as reported on
2026-11-07. Dataset attribution remains with the organizers and track providers.

Deployment guide: [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).
Local application guide: [financial_resilience/README.md](financial_resilience/README.md).

## Architecture

```text
Official CSVs → Python/Pandas + existing engine.py → profiles.json + history.json
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
viewer is preserved. The public website ships account summaries and the most
recent 12 recorded money-in/money-out pairs per account, not the full raw ledger.

## Features

- Search any valid official `account_id`, or choose a random account.
- View monthly income, spending, fixed costs, buffer, household bills and loan payment.
- Start with three primary metrics: typical monthly money in, typical spending
  and an estimated cash buffer. Fixed costs, bills, loans and baseline runway
  provide supporting context.
- Explore a grouped cash-flow chart using recorded values, with six- and
  twelve-record views, keyboard/touch tooltips and an accessible data table.
- Read observations about recorded shortfalls and peak spending, without invented causes.
- See baseline runway and combine job loss, higher bills and emergency repair.
- Adjust EI replacement rate, bill increase and one-off repair amount.
- Compare before/after income, spending, one-off costs, remaining buffer, monthly
  shortfall and financial runway.
- Reset all parameters; switching accounts also resets the scenario.
- No shocks are selected by default. A visual Before/After comparison shows
  amounts in CAD; runway appears separately, never as a literal 120-month bar.
- Explore an emergency savings goal and a numerical backup plan using
  transparent Ripple planning assumptions, separate from official formulas.
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

There are no third-party npm dependencies. `npm run build` validates the
website's eight existing files in `public/`, all 4,500 bundled profiles and
54,000 actual recorded monthly cash flows.
It does not compile assets or generate a separate output directory.
No CSV, Python, virtual environment or developer-specific path is needed to build
or run this public version.

To preview, serve `public/` with any static HTTP server. If Python is installed:

```sh
python3 -m http.server 8502 --bind 127.0.0.1 --directory public
```

Open http://localhost:8502. Do not double-click `index.html` via `file://` because
browser module and fetch security rules require HTTP.

## Deploy on Vercel

Import `Talia0017/ripple-financial-resilience`, production branch `main`.
Use **Framework Preset: Other**, **Root Directory: ./**, **Build Command:
`npm run build`**, **Install Command:
`npm ci --ignore-scripts`**, **Output Directory: `public`**. No environment
variables or `PORT` are required. `vercel.json` declares these settings and
overrides the corresponding dashboard settings. Remove old Container/Streamlit build
overrides if an existing Vercel project was configured for the earlier approach.
Keep the build command nonempty so Vercel packages the static output.
See the [deployment guide](VERCEL_DEPLOYMENT.md) for verification and troubleshooting.

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

[`public/data/history.json`](public/data/history.json) adds **1,576,414 bytes**
for 54,000 actual monthly records: at most 12 per account. It includes only the
month, money in and money out, with full numeric precision, source hashes and
attribution. Both assets together are approximately 2 MB before compression.
History loads on the first account selection and is reused thereafter. No
months are fabricated, no amounts are reconstructed from medians, and gaps or
missing values remain explicit. Raw CSVs and unrelated monthly columns stay local.

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

On macOS you can also double-click `financial_resilience/start_ripple.command`.
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
ties-to-even formatting. The redesigned public dashboard formats the official
dataset amounts as CAD, as specified by the project owner. No conversion or
rescaling is applied. Money in includes all account inflows, not just salary;
the buffer is a historical balance estimate, not total savings. Zero recorded
household bills do not establish that an account holder has no living expenses.

The runway is a static simplified judging calculation, not a time-based forecast.
EI eligibility, benefit caps and duration are not established; EI is not assumed
to last indefinitely. B is a historical proxy, not a live available balance.
The savings and backup tools below are illustrative planning examples, not
personalized advice or additions to the official judging calculations.

## Planning and storytelling methodology

The overview is the primary experience in one connected account workspace:
**See → Discover → Explore → Prepare**. The desktop workspace uses up to 1440px
of content width with modest side gutters. The left overview contains all three
historical summary metrics, baseline runway, recorded cash flow and one personal
insight. The right panel contains scenario controls, runway, immediate comparison
bars and the next step. The overview stays visible while reviewing results;
expanding historical details
returns it to normal document flow. The layout uses natural content height.
Historical records and hypothetical results remain explicitly distinct.

**Explore a Change** opens the scenario panel and focuses a working control.
It never interprets historical patterns as a specific event or selects a shock.
The action only scrolls enough to reveal an off-screen target. On screens up to
1100px, the scenario panel starts collapsed; a compact, sticky historical
baseline inside the open panel preserves the original amounts during exploration.
All navigation actions reveal their target disclosure and support keyboard use.

The simplified interface uses large primary amounts, one monthly chart insight
and compact shock selectors. Metric definitions use keyboard-accessible info
disclosures. **More Financial Details** holds supporting amounts, baseline
context and the monthly table. Parameters appear only for selected shocks.
Estimated runway and one explanation lead directly to **Your Next Step**. This
summary uses the existing planning results: restore a depleted buffer, review
a monthly gap, build toward the example savings goal, or recognize a met target.
A met savings target does not hide an ongoing monthly gap. Invalid inputs show
an unavailable state instead of outdated guidance. **View Full Plan** reveals
Goal Plan and Backup Plan in the same workspace; their individual disclosures
retain the full figures and steps. The summary and full plan update together.
A single **About the Data & Calculations** disclosure collects source information,
formulas, assumptions, limitations and a link to the separate research report.
No financial or
planning rules changed in this visual refinement. Five-second comprehension is
a design goal; automated layout checks are not a usability study.

Affected metrics show **Before / After** amounts, two horizontal bars and explicit
signed differences immediately, without opening a disclosure. Job loss emphasizes
money in and shortfall; higher bills emphasizes spending and shortfall; repair
emphasizes the buffer. Combined shocks show each affected metric once.
**Unchanged Values & Scenario Details** keeps other amounts and the full table
available on demand. Each metric's pair shares a scale; scales differ between
metrics, as the visible label explains. Zero/negative values use a real zero
origin. This comparison reflows on mobile without horizontal
scrolling. It does not plot the no-shortfall judging label as a duration.
Changes use the original full-precision amounts. Display values and deltas are
rounded independently; this can produce a one-cent difference from subtracting
the displayed amounts, as the comparison and its detail disclosure explain.

With no selected shocks, a compact invitation replaces the identical-value
chart; financial plans still use the baseline. Selected parameters appear on
demand, and income-replacement slider and numeric entry stay synchronized.
One primary insight connects the current buffer and monthly shortfall to runway,
or explains the official zero-buffer/no-shortfall precedence. The original shock
cause explanation, supporting explanation, combined contributions and full
numbers remain available under **View scenario details**. Zero recorded bills
are described as a modeling limitation, not evidence of no living expenses.
Reset, account switching and invalid input clear obsolete results. Comparison
values are visible directly and keyboard accessible, with no hidden tooltip
state. Updating an assumption does not auto-scroll. Optional, short ripple
feedback links a changed control with affected metrics, runway and the next
step. Calculations and plan updates are synchronous; motion is optional.

Full plans and secondary comparison details are mutually exclusive disclosures.
Their labeled, keyboard-focusable content scrolls independently only on desktop
when it exceeds 340px (or 45% of viewport height). Primary scenario controls and
results stay outside these scroll regions. Shorter details do not get a forced
scrollbar. Tablet and mobile remove the vertical limit and extra tab stop,
retaining natural page flow. No primary dashboard content is clipped to a fixed
viewport.

## Ripple identity and connected discoveries

The interface uses **#3D38F5** for the brand, primary buttons, active navigation,
major headings, historical values and Money In. **#C2EE14** distinguishes
Money Out, After bars, changed-amount badges and scenario outcome accents.
Neutral surfaces, dark body text and gray dividers keep the layout restrained.
Lime marks a category or modeled change, not financial improvement or safety.
Lime areas use dark text and visible dark outlines instead of light text on
white. Browser checks verify text contrast and chart boundary contrast.
The inline SVG brand mark uses a drop above three open, offset perspective wave
arcs with graduated strokes, preserving a water surface rather than a bullseye.
Shortfall months carry both an outlined circle and
a background band, with matching accessible descriptions, so meaning does not
depend on color. A single **Worth noticing** sentence connects typical account
summaries with actual recent monthly variation.

The buffer context is the descriptive ratio **B / S**, shown as a spending
equivalent, not official runway or total savings. Non-positive balances and
missing/zero spending do not produce a fabricated positive equivalent.

Three verified findings inform the design and are retained for the Datathon
presentation and case study in [RESEARCH.md](RESEARCH.md). They are not displayed
as population statistics on the customer dashboard:

- Of **3,309** accounts with typical inflows strictly above typical spending,
  **3,299** have at least one complete recorded month with money out above
  money in in their latest 12 available rows. Gaps are not filled in; this is
  not a claim about every historical month or a broader customer population.
- Within the existing **166-account** near-median inflow band, median buffer
  estimates remain **CAD 30,434.58583333333** versus **CAD 17,689.631666666668**
  for the spending-covered and spending-above-inflow groups (n=116 and n=50).
- Applying the same **55% income replacement**, with bills and repair off,
  gives **23** accounts with no positive buffer, **4,243** with a positive
  buffer and monthly gap, and **234** with no monthly shortfall. These mutually
  exclusive groups use the existing official engine and its zero-buffer
  precedence. No-shortfall is a category, never a 120-month chart duration.

Python independently checked these counts and existing buffer medians against
the committed official assets and preserved engine. The underlying research
helpers and tests remain intact; the customer app no longer runs population
aggregation or renders research charts. Missing observations, cohort selection
and unavailable scenarios remain explicit in the research report.

Selecting or clearing a shock triggers a falling drop and two expanding brand-color
ellipses beside that control. Changed comparison rows and, when changed, the
runway outcome and next-step message receive staggered emphasis. A discrete interaction lasts
**700 ms**. Calculations and annotations update immediately. Continuous slider
or numeric input gets one smaller ripple after **180 ms** without input,
rather than repeated large effects during a drag. Stable rows preserve keyboard
focus. Reset, invalid scenarios and account changes clear pending and active
feedback. Loading uses readable status text without a looping animation.
CSS and JavaScript honor `prefers-reduced-motion`; changing the preference
stops feedback while retaining the updated numbers, differences and annotation.
Browser QA captures real interaction frames and checks these states, contrast,
mobile layout, loading behavior and input-update timing.

A clipped water-surface highlight moves across filled **After** comparison bars
and the savings progress bar for **1200 ms**, once per relevant settled change
or disclosure reveal. During scenario changes, only affected financial bars
move; savings progress responds to buffer changes. The surface stays inside
the existing filled amount, including negative comparison values, without
tweening the amount or inventing a value for zero. Opening a detailed comparison
or full plan reveals its current surfaces once. There is no idle motion,
infinite animation or loading metaphor. Reset, invalid input, account changes,
panel closure and reduced motion clear the effects. Native progress semantics,
signed differences, chart labels and financial calculations remain intact.

Monthly charts have an explicit **260px** desktop / **240px** mobile height,
unchanged between six- and twelve-month views. The renderer reveals history
before measuring the visible cash-flow panel and uses matching SVG dimensions.
The resize observer watches that panel, avoiding the former hidden-plot width
of zero that magnified a 320px fallback after cached account switches. Old chart
data, highlights and tooltips are cleared before loading another account.
Twelve-month charts scroll horizontally on narrow screens without widening
the page. Compact header, lookup and card spacing keep the primary overview
together; secondary details remain expandable and text stays readable. In
the connected layout, original metrics remain in the left overview and detailed
plans no longer occupy a separate section below the simulator. No fixed section
height or clipped content is used.

The emergency goal is **3 × typical baseline spending**. Buffer progress uses
the non-negative remaining scenario buffer, capped visually at the goal. A
negative balance contributes zero; its deficit is still explained separately.
Remaining target = max(goal − max(scenario buffer, 0), 0). The illustrative
monthly contribution is half of the scenario's positive estimated surplus,
limited to the remaining target. Time to goal is the ceiling of remaining
target / contribution. A met target needs no contribution; no positive surplus
means no suggested contribution or completion date. Missing or non-positive
baseline spending makes this example unavailable. Timing assumes no further
changes or interest. Modelled surplus does not prove personal affordability.

Backup steps show the numerical monthly gap, any negative buffer and one-time
repair deduction. They do not invent reducible expenses, EI eligibility or
borrowing capacity. All rules are deterministic and run locally in the browser.

The preserved **What We Discovered** research uses all 4,500 valid account summaries.
It is documented in RESEARCH.md rather than shown in the customer UI. The median typical
monthly money in is CAD 7,568.2625. An inclusive ±5% band contains 166 accounts;
116 have typical money in covering typical spending and 50 (30.1%) have spending
above money in. The groups' median estimated buffers are CAD 30,434.58583333333
(n=116) and CAD 17,689.631666666668 (n=50), respectively. The comparison is
descriptive: different histories and timing may affect summaries, and it does
not establish causes, personal behaviour or future outcomes. Explaining why
these differences occur would require further research.

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

## Project language

All interfaces, source comments, tests, generated messages, documentation and
commit messages use English. Chinese is permitted only in direct Codex chat
with the project owner. The language regression test checks project-owned files
and the public profile asset for CJK ideographs.

## Optional browser verification

The application has no runtime npm dependencies. Browser QA uses a separately
installed Playwright package and an isolated installed Chrome session. Start the
local preview above, install Playwright in a temporary directory, then run:

```sh
# Set this to the absolute file URL of your separate Playwright installation.
RIPPLE_BROWSER_TEST_MODULE=file:///tmp/ripple-browser-qa/node_modules/playwright/index.mjs node tests/browser/dashboard.mjs
RIPPLE_BROWSER_TEST_MODULE=file:///tmp/ripple-browser-qa/node_modules/playwright/index.mjs node tests/browser/chart-layout.mjs
RIPPLE_BROWSER_TEST_MODULE=file:///tmp/ripple-browser-qa/node_modules/playwright/index.mjs node tests/browser/connected-workspace.mjs
RIPPLE_BROWSER_TEST_MODULE=file:///tmp/ripple-browser-qa/node_modules/playwright/index.mjs node tests/browser/brand-motion.mjs
RIPPLE_BROWSER_TEST_MODULE=file:///tmp/ripple-browser-qa/node_modules/playwright/index.mjs node tests/browser/personal-dashboard.mjs
```

For example, `npm install --prefix /tmp/ripple-browser-qa --no-save --ignore-scripts playwright`
installs only the optional test tool outside this repository. Google Chrome must
be installed. The script tests real-account lookup, invalid IDs, all seven
nonempty shock combinations, adjustments, reset, annotations, savings and backup
plans, chart keyboard access, mobile interaction, 320/375/768/1440-pixel page
widths, profile/history loading failure recovery and the production CSP. It
writes screenshots to the system temporary directory, or `RIPPLE_SCREENSHOTS`.
Use `RIPPLE_TEST_URL` to select a different local test server. Mocked HTTP 503
responses are explicit recovery tests, not production fallback data.

The chart-layout regression checks direct accounts 39859 and 77059, history and
buffer edge cases, and ten additional random selections at each of
1366×768, 1440×900, 375×900 and 320×900. It measures SVG/text scale and fixed
height through repeated six-/twelve-month switches and browser resizes, compares
annotations and highlights with actual account rows, and captures first/later
selections. It also captures visible impact/spread/finished animation frames,
checks settled-input feedback, reset and reduced motion. Screenshots and
measurement reports go to the temporary directory, not the public site.

The connected-workspace suite exercises the complete account → insight → shock
→ next-step → full-plan journey at 1536, 1440, 1366, 768, 375 and 320px. It verifies
unchanged baseline amounts, scenario-dependent plans, adjacent outcome/next-step
geometry, visible desktop chart/mobile baseline context, keyboard disclosures,
account switching, reset, invalid inputs, negative buffers and reduced motion.

The brand-motion suite checks exact color roles, AA text contrast, lime bar
boundaries, navigation state, visible clipped water surfaces, finite playback,
unchanged progress amounts and reduced motion at desktop and mobile widths.
It saves real bar/progress interaction frames and contrast measurements beside
the other temporary QA artifacts. The complete financial and connected-journey
checks remain required for brand changes.

The personal-dashboard suite verifies 1440×900 and 1536×864 desktop layouts,
tablet/mobile flow, readable twelve-month charts, immediate changed-only bars,
exact amounts, shared pair scales, obsolete-row removal, baseline runway,
no-effect states, retained research documentation and keyboard scrolling of
secondary content without moving the main dashboard.

`verify_web_profiles.py` additionally checks all 54,000 shipped monthly records
against the original CSV data. All financial profiles and 54,000 shock results
remain checked against the preserved Python engine. Node tests cover annotation
accuracy, missing/tied history, corrupt assets, no-shortfall and negative-buffer
language, savings goal completion, zero spending and contribution limits. The
dataset-cohort counts and median buffers were independently cross-checked with
Python's `statistics` module. Browser results do not prove a hosted deployment;
verify its homepage and both JSON assets separately.
