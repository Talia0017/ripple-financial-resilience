// Optional browser QA: install Playwright separately and use an isolated Chrome profile.
import assert from "node:assert/strict";
import {readFile, mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {decodeProfiles, simulate} from "../../public/engine.mjs";
import {money, monthlyInsights, runwayHeading, savingsPlan} from "../../public/dashboard.mjs";

const {chromium} = await import(process.env.RIPPLE_BROWSER_TEST_MODULE || "playwright");
const base = process.env.RIPPLE_TEST_URL || "http://127.0.0.1:8502";
const screenshots = process.env.RIPPLE_SCREENSHOTS || path.join(tmpdir(), "ripple-ux-screenshots");
await mkdir(screenshots, {recursive: true});
const payload = JSON.parse(await readFile(new URL("../../public/data/profiles.json", import.meta.url)));
const history = JSON.parse(await readFile(new URL("../../public/data/history.json", import.meta.url)));
const profiles = decodeProfiles(payload), all = [...profiles.values()];
const config = JSON.parse(await readFile(new URL("../../vercel.json", import.meta.url)));
const headers = Object.fromEntries(config.headers[0].headers.map(item => [item.key, item.value]));
const browser = await chromium.launch({channel: "chrome", headless: true});
const failures = [];
let checks = 0;
const check = (condition, message) => {assert.ok(condition, message);checks++;};
async function context(viewport, expectedHttpErrors = false) {
  const ctx = await browser.newContext({viewport});
  await ctx.route("**/*", async route => {
    const response = await route.fetch();
    await route.fulfill({response, headers: {...response.headers(), ...headers}});
  });
  const page = await ctx.newPage();
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", item => {
    if (item.type() !== "error" || item.text().includes("404")) return;
    if (expectedHttpErrors && item.text().includes("503") && /\/data\/(profiles|history)\.json$/.test(item.location().url)) return;
    failures.push(item.text());
  });
  return {ctx, page};
}
async function ready(page) {
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById("data-status").textContent.includes("Ready"));
}
async function choose(page, profile) {
  await page.locator("#account-id").fill(profile.account_id);
  await page.locator("#lookup-button").click();
  await page.locator("#history-content").waitFor({state: "visible"});
  check(await page.locator("#selected-account").textContent() === `Account ${profile.account_id}`, "Account identification");
}
try {
  const {ctx, page} = await context({width: 1440, height: 1050});
  await ready(page);
  check(await page.locator("#dashboard").isHidden(), "Selection is required; no fabricated account");
  const profile = all.find(p => p.buffer > 0 && p.income > p.spending && p.household_bills > 0);
  await choose(page, profile);
  check(await page.locator("#metrics .metric").count() === 3, "Three primary metrics");
  check(!await page.locator("#job-loss").isChecked() && !await page.locator("#higher-bills").isChecked() && !await page.locator("#emergency-repair").isChecked(), "No shocks applied on selection");
  check(await page.locator("#baseline-runway").textContent() === runwayHeading(simulate(profile)), "Baseline uses official engine");
  check(await page.locator("#monthly-table tr").count() === 6, "Six actual monthly records");
  const actual = history.accounts[profile.account_id].slice(-6);
  check(await page.locator("#monthly-table tr").first().locator("td").first().textContent() === money(actual[0][1]), "Chart table matches source money in");
  check(await page.locator("#monthly-insights p").first().textContent() === monthlyInsights(actual)[0], "Annotation matches exact observed months");
  await page.locator("#monthly-chart .chart-point").first().focus();
  check((await page.locator("#monthly-tooltip").textContent()).includes(money(actual[0][1])), "Keyboard chart tooltip");
  await page.locator("#history-twelve").click();
  check(await page.locator("#monthly-table tr").count() === 12 && await page.locator("#history-twelve").getAttribute("aria-pressed") === "true", "Twelve-month view");
  await page.locator("#history-six").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({path: path.join(screenshots, "desktop-overview.png")});
  for (let mask = 1; mask < 8; mask++) {
    await page.locator("#job-loss").setChecked(Boolean(mask & 1));
    await page.locator("#higher-bills").setChecked(Boolean(mask & 2));
    await page.locator("#emergency-repair").setChecked(Boolean(mask & 4));
    const result = simulate(profile, {job_loss: Boolean(mask & 1), higher_bills: Boolean(mask & 2), emergency_repair: Boolean(mask & 4), repair_cost: profile.spending});
    check(await page.locator("#after-runway").textContent() === runwayHeading(result), `Shock combination ${mask}`);
  }
  await page.locator("#ei-rate").fill("80");await page.locator("#bill-rate").fill("50");await page.locator("#repair-cost").fill("1234");
  let result = simulate(profile, {job_loss: true, ei_rate: .8, higher_bills: true, bill_increase_rate: .5, emergency_repair: true, repair_cost: 1234});
  check(await page.locator("#after-runway").textContent() === runwayHeading(result), "Adjusted combined scenario");
  check((await page.locator("#result-explanation").textContent()).includes(money(result.one_off_costs)), "One-off annotation");
  const plan = savingsPlan(profile, result);
  check((await page.locator("#savings-plan").textContent()).includes(money(plan.remaining)), "Scenario goal remaining amount");
  await page.locator("#shock-title").scrollIntoViewIfNeeded();
  await page.screenshot({path: path.join(screenshots, "desktop-scenario.png")});
  await page.locator("#repair-cost").fill(String(Math.max(profile.buffer, 0) + 1));
  check(await page.locator("#after-runway").textContent() === "0.0 months", "Repair above buffer");
  check((await page.locator("#backup-plan").textContent()).includes("below zero"), "Negative buffer backup plan");
  await page.locator("#bill-rate").fill("-1");
  check(await page.locator("#scenario-error").isVisible() && await page.locator("#comparison").isHidden(), "Invalid scenario does not show stale result");
  check(await page.locator("#baseline-runway").textContent() === runwayHeading(simulate(profile)), "Invalid scenario preserves baseline");
  await page.locator("#reset-scenario").click();
  check(!await page.locator("#job-loss").isChecked() && await page.locator("#ei-rate").inputValue() === "55" && await page.locator("#bill-rate").inputValue() === "15", "Reset defaults");
  const edgeProfiles = [all.find(p => p.buffer < 0), all.find(p => p.household_bills === 0), all.find(p => p.spending > p.income)];
  for (const edge of edgeProfiles.filter(Boolean)) {await choose(page, edge);check(await page.locator("#after-runway").textContent() === runwayHeading(simulate(edge)), "Real account edge case");}
  for (const index of [19, 927, 3441]) await choose(page, all[index]);
  await page.locator("#account-id").fill("not-an-official-account");await page.locator("#lookup-button").click();
  check(await page.locator("#lookup-error").isVisible() && await page.locator("#dashboard").isHidden(), "Invalid Account ID");
  await page.locator("#random-account").click();await page.locator("#history-content").waitFor();
  check(profiles.has(await page.locator("#account-id").inputValue()), "Random account is official");
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({width, height: 1000});
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow at ${width}px`);
  }
  await ctx.close();
  const mobile = await context({width: 375, height: 900});
  await ready(mobile.page);await choose(mobile.page, profile);
  await mobile.page.evaluate(() => window.scrollTo(0, 0));
  await mobile.page.screenshot({path: path.join(screenshots, "mobile-overview.png")});
  await mobile.page.screenshot({path: path.join(screenshots, "mobile-full.png"), fullPage: true});
  await mobile.page.locator("#job-loss").check();
  check(await mobile.page.locator("#after-runway").textContent() === runwayHeading(simulate(profile, {job_loss: true})), "Mobile scenario interaction");
  await mobile.ctx.close();
  const recovery = await context({width: 1100, height: 900}, true);
  await recovery.ctx.route("**/data/history.json", route => route.fulfill({status: 503, body: "unavailable"}));
  await ready(recovery.page);
  await recovery.page.locator("#account-id").fill(profile.account_id);await recovery.page.locator("#lookup-button").click();
  await recovery.page.locator("#retry-history").waitFor();
  check(await recovery.page.locator("#comparison").isVisible(), "History failure preserves scenarios");
  await recovery.ctx.unroute("**/data/history.json");await recovery.page.locator("#retry-history").click();await recovery.page.locator("#history-content").waitFor();
  check(await recovery.page.locator("#monthly-table tr").count() === 6, "History retry recovers");
  await recovery.ctx.close();
  const loading = await context({width: 1100, height: 900}, true);
  await loading.ctx.route("**/data/profiles.json", route => route.fulfill({status: 503, body: "unavailable"}));
  await loading.page.goto(base);await loading.page.locator("#load-error").waitFor();
  check(await loading.page.locator("#lookup-button").isDisabled(), "Profile failure disables lookup");
  await loading.ctx.unroute("**/data/profiles.json");await loading.page.locator("#retry-load").click();
  await loading.page.waitForFunction(() => document.getElementById("data-status").textContent.includes("Ready"));
  check(await loading.page.locator("#lookup-button").isEnabled(), "Profile retry recovers");
  await loading.ctx.close();
  assert.deepEqual(failures, [], "No unexpected JavaScript or CSP errors");
  console.log(JSON.stringify({browser: "Chrome", checks, javascriptErrors: failures, screenshots, result: "passed"}, null, 2));
} finally {await browser.close();}
