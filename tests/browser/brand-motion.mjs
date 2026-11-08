// Real-browser checks for palette semantics, contrast, finite water motion and unchanged amounts.
import assert from "node:assert/strict";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {decodeProfiles,simulate} from "../../public/engine.mjs";
import {runwayHeading,savingsPlan} from "../../public/dashboard.mjs";
const {chromium}=await import(process.env.RIPPLE_BROWSER_TEST_MODULE||"playwright");
const base=process.env.RIPPLE_TEST_URL||"http://127.0.0.1:8502";
const output=process.env.RIPPLE_SCREENSHOTS||path.join(tmpdir(),"ripple-brand-motion");await mkdir(output,{recursive:true});
const profiles=decodeProfiles(JSON.parse(await readFile(new URL("../../public/data/profiles.json",import.meta.url))));
const browser=await chromium.launch({channel:"chrome",headless:true});let checks=0;const errors=[],reports=[];
const check=(value,message)=>{assert.ok(value,message);checks++;};
try{
 for(const width of [1440,375,320]){
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:"no-preference",deviceScaleFactor:2});
  const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>!document.getElementById("lookup-button").disabled);
  await page.locator("#account-id").fill("39859");await page.locator("#lookup-button").click();await page.locator("#history-content").waitFor();
  const palette=await page.evaluate(()=>{
   const style=s=>getComputedStyle(document.querySelector(s));
   const rgb=v=>v.trim().startsWith("#")?[1,3,5].map(i=>parseInt(v.trim().slice(i,i+2),16)):v.match(/[\d.]+/g).slice(0,3).map(Number);
   const light=v=>rgb(v).map(c=>{const n=c/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((s,p,i)=>s+p*[.2126,.7152,.0722][i],0);
   const contrast=(a,b)=>{const [lo,hi]=[light(a),light(b)].sort((a,b)=>a-b);return(hi+.05)/(lo+.05);};
   const root=getComputedStyle(document.documentElement),white="rgb(255,255,255)";
   return {brand:root.getPropertyValue("--brand").trim(),accent:root.getPropertyValue("--accent").trim(),in:style(".bar-in").fill,out:style(".bar-out").fill,button:contrast(style("#lookup-button").color,style("#lookup-button").backgroundColor),body:contrast(root.color,root.backgroundColor),muted:contrast(style(".lead").color,root.backgroundColor),heading:contrast(style("h2").color,white),limeEdge:contrast(style(".bar-out").stroke,white),limeInk:contrast(root.getPropertyValue("--accent-ink"),root.getPropertyValue("--accent"))};
  });
  check(palette.brand==="#3D38F5"&&palette.accent==="#AED904","Brand tokens use the requested exact colors");
  check(palette.in==="rgb(61, 56, 245)"&&palette.out==="rgb(174, 217, 4)","Cash-flow bars consistently distinguish money in and money out");
  for(const key of ["button","body","muted","heading","limeInk"])check(palette[key]>=4.5,`${key} text meets WCAG AA contrast`);
  check(palette.limeEdge>=3,"Lime graphics have a visible boundary against the white plot");reports.push({width,...palette});
  await page.locator("#explore-change").click();
  check(await page.locator('nav a[href="#shock-title"]').getAttribute("aria-current")==="location","Active workspace navigation uses an accessible current state");
  await page.locator("#job-loss").check();
  check(await page.locator("#after-runway").textContent()===runwayHeading(simulate(profiles.get("39859"),{job_loss:true})),"Scenario updates immediately using the preserved financial engine");
  const delta=await page.locator(".scenario-difference").first().evaluate(item=>({color:getComputedStyle(item).color,background:getComputedStyle(item).backgroundColor}));
  check(delta.color==="rgb(48, 59, 11)"&&delta.background==="rgb(174, 217, 4)","Changed amounts use readable dark text on the lime accent");
  await page.locator("#before-after-details>summary").click();
  await page.waitForFunction(()=>document.querySelector(".comparison-after .pair-bar.is-flowing"));
  check(await page.locator(".comparison-before .water-sheen").count()===0,"Original values never acquire simulated water motion");
  const colors=await page.locator(".comparison-after .bar-after").first().evaluate(item=>({fill:getComputedStyle(item).fill,stroke:getComputedStyle(item).stroke}));
  check(colors.fill==="rgb(174, 217, 4)","After bars use the simulated-state accent");
  check(await page.locator(".comparison-after .pair-bar").first().evaluate(svg=>{
   const bar=svg.querySelector(".bar-after"),clip=svg.querySelector("clipPath rect");return bar.getAttribute("x")===clip.getAttribute("x")&&bar.getAttribute("width")===clip.getAttribute("width");
  }),"The water surface is clipped to the exact filled amount");
  await page.waitForTimeout(350);
  const sheen=await page.locator(".comparison-after .water-sheen").first().evaluate(item=>({opacity:Number(getComputedStyle(item).opacity),transform:getComputedStyle(item).transform,clip:item.parentElement.getAttribute("clip-path")}));
  check(sheen.opacity>0&&sheen.transform!=="none"&&sheen.clip.startsWith("url(#"),"An actual, clipped directional water surface is painted during normal use");
  await page.locator(".comparison-after .pair-bar").first().screenshot({path:path.join(output,`${width}-water-current.png`),animations:"allow"});
  await page.screenshot({path:path.join(output,`${width}-after-comparison.png`),animations:"allow"});
  await page.waitForFunction(()=>!document.querySelector(".is-flowing"));
  check(await page.evaluate(()=>document.getAnimations().every(a=>a.effect.getTiming().iterations!==Infinity)),"No idle or perpetual loading-like animation remains");
  await page.locator("#ei-rate-number").fill("80");
  await page.waitForFunction(()=>document.querySelector('.comparison-metric[data-metric="income"] .is-flowing'));
  check(await page.locator('.comparison-metric[data-metric="spending"] .is-flowing, .comparison-metric[data-metric="buffer_left"] .is-flowing').count()===0,"Changing income sends water feedback only through affected financial bars");
  await page.waitForFunction(()=>!document.querySelector(".is-flowing"));
  await page.locator("#before-after-details>summary").click();
  await page.locator("#full-plan-details>summary").click();
  await page.waitForFunction(()=>document.querySelector("#goal-water .is-flowing"));
  const plan=savingsPlan(profiles.get("39859"),simulate(profiles.get("39859"),{job_loss:true,ei_rate:.8}));
  check(await page.locator("#goal-progress").evaluate(item=>item.value)===Math.min(plan.available,plan.goal),"Savings surface motion leaves the semantic progress amount unchanged");
  await page.waitForTimeout(500);await page.locator(".goal-meter").screenshot({path:path.join(output,`${width}-savings-current.png`),animations:"allow"});
  check(await page.locator("#goal-water .water-sheen").evaluate(item=>Number(getComputedStyle(item).opacity)>0),"Savings progress paints the same restrained water surface");
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.waitForFunction(()=>!document.querySelector(".is-flowing,.ripple-impact,.shock-wave"));
  await page.locator("#ei-rate-number").fill("65");
  check(await page.locator("#after-runway").textContent()===runwayHeading(simulate(profiles.get("39859"),{job_loss:true,ei_rate:.65})),"Reduced motion retains immediate financial updates");
  check(await page.locator(".water-sheen").evaluateAll(items=>items.every(item=>getComputedStyle(item).animationName==="none"&&Number(getComputedStyle(item).opacity)===0)),"Reduced motion disables every flowing surface");
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Brand refinements retain responsive page width");
  await page.locator("#emergency-repair").check();await page.locator("#repair-cost").fill(String(profiles.get("39859").buffer+1));
  check(await page.locator('.comparison-metric[data-metric="buffer_left"] .comparison-after svg').evaluate(svg=>{
   const bar=svg.querySelector(".bar-after"),clip=svg.querySelector("clipPath rect");return Number(bar.getAttribute("x"))<Number(svg.querySelector(".zero-line").getAttribute("x1"))&&bar.getAttribute("x")===clip.getAttribute("x")&&bar.getAttribute("width")===clip.getAttribute("width");
  }),"A negative buffer's water mask follows its exact negative bar from the real zero origin");
  check(await page.locator("#goal-water .water-sheen").count()===0&&await page.locator("#goal-progress").evaluate(item=>item.value)===0,"Depleted savings never paint a positive liquid surface");
  await page.locator("#ei-rate-number").fill("0");
  check(await page.locator('.comparison-metric[data-metric="income"] .comparison-after .bar-after, .comparison-metric[data-metric="income"] .comparison-after .water-sheen').count()===0,"Zero scenario amounts have neither a fake filled bar nor a moving water surface");
  await page.locator("#reset-scenario").click();check(await page.locator(".is-flowing,.shock-wave").count()===0,"Reset removes pending and active feedback");
  await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,"contrast.json"),JSON.stringify(reports,null,2));
 console.log(JSON.stringify({checks,contrast:reports,javascriptErrors:errors,screenshots:output,result:"passed"},null,2));
}finally{await browser.close();}
