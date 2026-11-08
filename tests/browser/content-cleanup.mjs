// Validate concise demo copy, accessible definitions, selected-card contrast and preserved interactions.
import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {decodeProfiles,simulate} from "../../public/engine.mjs";
import {comparisonMetrics,money,runwayHeading} from "../../public/dashboard.mjs";
const {chromium}=await import(process.env.RIPPLE_BROWSER_TEST_MODULE||"playwright");
const base=process.env.RIPPLE_TEST_URL||"http://127.0.0.1:8502";
const output=process.env.RIPPLE_SCREENSHOTS||path.join(tmpdir(),"ripple-content-cleanup");await mkdir(output,{recursive:true});
const profiles=decodeProfiles(JSON.parse(await readFile(new URL("../../public/data/profiles.json",import.meta.url))));
const browser=await chromium.launch({channel:"chrome",headless:true});const errors=[],report=[];let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function choose(page,id){await page.locator("#account-id").fill(id);await page.locator("#lookup-button").click();await page.locator("#history-content").waitFor();}
try{
 for(const [width,height] of [[1440,900],[1536,864],[375,900],[320,900]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<800,reducedMotion:"reduce"});const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>!document.getElementById("lookup-button").disabled);
  check(await page.locator("header nav, header .track, #empty-state").count()===0,"Redundant navigation, track label and empty-state instructions are removed");
  check(await page.locator("#page-title").isVisible()&&await page.locator('label[for="account-id"]').textContent()==="Demo Account ID","The concise entry identifies demo data and keeps its title visible");
  check(await page.locator("#random-account").textContent()==="Random"&&await page.locator("#data-status").isHidden(),"Normal operation has a short Random action and no permanent technical status");
  const person=profiles.get("39859");await choose(page,person.account_id);
  check(await page.locator("#page-title").isVisible(),"Account selection does not hide the requested entry title");
  check(JSON.stringify(await page.locator(".metric-label").allTextContents())===JSON.stringify(["Money In","Spending","Estimated Buffer"]),"Three short labels preserve the primary metric hierarchy");
  check(await page.locator("#account-history").isHidden()&&await page.locator("#comparison-scale").evaluate(item=>item.classList.contains("sr-only")),"Record metadata and scale explanations leave the default visual focus");
  check((await page.locator("#buffer-context").textContent()).includes("months of typical spending"),"Buffer context uses the descriptive spending equivalent");
  const definition=page.locator('.metric-info:has(summary[aria-label="What does Estimated Buffer mean?"])');
  if(width<800)await definition.locator("summary").tap();else {await definition.locator("summary").focus();await page.keyboard.press("Enter");}
  check(await definition.locator("p").isVisible()&&(await definition.locator("p").textContent()).includes("not financial runway or total savings"),"Keyboard and touch can reveal the buffer's essential limitations");
  if(width<800)await definition.locator("summary").tap();else await page.keyboard.press("Enter");
  await page.locator("#explore-change").click();
  if(width<800)await page.locator('label.shock-option:has(#job-loss)').tap();else {await page.locator("#job-loss").focus();await page.keyboard.press("Space");}
  check(await page.locator("#job-loss").isChecked(),"Native shock selection works with keyboard and touch without a top menu");
  const contrast=await page.locator('label.shock-option:has(#job-loss)').evaluate(item=>{
   const style=getComputedStyle(item),input=getComputedStyle(item.querySelector("input"));
   const luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{const n=c/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
   const ratio=(a,b)=>{const [lo,hi]=[luminance(a),luminance(b)].sort((a,b)=>a-b);return (hi+.05)/(lo+.05);};
   return {background:style.backgroundColor,border:style.borderColor,checkmark:input.accentColor,text:ratio(style.color,style.backgroundColor),boundary:ratio(style.borderColor,style.backgroundColor),height:item.getBoundingClientRect().height};
  });
  check(contrast.background==="rgb(234, 241, 255)"&&contrast.border==="rgb(61, 56, 245)"&&contrast.checkmark==="rgb(61, 56, 245)","Selected shocks use a light-blue fill, blue border and native blue checkmark");
  check(contrast.text>=4.5&&contrast.boundary>=3&&contrast.height>=44,"Selected cards retain readable contrast, a clear boundary and a comfortable hit target");
  const before=simulate(person),after=simulate(person,{job_loss:true}),income=comparisonMetrics(before,after).find(row=>row.key==="income");
  const annotation=await page.locator("#result-explanation").textContent();
  check(annotation.includes(money(-income.delta))&&annotation.includes(money(after.monthly_shortfall)),"One short annotation connects the actual income change with the calculated shortfall");
  check(await page.locator("#after-runway").textContent()===runwayHeading(after)&&(await page.locator(".runway-note").textContent()).includes("Hypothetical"),"Concise runway retains the correct result and hypothetical qualifier");
  check(await page.locator("#next-step-text").isHidden()&&(await page.locator("#next-step-title").textContent()).includes(money(after.monthly_shortfall)),"The current gap produces one primary next-step amount without a repeated paragraph");
  await page.locator("#full-plan-details>summary").focus();await page.keyboard.press("Enter");
  check(await page.locator("#plan-context").isVisible()&&(await page.locator("#plan-context").textContent()).includes("Illustrative")&&await page.locator("#goal-plan-content").isVisible(),"The full plan keeps its context, assumptions and complete calculations available");
  await page.locator("#reset-scenario").click();await page.locator("#emergency-repair").check();await page.locator("#repair-cost").fill("0.001");
  check((await page.locator("#result-explanation").textContent()).includes("less than $0.01"),"Sub-cent changes are not described as a zero-dollar impact");
  await page.locator("#reset-scenario").click();
  await page.locator("#random-account").click();await page.locator("#history-content").waitFor();
  check(profiles.has(await page.locator("#account-id").inputValue())&&await page.locator("#comparison").isHidden(),"Random account and switching still clear obsolete scenarios");
  await page.locator("#footer-data").click();
  check(await page.locator("#about-data").evaluate(item=>item.open)&&await page.locator("#demo-data-note").isVisible()&&(await page.locator("#demo-data-note").textContent()).includes("Not connected to your bank"),"Footer access reveals the demo-data explanation and financial methodology");
  check((await page.locator("footer").textContent()).includes("Designed & Developed by Renyin Xu")&&(await page.locator("footer").textContent()).includes("Sheridan Datathon 2026 · Tangerine Track"),"Concise footer retains authorship and project attribution");
  check((await page.locator('footer a[href*="README.md"]').getAttribute("href")).endsWith("#ai-assisted-development-disclosure"),"AI-assisted development links to the actual README disclosure");
  await page.locator("#about-data>summary").click();
  await choose(page,"39859");await page.evaluate(()=>{location.hash="plan-title";});
  await page.waitForFunction(()=>document.getElementById("full-plan-details").open);
  check(await page.locator("#scenario-workspace").evaluate(item=>item.open),"Retained plan anchors reveal the correct disclosure after menu removal");
  await page.evaluate(()=>history.replaceState(null,"",location.pathname));await page.locator("#full-plan-details>summary").click();
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Content cleanup retains responsive page width");
  await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));await page.screenshot({path:path.join(output,`${width}-overview.png`),fullPage:true});
  report.push({width,height,selectedCard:contrast});await ctx.close();
 }
 const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce"});const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));
 let release;const waiting=new Promise(resolve=>release=resolve);
 await ctx.route("**/data/profiles.json",async route=>{await waiting;await route.continue();});
 await page.goto(base);await page.locator("#data-status").waitFor();
 check(await page.locator("#lookup-button").isDisabled(),"Relevant loading status accompanies unavailable controls");
 release();await page.waitForFunction(()=>!document.getElementById("lookup-button").disabled);
 check(await page.locator("#data-status").isHidden(),"Loading status clears on success");
 await ctx.close();assert.deepEqual(errors,[]);await writeFile(path.join(output,"selected-card-contrast.json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify({checks,viewports:report,javascriptErrors:errors,screenshots:output,result:"passed"},null,2));
}finally{await browser.close();}
