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
async function checkSignedChanges(page){
 const badges=await page.locator(".comparison-change dd").evaluateAll(items=>items.map(item=>{
  const style=getComputedStyle(item),text=item.firstChild.textContent;
  const luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{const n=c/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const [lo,hi]=[luminance(style.color),luminance(style.backgroundColor)].sort((a,b)=>a-b);
  return {text,color:style.color,background:style.backgroundColor,contrast:(hi+.05)/(lo+.05)};
 }));
 check(badges.length===4,"Primary and detailed comparisons retain every metric");
 for(const badge of badges){
  const expected=badge.text.startsWith("+")?"rgb(77, 101, 0)":badge.text.startsWith("−")?"rgb(61, 56, 245)":"rgb(96, 97, 110)";
  check(badge.color===expected&&badge.background==="rgb(241, 241, 246)","Every comparison badge uses its displayed arithmetic sign on a light gray background");
  check(badge.contrast>=4.5,"Signed and zero change text meets AA contrast on the badge background");
 }
 return badges;
}
async function checkFooter(page,width){
 const layout=await page.locator("footer").evaluate(footer=>{
  const rect=item=>{const r=item.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,center:(r.top+r.bottom)/2};};
  return {footer:rect(footer),credit:rect(footer.querySelector(".footer-credit")),links:rect(footer.querySelector(".footer-links")),items:[...footer.querySelectorAll(".footer-credit>*")].map(rect),main:rect(document.querySelector("main"))};
 });
 check(layout.items.every(item=>Math.abs(item.left-layout.credit.left)<1),"Footer identity, author and Datathon information share a clean left edge");
 check(Math.abs(layout.footer.left-(layout.main.left+24))<1&&Math.abs(layout.footer.right-(layout.main.right-24))<1,"Footer aligns with the main content gutters");
 if(width>900)check(layout.links.left>=layout.credit.right&&Math.abs(layout.links.center-layout.credit.center)<1,"Desktop footer links sit on the right with vertical balance");
 else check(layout.links.top>=layout.credit.bottom&&Math.abs(layout.links.left-layout.credit.left)<1,"Narrow footers stack links beneath the credit with a shared left edge");
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Footer never adds horizontal page overflow");
 await page.locator("footer").screenshot({path:path.join(output,`${width}-footer.png`)});
}
try{
 for(const width of [1440,375,320]){
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:"no-preference",deviceScaleFactor:2});
  const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>!document.getElementById("lookup-button").disabled);
  await page.locator("#account-id").fill("39859");await page.locator("#lookup-button").click();await page.locator("#history-content").waitFor();
  check(await page.locator(".shock-wave,.ripple-impact,.is-flowing").count()===0,"Account loading never starts decorative scenario motion");
  const palette=await page.evaluate(()=>{
   const style=s=>getComputedStyle(document.querySelector(s));
   const rgb=v=>v.trim().startsWith("#")?[1,3,5].map(i=>parseInt(v.trim().slice(i,i+2),16)):v.match(/[\d.]+/g).slice(0,3).map(Number);
   const light=v=>rgb(v).map(c=>{const n=c/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((s,p,i)=>s+p*[.2126,.7152,.0722][i],0);
   const contrast=(a,b)=>{const [lo,hi]=[light(a),light(b)].sort((a,b)=>a-b);return(hi+.05)/(lo+.05);};
   const root=getComputedStyle(document.documentElement),white="rgb(255,255,255)";
   return {brand:root.getPropertyValue("--brand").trim(),accent:root.getPropertyValue("--accent").trim(),in:style(".bar-in").fill,out:style(".bar-out").fill,legendIn:style(".key.in").backgroundColor,legendOut:style(".key.out").backgroundColor,button:contrast(style("#lookup-button").color,style("#lookup-button").backgroundColor),body:contrast(root.color,root.backgroundColor),muted:contrast(style(".metrics-context").color,root.backgroundColor),heading:contrast(style("h2").color,white),incoming:contrast(style('.metric strong[data-metric="income"]').color,white),limeEdge:contrast(style(".bar-in").stroke,white),limeInk:contrast(root.getPropertyValue("--accent-ink"),root.getPropertyValue("--accent"))};
  });
  check(palette.brand==="#3D38F5"&&palette.accent==="#C2EE14","Brand tokens use the requested exact colors");
  check(await page.locator('.metric strong[data-metric="income"]').evaluate(item=>getComputedStyle(item).color===getComputedStyle(document.documentElement).color),"The main Money In amount uses the normal dark text color");
  check(palette.in==="rgb(194, 238, 20)"&&palette.out==="rgb(61, 56, 245)"&&palette.legendIn===palette.in&&palette.legendOut===palette.out,"Cash-flow bars and legends consistently use green for Money In and blue for Money Out");
  for(const key of ["button","body","muted","heading","incoming","limeInk"])check(palette[key]>=4.5,`${key} text meets WCAG AA contrast`);
  check(palette.limeEdge>=3,"Lime graphics have a visible boundary against the white plot");reports.push({width,...palette});
  await page.locator("#explore-change").click();
  check(await page.locator(".shock-wave,.is-flowing").count()===0,"Opening exploration does not trigger a ripple");
  check(await page.locator("header nav").count()===0 && await page.locator("#job-loss").evaluate(item=>item===document.activeElement),"Exploration keeps keyboard focus without redundant header navigation");
  await page.locator("#job-loss").check();
  check(await page.locator(".shock-wave").evaluate(wave=>{
   const control=wave.parentElement.getBoundingClientRect(),r=wave.getBoundingClientRect();
   return wave.parentElement.matches(".shock-option")&&r.left>=control.left-1&&r.right<=control.right+1&&r.top>=control.top-1&&r.bottom<=control.bottom+1&&getComputedStyle(wave).overflow==="hidden";
  }),"Ripple stays clipped inside the selected control instead of floating below it");
  check(await page.locator("#after-runway").textContent()===runwayHeading(simulate(profiles.get("39859"),{job_loss:true})),"Scenario updates immediately using the preserved financial engine");
  const delta=await page.locator(".is-changed .comparison-change dd").first().evaluate(item=>({color:getComputedStyle(item).color,background:getComputedStyle(item).backgroundColor}));
  check(delta.color==="rgb(61, 56, 245)"&&delta.background==="rgb(241, 241, 246)","The negative income change uses blue text on the light gray badge");
  const signs=await checkSignedChanges(page);
  check(signs.some(item=>item.text.startsWith("+"))&&signs.some(item=>item.text.startsWith("−"))&&signs.some(item=>item.text==="$0.00"),"Positive, negative and unchanged amounts are covered together");
  check(await page.locator(".ripple-impact").evaluateAll(items=>items.every(item=>getComputedStyle(item).backgroundColor!=="rgb(240, 247, 212)")),"Affected results never flash large green background fills");
  await page.waitForFunction(()=>document.querySelector(".comparison-after .pair-bar.is-flowing"));
  check(await page.locator(".comparison-before .water-sheen").count()===0,"Original values never acquire simulated water motion");
  const colors=await page.locator(".comparison-after .bar-after").first().evaluate(item=>({fill:getComputedStyle(item).fill,stroke:getComputedStyle(item).stroke}));
  check(colors.fill==="rgb(194, 238, 20)","After bars use the simulated-state accent");
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
  await page.locator("#full-plan-details>summary").click();
  check(await page.locator(".shock-wave,.is-flowing").count()===0,"Opening a plan reveals its values without starting decorative motion");
  const plan=savingsPlan(profiles.get("39859"),simulate(profiles.get("39859"),{job_loss:true,ei_rate:.8}));
  check(await page.locator("#goal-progress").evaluate(item=>item.value)===Math.min(plan.available,plan.goal),"Savings surface motion leaves the semantic progress amount unchanged");
  await page.locator("#emergency-repair").check();
  await page.locator("#repair-cost").fill(String(profiles.get("39859").buffer-profiles.get("39859").spending));
  await page.waitForFunction(()=>document.querySelector("#goal-water .is-flowing"));
  await page.waitForTimeout(500);await page.locator(".goal-meter").screenshot({path:path.join(output,`${width}-savings-current.png`),animations:"allow"});
  check(await page.locator("#goal-water .water-sheen").evaluate(item=>Number(getComputedStyle(item).opacity)>0),"Savings progress paints the same restrained water surface");
  await page.locator("#emergency-repair").uncheck();
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
  await page.emulateMedia({reducedMotion:"no-preference"});
  // Use the same-origin stylesheet so fault injection respects the production CSP.
  const suppressionIndex=await page.evaluate(()=>{
   const sheet=[...document.styleSheets].find(item=>item.href?.endsWith("/styles.css"));
   return sheet.insertRule(".shock-wave,.ripple-impact,.is-flowing .water-sheen{animation:none!important}",sheet.cssRules.length);
  });
  await page.locator("#job-loss").check();
  await page.waitForFunction(()=>!document.querySelector(".shock-wave,.ripple-source,.ripple-impact,.is-flowing"),null,{timeout:3000});
  check(await page.locator(".shock-wave,.ripple-source").count()===0,"Fallback cleanup removes feedback even if animation events never fire");
  await page.evaluate(index=>[...document.styleSheets].find(item=>item.href?.endsWith("/styles.css")).deleteRule(index),suppressionIndex);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.locator("#higher-bills").check();await page.locator("#emergency-repair").check();
  await checkSignedChanges(page);
  await page.locator("#before-after-details>summary").click();
  await checkSignedChanges(page);
  await page.locator("#reset-scenario").click();await page.locator("#emergency-repair").check();await page.locator("#repair-cost").fill("0.001");
  const tiny=await checkSignedChanges(page);
  check(tiny.some(item=>item.text==="−< $0.01"&&item.color==="rgb(61, 56, 245)"),"Sub-cent decreases retain their blue minus sign instead of becoming a neutral zero");
  await checkFooter(page,width);
  await ctx.close();
 }
 for(const width of [1920,1100,900,768]){
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:"reduce"});const page=await ctx.newPage();
  await page.goto(base);await checkFooter(page,width);await ctx.close();
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,"contrast.json"),JSON.stringify(reports,null,2));
 console.log(JSON.stringify({checks,contrast:reports,javascriptErrors:errors,screenshots:output,result:"passed"},null,2));
}finally{await browser.close();}
