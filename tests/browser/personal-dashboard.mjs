// Personal dashboard acceptance: wide layout, immediate comparisons and optional secondary scrolling.
import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {decodeProfiles,simulate} from "../../public/engine.mjs";
import {comparisonMetrics,money,runwayHeading} from "../../public/dashboard.mjs";
const {chromium}=await import(process.env.RIPPLE_BROWSER_TEST_MODULE||"playwright");
const base=process.env.RIPPLE_TEST_URL||"http://127.0.0.1:8502";
const output=process.env.RIPPLE_SCREENSHOTS||path.join(tmpdir(),"ripple-personal-dashboard");await mkdir(output,{recursive:true});
const profiles=decodeProfiles(JSON.parse(await readFile(new URL("../../public/data/profiles.json",import.meta.url))));
const report=await readFile(new URL("../../RESEARCH.md",import.meta.url),"utf8");
const browser=await chromium.launch({channel:"chrome",headless:true});const errors=[],measurements=[];let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function frames(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
try{
 check(["3,299","3,309","166","30434.58583333333","17689.631666666668","4,243","234"].every(value=>report.includes(value)),"Verified findings and exact medians remain in the English research report");
 for(const [width,height] of [[1440,900],[1536,864],[1100,900],[768,1000],[375,900],[320,900]]){
  const ctx=await browser.newContext({viewport:{width,height},reducedMotion:"reduce"});const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>!document.getElementById("lookup-button").disabled);
  await page.locator("#account-id").fill("39859");await page.locator("#lookup-button").click();await page.locator("#history-content").waitFor();await frames(page);
  const person=profiles.get("39859"),before=simulate(person);
  check(await page.locator(".discovery,#discovery-title,#story-chart,#research-method").count()===0,"No population statistics or research panel remain in the customer interface");
  check(await page.locator("#overview #metrics .metric").count()===3,"All three historical metrics belong to the left overview");
  check(await page.locator("#scenario-workspace #next-step").count()===1,"The next step stays connected to the scenario workspace");
  const workspace=await page.locator(".financial-workspace").boundingBox();
  if(width>1100)check(workspace.width>=width-100,"The desktop workspace uses the available browser width with modest gutters");
  await page.locator("#history-twelve").click();await frames(page);
  if(width>1100)check(await page.locator("#monthly-chart").evaluate(item=>item.scrollWidth<=item.clientWidth+1),"All twelve recorded months fit the expanded target desktop column");
  await page.locator("#history-six").click();await page.locator("#explore-change").click();
  for(let mask=1;mask<8;mask++){
   await page.locator("#job-loss").setChecked(Boolean(mask&1));await page.locator("#higher-bills").setChecked(Boolean(mask&2));await page.locator("#emergency-repair").setChecked(Boolean(mask&4));
   const after=simulate(person,{job_loss:Boolean(mask&1),higher_bills:Boolean(mask&2),emergency_repair:Boolean(mask&4),repair_cost:person.spending});
   const rows=comparisonMetrics(before,after),changed=rows.filter(row=>row.changed);
   check(JSON.stringify(await page.locator("#comparison-chart>article").evaluateAll(items=>items.map(item=>item.dataset.metric)))===JSON.stringify(changed.map(row=>row.key)),"Only relevant changes appear as immediate Before/After bars");
   check(await page.locator(".comparison-metric").count()===4&&await page.locator(".comparison-metric").evaluateAll(items=>new Set(items.map(item=>item.dataset.metric)).size===4),"Repeated shock combinations never leave duplicate or obsolete rows");
   check(await page.locator("#after-runway").textContent()===runwayHeading(after),"Primary runway matches the preserved official calculation");
   check((await page.locator("#runway-baseline").textContent()).includes(runwayHeading(before)),"The outcome identifies its historical baseline runway");
   for(const row of changed){
    const host=page.locator(`#comparison-chart [data-metric="${row.key}"]`);
    check(await host.isVisible(),"Changed comparison bars are visible without a disclosure");
    check(JSON.stringify(await host.locator("dd").evaluateAll(items=>items.map(item=>Number(item.dataset.value))))===JSON.stringify([row.before,row.after,row.delta]),"Before, After and explicit difference retain full precision");
    check(await host.locator(".pair-bar").count()===2,"Each affected metric has two distinct horizontal bars");
    const zeroes=await host.locator(".zero-line").evaluateAll(items=>items.map(item=>Number(item.getAttribute("x1"))));
    check(zeroes[0]===zeroes[1],"Before/After use the same zero origin and scale within the metric");
   }
   check(await page.locator('#comparison-chart [data-metric="runway"]').count()===0,"No-shortfall is never represented as a literal duration bar");
  }
  await page.locator("#reset-scenario").click();await page.locator("#job-loss").check();await page.locator("#ei-rate-number").fill("100");
  check(await page.locator("#comparison-chart>article").count()===0&&await page.locator("#scenario-breakdown").isHidden()&&(await page.locator("#result-explanation").textContent()).includes("No financial amounts changed"),"An unchanged scenario has an explicit explanation without empty or identical charts");
  await page.locator("#ei-rate-number").fill("55");
  await page.locator("#full-plan-details>summary").click();await frames(page);
  const region=page.locator("#full-plan-details .secondary-scroll");
  const layout=await region.evaluate(item=>({height:item.clientHeight,scrollHeight:item.scrollHeight,overflow:getComputedStyle(item).overflowY,tabIndex:item.getAttribute("tabindex")}));
  if(width>1100){
   check(layout.height<=340&&layout.scrollHeight>layout.height&&layout.overflow==="auto"&&layout.tabIndex==="0","Only expanded secondary desktop content uses a labeled, keyboard-focusable scroll region");
   await region.evaluate(item=>{item.scrollIntoView({block:"nearest",behavior:"instant"});item.focus({preventScroll:true});});await frames(page);
   const beforeScroll=await page.evaluate(()=>scrollY),beforeChart=await page.locator("#monthly-chart").boundingBox();
   await page.keyboard.press("End");await page.waitForFunction(()=>document.querySelector("#full-plan-details .secondary-scroll").scrollTop>0);await frames(page);
   check(Math.abs(await page.evaluate(()=>scrollY)-beforeScroll)<1,"Keyboard scrolling the detailed plan does not scroll the main dashboard");
   const afterChart=await page.locator("#monthly-chart").boundingBox();check(Math.abs(beforeChart.y-afterChart.y)<1,"Financial overview remains stable during secondary plan scrolling");
  }else check(layout.overflow==="visible"&&layout.tabIndex===null,"Tablet and mobile retain natural page flow without nested vertical scrolling");
  await page.locator("#before-after-details>summary").click();
  check(!await page.locator("#full-plan-details").evaluate(item=>item.open),"Secondary disclosures avoid stacking two long detail panels");
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"No horizontal page overflow");
  await page.locator("#before-after-details>summary").click();await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));
  await page.screenshot({path:path.join(output,`${width}-personal-workspace.png`),fullPage:true});
  measurements.push({width,height,workspaceWidth:workspace.width,secondary:layout});await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,"layout.json"),JSON.stringify(measurements,null,2));
 console.log(JSON.stringify({checks,viewports:measurements,javascriptErrors:errors,screenshots:output,result:"passed"},null,2));
}finally{await browser.close();}
