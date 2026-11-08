// Connected journey checks use the preserved engine and real official account profiles.
import assert from "node:assert/strict";
import {readFile, mkdir, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {decodeProfiles, simulate} from "../../public/engine.mjs";
import {money, savingsPlan, runwayHeading} from "../../public/dashboard.mjs";

const {chromium} = await import(process.env.RIPPLE_BROWSER_TEST_MODULE || "playwright");
const base = process.env.RIPPLE_TEST_URL || "http://127.0.0.1:8502";
const output = process.env.RIPPLE_SCREENSHOTS || path.join(tmpdir(), "ripple-connected-workspace");
await mkdir(output, {recursive:true});
const payload = JSON.parse(await readFile(new URL("../../public/data/profiles.json", import.meta.url)));
const profiles = decodeProfiles(payload), people = [...profiles.values()];
const browser = await chromium.launch({channel:"chrome",headless:true});
const errors=[], measurements=[];let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function choose(page,id) {
  await page.locator("#account-id").fill(id);await page.locator("#lookup-button").click();
  await page.locator("#history-content").waitFor();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function verify(page,person,options={}) {
  const after=simulate(person,options), plan=savingsPlan(person,after), active=Boolean(options.job_loss||options.higher_bills||options.emergency_repair);
  check(await page.locator("#baseline-runway").textContent()===runwayHeading(simulate(person)),"Historical runway is independent of the hypothetical scenario");
  const baseline=await page.locator("#metrics .metric>strong").allTextContents();
  check(JSON.stringify(baseline)===JSON.stringify([person.income,person.spending,person.buffer].map(money)),"All three main account metrics remain unchanged");
  check(JSON.stringify(await page.locator("#scenario-baseline dd").allTextContents())===JSON.stringify(baseline),"Mobile baseline uses the same exact recorded summary amounts");
  check((await page.locator("#plan-context").textContent()).startsWith(active?"Current scenario":"Historical baseline"),"Plan context follows the current scenario or baseline");
  if(active)check(await page.locator("#after-runway").textContent()===runwayHeading(after),"Scenario uses the official runway result");
  if(plan)check(await page.locator("#goal-summary").textContent()===(plan.remaining===0?"Target met":money(plan.remaining)),"Full goal plan uses the preserved scenario-dependent savings calculation");
  const message=await page.locator("#next-step-message").textContent();
  if(after.buffer_left<0)check(message.includes(money(-after.buffer_left))&&message.includes("below zero"),"Negative buffers produce a recovery action, not an available-savings claim");
  else if(after.buffer_left===0)check(message.includes("Restore the estimated buffer"),"A depleted buffer has a recovery action");
  else if(after.monthly_shortfall>0)check(message.includes(money(after.monthly_shortfall))&&message.includes("monthly gap"),"A monthly gap takes priority even when the example savings target is met");
  else if(plan?.remaining===0)check(message.includes("Example savings target met")&&message.includes(money(plan.goal)),"Met goals are identified using the existing target");
  else if(plan)check(message.includes(money(plan.remaining)),"The next step agrees with the current full plan savings gap");
  else check(message.includes("Savings goal unavailable"),"Zero or unavailable spending does not invent a savings target");
  return after;
}
try {
  for(const [width,height] of [[1440,900],[1536,864],[1366,768],[768,1000],[375,900],[320,900]]) {
    const ctx=await browser.newContext({viewport:{width,height},reducedMotion:"reduce",hasTouch:width<800});
    const page=await ctx.newPage();page.on("pageerror",error=>errors.push(error.message));
    await page.goto(base);await page.waitForFunction(()=>!document.getElementById("lookup-button").disabled);
    const person=profiles.get("39859");await choose(page,person.account_id);
    check(await page.locator("#scenario-workspace").evaluate(item=>item.open)===(width>1100),"Desktop opens the workspace; narrow screens start with an accessible compact disclosure");
    check(!await page.locator("#full-plan-details").evaluate(item=>item.open),"Detailed plans stay out of the default overview");
    await verify(page,person);
    await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));await page.screenshot({path:path.join(output,`${width}-overview.png`)});
    await page.locator("#explore-change").focus();await page.keyboard.press("Enter");
    check(await page.locator("#scenario-workspace").evaluate(item=>item.open),"Keyboard exploration reveals the workspace");
    check(await page.locator("#job-loss").evaluate(item=>item===document.activeElement),"Exploration focuses a working control");
    check(!await page.locator("#job-loss").isChecked()&&!await page.locator("#higher-bills").isChecked()&&!await page.locator("#emergency-repair").isChecked(),"Historical insights never infer or activate a shock");
    await page.keyboard.press("Space");await verify(page,person,{job_loss:true});
    const geometry=await page.evaluate(()=>{
      const rect=id=>document.getElementById(id).getBoundingClientRect();
      const left=document.querySelector(".baseline-context").getBoundingClientRect(),right=rect("scenario-workspace"),result=rect("comparison"),next=rect("next-step"),mini=document.querySelector(".mobile-baseline").getBoundingClientRect();
      return {columns:left.right<=right.left,nextStepGap:next.top-result.bottom,nextStepHeight:next.height,mobileBaselineVisible:mini.height>0,pageOverflow:document.documentElement.scrollWidth>innerWidth};
    });
    check(geometry.columns===(width>1100),"Responsive layout uses two columns only when there is readable space");
    check(geometry.nextStepGap>=0&&geometry.nextStepGap<24,"Next step immediately follows the outcome and its concise explanation");
    check(geometry.mobileBaselineVisible===(width<=1100)&&!geometry.pageOverflow,"Mobile keeps baseline context without horizontal page overflow");
    measurements.push({width,height,...geometry});
    await page.locator("#ei-rate-number").fill("80");await verify(page,person,{job_loss:true,ei_rate:.8});
    await page.locator("#higher-bills").check();await page.locator("#bill-rate").fill("50");
    await page.locator("#emergency-repair").check();await page.locator("#repair-cost").fill(String(person.buffer));
    await verify(page,person,{job_loss:true,ei_rate:.8,higher_bills:true,bill_increase_rate:.5,emergency_repair:true,repair_cost:person.buffer});
    await page.locator("#emergency-repair").check();await page.locator("#repair-cost").fill(String(person.buffer+1));
    await verify(page,person,{job_loss:true,ei_rate:.8,higher_bills:true,bill_increase_rate:.5,emergency_repair:true,repair_cost:person.buffer+1});
    await page.locator("#next-step").evaluate(item=>item.scrollIntoView({block:"center",behavior:"instant"}));
    if(width>1100)check(await page.locator("#monthly-chart").evaluate(item=>{const r=item.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),"Recorded cash-flow chart remains visible while reviewing the next step");
    else check(await page.locator(".mobile-baseline").evaluate(item=>{const r=item.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),"Mobile baseline stays visible beside scenario planning activity");
    await page.screenshot({path:path.join(output,`${width}-next-step.png`)});
    await page.locator("#full-plan-details>summary").focus();await page.keyboard.press("Enter");
    check(await page.locator("#goal-summary").isVisible()&&await page.locator("#backup-summary").isVisible(),"Keyboard opens Goal Plan and Backup Plan in the same workspace");
    check(await page.locator("#goal-plan-content").isVisible()&&await page.locator("#backup-plan").isVisible(),"A single View Full Plan action reveals all detailed goal figures and backup steps");
    await page.locator("#repair-cost").fill("-1");
    check(await page.locator("#scenario-error").isVisible()&&await page.locator("#scenario-breakdown").isHidden()&&(await page.locator("#next-step-title").textContent())==="Next step unavailable","Invalid inputs clear outdated changes and next-step advice");
    await page.locator("#reset-scenario").click();await verify(page,person);
    check(await page.locator("#comparison").isHidden()&&await page.locator("#scenario-breakdown").isHidden()&&!await page.locator("#full-plan-details").evaluate(item=>item.open),"Reset restores compact baseline planning and closes detailed panels");
    await page.locator("#emergency-repair").check();await page.locator("#repair-cost").fill("100");
    const nextPerson=profiles.get("77059");await choose(page,nextPerson.account_id);await verify(page,nextPerson);
    check(await page.locator("#comparison-chart>article").count()===0&&!await page.locator("#emergency-repair").isChecked(),"Switching accounts clears prior changes, assumptions and plan context");
    await page.locator("#explore-change").click();
    await page.locator("#full-plan-details>summary").focus();await page.keyboard.press("Enter");
    check(await page.locator("#full-plan-details").evaluate(item=>item.open)&&await page.locator("#full-plan-details>summary").evaluate(item=>item===document.activeElement),"The contextual disclosure reveals and focuses the plan without header navigation");
    await page.locator("#scenario-workspace>summary").focus();await page.keyboard.press("Enter");
    check(!await page.locator("#scenario-workspace").evaluate(item=>item.open),"Keyboard can collapse the scenario panel");
    await ctx.close();
  }
  const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"no-preference"});const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>!document.getElementById("lookup-button").disabled);
  for(const person of [people.find(p=>p.buffer<0),people.find(p=>p.household_bills===0),people.find(p=>p.spending>p.income),people.find(p=>p.buffer>p.spending*3&&p.income>p.spending)].filter(Boolean)) {await choose(page,person.account_id);await verify(page,person);}
  await choose(page,"39859");
  const feedback=await page.evaluate(()=>{document.getElementById("job-loss").click();return {animations:document.getAnimations().length,next:document.getElementById("next-step-title").textContent};});
  check(feedback.animations===0&&feedback.next.length>0,"Real shock input updates the next step directly without animated emphasis");
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.waitForFunction(()=>matchMedia("(prefers-reduced-motion: reduce)").matches&&!document.querySelector(".shock-wave,.ripple-impact"));
  check(await page.locator(".shock-wave,.ripple-impact").count()===0,"Reduced motion keeps the input-to-plan interface free of effects");
  await verify(page,profiles.get("39859"),{job_loss:true});
  await ctx.close();
  // Explicit browser-only planning fixtures; the public official assets are never modified.
  const fixtures=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce"});
  let fixturePayload;
  await fixtures.route("**/data/profiles.json",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(fixturePayload)}));
  const fixturePage=await fixtures.newPage();fixturePage.on("pageerror",error=>errors.push(error.message));
  for(const values of [{income:0,spending:0,buffer:1000},{income:2500,spending:2500,buffer:1000},{income:3000,spending:2500,buffer:1000}]) {
    fixturePayload=structuredClone(payload);
    for(const [field,value] of Object.entries(values))fixturePayload.rows[0][payload.columns.indexOf(field)]=value;
    const person=decodeProfiles(fixturePayload).values().next().value;
    await fixturePage.goto(base);await fixturePage.waitForFunction(()=>!document.getElementById("lookup-button").disabled);
    await choose(fixturePage,person.account_id);await verify(fixturePage,person);
    if(values.spending>0)check((await fixturePage.locator("#next-step-text").textContent()).includes(values.income>values.spending?money(250):"No positive monthly surplus"),"Savings-gap guidance distinguishes a usable contribution from no available surplus");
  }
  await fixtures.close();assert.deepEqual(errors,[]);
  await writeFile(path.join(output,"measurements.json"),JSON.stringify(measurements,null,2));
  console.log(JSON.stringify({checks,viewports:measurements,javascriptErrors:errors,screenshots:output,result:"passed"},null,2));
}finally{await browser.close();}
