# Deploy Ripple on Vercel

## Architecture

Python reads the two official CSVs and uses the existing `engine.py` to
precompute all 4,500 account profiles. The committed output,
`public/data/profiles.json`, is approximately 414 KiB. The HTML/CSS/JavaScript
website loads this asset and calculates shocks directly in the browser.

**The public website does not require Docker, Streamlit hosting, a database,
a backend API or server environment variables.** The original Streamlit app
and its financial formulas remain available locally. This static setup replaces
the earlier Container configuration; the root Dockerfile is retained only as an
optional local reference and is not used by Vercel.

The project owner reported organizer confirmation on 2026-11-07 that the official
challenge datasets may be used publicly and contain no real customer records.
The website includes every official account, rather than a few sample accounts.

All project content, interfaces, documentation and development messages must be
written in English. Chinese is permitted only in direct Codex chat with the owner.

## Vercel settings

1. Sign in to Vercel and choose **Add New → Project**.
2. Import `Talia0017/ripple-financial-resilience`.
3. Confirm the following settings, then select **Deploy**.

| Setting | Value |
|---|---|
| Production Branch | `main` |
| Framework Preset | **Other** |
| Root Directory | Repository root: `./`, not `financial_resilience` or `public` |
| Install Command | `npm ci --ignore-scripts` |
| Build Command | `npm run build` |
| Output Directory | `public` |
| Node.js Version | 22 or a newer supported version |
| Environment Variables | None required. Remove `PORT` and local CSV paths configured for the earlier container setup. |
| Start Command / Python / Docker | Not required |

The settings are declared in `vercel.json`: `buildCommand` is `npm run build`
and `outputDirectory` is `public`. These values override the corresponding
Vercel Project Settings. Keep the dashboard consistent with the table above.
For a previously configured Container project, update **Settings → Build and
Deployment**, then choose **Redeploy**. Replace the old framework, startup and
output-directory overrides with the values above.

The website entrypoint is `public/index.html`. Its CSS, JavaScript modules and
`data/profiles.json` already exist beside it, ready to serve. Vercel publishes
the contents of `public/` at the site root without compiling assets or rerunning
Python. `npm run build` validates all five website assets and all 4,500 account
profiles, then Vercel packages them into its static deployment output. It does
not create a `dist/` directory.

### Troubleshoot a Ready deployment that returns 404

The build log for commit `c55c26a` reported no deployable `static`, `functions`
or `services` directory, even though deployment completed successfully. With
Vercel CLI 65.11.0, the empty `buildCommand` reproduced this empty output locally.
Setting it to `npm run build` produced `.vercel/output/static/index.html` and
all four required assets. Keep `outputDirectory` set to `public`; the CLI's
internal `.vercel/output` directory is not the dashboard Output Directory.

The root URL `/` serves the output's `index.html`. No custom root rewrite or
SPA catch-all is required. A rewrite cannot repair a deployment missing its
files. Do not add an empty `dist/` to silence an output-directory error.

After pushing the fix, open the new deployment rather than the old deployment's
unique URL. In Vercel, select this project and open its Production deployment.
Confirm that its source is branch `main` at the new commit, then use **Visit**
or the domain listed under **Domains** for that Production deployment. If no
new deployment starts automatically, deploy the latest `main` commit. A Ready
status alone is not sufficient: verify the homepage and profile JSON below.

## Verify a live deployment

A successful GitHub push does not prove that the website is live. Check that:

1. Vercel reports **Ready** and its actual deployment URL opens successfully.
2. The page shows **“4,500 official accounts · Ready”**.
3. `https://your-domain/data/profiles.json` returns account JSON, not a 404 or an HTML error page.
4. Several randomly selected accounts show six metrics, baseline runway and the before/after comparison.
5. All three shocks can be combined and adjusted. Reset restores the defaults; switching accounts also resets the scenario.
6. An unknown ID shows a clear error. A repair cost greater than the buffer produces zero runway.
7. Desktop and mobile views remain readable, including longer English labels and data-quality messages.

If profile loading fails, the page offers a retry and disables account lookup.
It never substitutes sample accounts for missing data. There are no external
fonts, CDN scripts, API keys or developer-specific file paths.

## Local preview

```sh
npm ci --ignore-scripts
npm test
npm run build
python3 -m http.server 8502 --bind 127.0.0.1 --directory public
```

Open http://localhost:8502. Use HTTP rather than opening the HTML file directly.
The static server exposes only `public/`, which contains no raw CSVs, Python
environment, Git credentials or server source code.

## Update and verify the data

Routine deployments do not require raw CSVs. To regenerate profiles or run an
independent check with the original official files:

```sh
financial_resilience/.venv/bin/python financial_resilience/export_profiles.py
financial_resilience/.venv/bin/python financial_resilience/verify_real_data.py
financial_resilience/.venv/bin/python financial_resilience/verify_web_profiles.py
npm test
npm run build
```

Financial values retain full precision and are rounded only for display. Source
SHA-256 hashes identify the files used to generate the profiles. Dataset
attribution appears in the README, JSON metadata and website explanations.

## Verification scope

A local build and successful HTTP downloads confirm that the deployment assets
work without local CSVs. The actual Vercel URL must still be checked before a
release can be described as live. Report automated tests, browser checks and
hosted deployment verification separately.

Official references: [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build)
and [vercel.json configuration](https://vercel.com/docs/project-configuration/vercel-json).
