// Browser regression for cached account switches, fixed chart geometry and visible impact feedback.
import assert from "node:assert/strict";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {decodeProfiles, simulate} from "../../public/engine.mjs";
import {money, monthlyDiscovery, runwayHeading} from "../../public/dashboard.mjs";

const {chromium} = await import(process.env.RIPPLE_BROWSER_TEST_MODULE || "playwright");
const base = process.env.RIPPLE_TEST_URL || "http://127.0.0.1:8502";
const output = process.env.RIPPLE_SCREENSHOTS || path.join(tmpdir(), "ripple-layout-regression");
await mkdir(output, {recursive: true});
const payload = JSON.parse(await readFile(new URL("../../public/data/profiles.json", import.meta.url)));
const history = JSON.parse(await readFile(new URL("../../public/data/history.json", import.meta.url)));
const profiles = decodeProfiles(payload), people = [...profiles.values()];
const edgeIds = [people.reduce((a,b) => a.months < b.months ? a : b).account_id, people.reduce((a,b) => a.months > b.months ? a : b).account_id, people.reduce((a,b) => a.buffer > b.buffer ? a : b).account_id];
const browser = await chromium.launch({channel: "chrome", headless: true});
const errors = [], measurements = [];
let checks = 0;
const check = (value, message) => {assert.ok(value, message);checks++;};
async function ready(page) {await page.goto(base);await page.waitForFunction(() => !document.getElementById("lookup-button").disabled);}
async function settle(page) {await page.locator("#history-content").waitFor();await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));}
async function measure(page) {
  return page.evaluate(() => {
    const svg = document.querySelector("#monthly-chart svg"), box = svg.getBoundingClientRect(), matrix = svg.querySelector("text").getScreenCTM();
    const overview = document.getElementById("overview").getBoundingClientRect(), insight = document.getElementById("monthly-insights").getBoundingClientRect(), baseline = document.querySelector(".baseline-context").getBoundingClientRect(), scenario = document.getElementById("scenario-workspace").getBoundingClientRect();
    return {id: document.getElementById("account-id").value, width: box.width, height: box.height, viewWidth: svg.viewBox.baseVal.width, scaleX: matrix.a, scaleY: matrix.d, overviewHeight: overview.height, baselineHeight: baseline.height, essentialHeight: insight.bottom-baseline.top, columnsSeparated: baseline.right <= scenario.left, pageOverflow: document.documentElement.scrollWidth > innerWidth};
  });
}
async function validate(page, width, height, window) {
  await settle(page);
  const item = await measure(page), profile = profiles.get(item.id), rows = history.accounts[item.id].slice(-window);
  check(item.height === (width <= 700 ? 240 : 260), "Chart has an explicit responsive height");
  check(Math.abs(item.width-item.viewWidth) < 1 && Math.abs(item.scaleX-1) < .01 && Math.abs(item.scaleY-1) < .01, "SVG coordinate space matches its rendered dimensions; labels never magnify");
  check(!item.pageOverflow, "No horizontal page overflow");
  if (window === 6) check(await page.locator("#monthly-chart").evaluate(item => item.scrollWidth <= item.clientWidth + 1), "All six months fit even on a narrow mobile card");
  check(await page.locator("#monthly-chart .axis-year").evaluateAll(items => items.every((item,index) => index === 0 || items[index-1].getBoundingClientRect().right + 1 <= item.getBoundingClientRect().left)), "Year labels remain separated and readable");
  check(await page.locator("#monthly-table tr").count() === rows.length, "Account switch replaces the recorded rows");
  const label = await page.locator("#monthly-chart .chart-point").first().getAttribute("aria-label");
  check(label.includes(money(rows[0][1])) && label.includes(money(rows[0][2])), "Chart contains the selected account's actual cash flows");
  check(await page.locator("#monthly-insights p").textContent() === monthlyDiscovery(profile, rows), "No stale account annotation");
  check(await page.locator('#monthly-chart [data-shortfall="true"]').count() === rows.filter(row => row[1] !== null && row[2] !== null && row[2] > row[1]).length, "No stale shortfall highlights");
  if (width >= 1300) check(item.essentialHeight <= height && item.baselineHeight <= height && item.columnsSeparated, "Readable baseline context fits beside the scenario workspace without a fixed page height");
  measurements.push({viewport: `${width}x${height}`, window, recordedMonths: profile.months, ...item});
  return item;
}
try {
  for (const [width,height] of [[1366,768],[1440,900],[375,900],[320,900]]) {
    const context = await browser.newContext({viewport:{width,height}, reducedMotion:"reduce"});
    const page = await context.newPage();page.on("pageerror", error => errors.push(error.message));
    await ready(page);
    const direct = ["39859","77059",...edgeIds];
    for (let i=0;i<direct.length+10;i++) {
      if (i<direct.length && profiles.has(direct[i])) {await page.locator("#account-id").fill(direct[i]);await page.locator("#lookup-button").click();}
      else await page.locator("#random-account").click();
      await validate(page,width,height,6);
      if ([0,1,direct.length+9].includes(i)) {
        await page.evaluate(() => scrollTo(0,0));
        await page.screenshot({path:path.join(output,`${width}-switch-${i}.png`)});
        await page.locator(".cashflow-panel").screenshot({path:path.join(output,`${width}-chart-${i}.png`)});
      }
      await page.locator("#history-twelve").click();await validate(page,width,height,12);
      await page.locator("#history-six").click();await validate(page,width,height,6);
    }
    if (width===1440) {
      for (const [nextWidth,nextHeight] of [[768,1000],[375,900],[1366,768],[1440,900]]) {
        await page.setViewportSize({width:nextWidth,height:nextHeight});
        await validate(page,nextWidth,nextHeight,6);
      }
    }
    await context.close();
  }
  const context = await browser.newContext({viewport:{width:1440,height:900}, reducedMotion:"no-preference"});
  const page = await context.newPage();page.on("pageerror", error => errors.push(error.message));
  await ready(page);await page.locator("#account-id").fill("39859");await page.locator("#lookup-button").click();await settle(page);
  check(await page.locator(".ripple-mark path.brand-drop").count()===1 && await page.locator(".ripple-mark path.brand-wave").count()===3 && await page.locator(".ripple-mark circle").count()===0, "Logo uses a drop and three open perspective waves, not a closed bullseye");
  await page.locator(".shock-section").evaluate(item => item.scrollIntoView({block:"start",behavior:"instant"}));
  await page.locator("#job-loss").check();
  check(await page.locator(".shock-wave .water-ring").count()===2, "Actual shock activation attaches two real wave rings");
  await page.waitForTimeout(40);
  check(await page.locator(".water-drop").evaluate(item => Number(getComputedStyle(item).opacity)>0), "The actual falling drop is painted before wave expansion");
  await page.screenshot({path:path.join(output,"motion-drop.png"),animations:"allow"});
  await page.waitForTimeout(120);
  await page.screenshot({path:path.join(output,"motion-impact.png"),animations:"allow"});
  const visible = await page.locator(".shock-wave").evaluate(svg => ({opacity:Number(getComputedStyle(svg).opacity),rings:[...svg.querySelectorAll("ellipse")].map(item=>({opacity:Number(getComputedStyle(item).opacity),width:item.getBoundingClientRect().width}))}));
  check(visible.opacity>0 && visible.rings.some(item=>item.opacity>0 && item.width>15), "Normal-use motion includes painted, visible expanding rings");
  await page.waitForTimeout(120);await page.screenshot({path:path.join(output,"motion-spread.png"),animations:"allow"});
  await page.waitForFunction(() => !document.querySelector(".shock-wave"));
  await page.screenshot({path:path.join(output,"motion-finished.png"),animations:"allow"});
  const profile=profiles.get("39859");
  check(await page.locator("#after-runway").textContent()===runwayHeading(simulate(profile,{job_loss:true})), "Visible motion preserves the official result");
  const burst=await page.evaluate(() => {
    const input=document.getElementById("ei-rate-number");
    for (const value of [60,65,70,75,80]) {input.value=String(value);input.dispatchEvent(new Event("input",{bubbles:true}));}
    return {waves:document.querySelectorAll(".shock-wave").length, income:Number(document.querySelector('[data-metric="income"] .comparison-after dd').dataset.value)};
  });
  check(burst.waves===0 && burst.income===simulate(profile,{job_loss:true,ei_rate:.8}).income, "Rapid input updates numbers immediately without replaying a large wave");
  await page.waitForFunction(() => document.querySelector(".shock-wave.is-settled"));
  check(await page.locator(".shock-wave").count()===1, "A single restrained ripple appears after input settles");
  await page.locator("#reset-scenario").click();
  check(await page.locator(".shock-wave").count()===0 && await page.locator("#comparison").isHidden(), "Reset clears both pending and visible feedback");
  await page.emulateMedia({reducedMotion:"reduce"});await page.locator("#job-loss").check();
  check(await page.locator(".shock-wave").count()===0 && await page.locator("#after-runway").textContent()===runwayHeading(simulate(profile,{job_loss:true})), "Reduced-motion users get correct nonanimated state changes");
  await context.close();
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,"measurements.json"),JSON.stringify(measurements,null,2));
  console.log(JSON.stringify({checks,accountViewMeasurements:measurements.length,chartHeights:[...new Set(measurements.map(item=>item.height))],maxTextScale:Math.max(...measurements.map(item=>item.scaleX)),desktopOverviewHeights:[...new Set(measurements.filter(item=>item.viewport.startsWith('1440')).map(item=>item.overviewHeight))],screenshots:output,result:"passed"},null,2));
} finally {await browser.close();}
