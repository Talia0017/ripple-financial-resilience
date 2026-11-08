// Real-browser checks for palette semantics, contrast, restored historical motion and unchanged amounts.
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
  return {text,color:style.color,background:style.backgroundColor,shadow:style.boxShadow,contrast:(hi+.05)/(lo+.05)};
 }));
 check(badges.length===4,"Primary and detailed comparisons retain every metric");
 for(const badge of badges){
  const expected=badge.text.startsWith("+")?"rgb(174, 217, 4)":badge.text.startsWith("−")?"rgb(61, 56, 245)":"rgb(96, 97, 110)";
  check(badge.color===expected&&badge.background==="rgb(241, 241, 246)","Every comparison badge uses its displayed arithmetic sign on a light gray background");
  if(badge.text.startsWith("+"))check(badge.shadow==="none","Positive lime text retains the plain gray badge without dark backing");
  else check(badge.contrast>=4.5,"Negative and zero change text meets AA contrast on the badge background");
 }
 return badges;
}
async function checkNoExpandingRipple(page){
 check(await page.locator(".shock-wave,.water-ring,.water-drop,.ripple-source").count()===0,"The removed expanding source ripple never returns");
 check(await page.evaluate(()=>document.getAnimations().every(item=>!["drop-ring","ripple-scene","water-drop","loading-ring"].includes(item.animationName))),"No expanding ring or source-drop animation runs");
}
async function checkProgressPulse(page,selector){
 await page.waitForFunction(selector=>[...document.querySelectorAll(selector)].some(item=>Number(getComputedStyle(item).opacity)>0),selector);
 const pulse=await page.locator(selector).first().evaluate(item=>{
  const animation=item.getAnimations().find(a=>a.animationName==="water-current"),timing=animation.effect.getTiming(),style=getComputedStyle(item);
  return {duration:timing.duration,easing:style.animationTimingFunction,iterations:timing.iterations,opacity:Number(style.opacity),transform:style.transform,clip:item.parentElement.getAttribute("clip-path")};
 });
 check(pulse.duration===1200&&pulse.easing==="ease-in-out"&&pulse.iterations===1,"Progress feedback restores the original finite 1200ms easing and duration");
 check(pulse.opacity>0&&pulse.transform!=="none"&&pulse.clip.startsWith("url(#"),"The original fade is actually painted and clipped to the filled bar");
 await checkNoExpandingRipple(page);
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
   return {brand:root.getPropertyValue("--brand").trim(),accent:root.getPropertyValue("--accent").trim(),in:style(".bar-in").fill,out:style(".bar-out").fill,legendIn:style(".key.in").backgroundColor,legendOut:style(".key.out").backgroundColor,button:contrast(style("#lookup-button").color,style("#lookup-button").backgroundColor),body:contrast(root.color,root.backgroundColor),muted:contrast(style(".metrics-context").color,root.backgroundColor),heading:contrast(style("h2").color,white),incoming:contrast(style('.metric strong[data-metric="income"]').color,white),limeEdge:contrast(style(".bar-in").stroke,white)};
  });
  check(palette.brand==="#3D38F5"&&palette.accent==="#AED904","Brand tokens use the requested exact colors");
  check(await page.locator('.metric strong[data-metric="income"]').evaluate(item=>{const style=getComputedStyle(item);return style.color==="rgb(174, 217, 4)"&&style.backgroundColor==="rgba(0, 0, 0, 0)"&&style.boxShadow==="none"&&style.textShadow==="none"&&item.childElementCount===0;}),"The main Money In amount uses plain exact lime text without a backing or replacement effect");
  check(palette.in==="rgb(174, 217, 4)"&&palette.out==="rgb(61, 56, 245)"&&palette.legendIn===palette.in&&palette.legendOut===palette.out,"Cash-flow bars and legends consistently use green for Money In and blue for Money Out");
  for(const key of ["button","body","muted","heading"])check(palette[key]>=4.5,`${key} text meets WCAG AA contrast`);
  check(palette.limeEdge>=3,"Lime graphics have a visible boundary against the white plot");reports.push({width,...palette});
  await page.locator("#explore-change").click();
  check(await page.locator(".shock-wave,.is-flowing").count()===0,"Opening exploration does not trigger a ripple");
  check(await page.locator("header nav").count()===0 && await page.locator("#job-loss").evaluate(item=>item===document.activeElement),"Exploration keeps keyboard focus without redundant header navigation");
  await page.locator("#job-loss").check();
  const emphasis=await page.evaluate(()=>document.getAnimations().filter(item=>item.animationName==="impact-spread").map(item=>({...item.effect.getTiming(),easing:getComputedStyle(item.effect.target).animationTimingFunction})));
  check(emphasis.length>0&&emphasis.every(item=>item.duration===480&&item.easing==="ease-out"),"Result emphasis restores the original 480ms timing");
  check(await page.locator("#after-runway").textContent()===runwayHeading(simulate(profiles.get("39859"),{job_loss:true})),"Scenario updates immediately using the preserved financial engine");
  const delta=await page.locator(".is-changed .comparison-change dd").first().evaluate(item=>({color:getComputedStyle(item).color,background:getComputedStyle(item).backgroundColor}));
  check(delta.color==="rgb(61, 56, 245)"&&delta.background==="rgb(241, 241, 246)","The negative income change uses blue text on the light gray badge");
  const signs=await checkSignedChanges(page);
  check(signs.some(item=>item.text.startsWith("+"))&&signs.some(item=>item.text.startsWith("−"))&&signs.some(item=>item.text==="$0.00"),"Positive, negative and unchanged amounts are covered together");
  await checkNoExpandingRipple(page);
  check(await page.locator(".comparison-after .bar-after").first().evaluate(item=>getComputedStyle(item).fill==="rgb(174, 217, 4)"),"Animated After bars retain the existing accent");
  await checkProgressPulse(page,".comparison-after .is-flowing .water-sheen");
  check(await page.locator(".comparison-before .water-sheen").count()===0,"Historical Before bars never acquire scenario surface motion");
  check(await page.locator(".comparison-after .pair-bar").first().evaluate(svg=>{const bar=svg.querySelector(".bar-after"),clip=svg.querySelector("clipPath rect");return bar.getAttribute("x")===clip.getAttribute("x")&&bar.getAttribute("width")===clip.getAttribute("width");}),"Restored surface clipping matches the exact filled amount");
  await page.screenshot({path:path.join(output,`${width}-after-comparison.png`),animations:"allow"});
  await page.waitForFunction(()=>!document.querySelector(".is-flowing,.ripple-impact"));
  check(await page.locator(".water-sheen").evaluateAll(items=>items.every(item=>Number(getComputedStyle(item).opacity)===0)),"Progress pulses finish and return to the original idle appearance");
  await page.locator("#ei-rate").evaluate(input=>{input.value="80";input.dispatchEvent(new Event("input",{bubbles:true}));});
  check(await page.locator("#ei-rate-number").inputValue()==="80"&&await page.locator("#after-runway").textContent()===runwayHeading(simulate(profiles.get("39859"),{job_loss:true,ei_rate:.8})),"The slider still synchronizes the number input and immediate result");
  await page.locator("#full-plan-details>summary").click();
  const plan=savingsPlan(profiles.get("39859"),simulate(profiles.get("39859"),{job_loss:true,ei_rate:.8}));
  check(await page.locator("#goal-progress").evaluate(item=>item.value)===Math.min(plan.available,plan.goal),"The native static savings progress preserves the calculated amount");
  await checkNoExpandingRipple(page);
  await page.locator("#emergency-repair").check();
  const repair=profiles.get("39859").buffer-profiles.get("39859").spending;
  await page.locator("#repair-cost").fill(String(repair));
  const revised=savingsPlan(profiles.get("39859"),simulate(profiles.get("39859"),{job_loss:true,ei_rate:.8,emergency_repair:true,repair_cost:repair}));
  check(await page.locator("#goal-progress").evaluate(item=>item.value)===Math.min(revised.available,revised.goal),"Repair changes update static goal progress without changing its calculation");
  await checkProgressPulse(page,"#goal-water .is-flowing .water-sheen");
  await page.locator(".goal-meter").screenshot({path:path.join(output,`${width}-savings-pulse.png`),animations:"allow"});
  await checkNoExpandingRipple(page);
  await page.locator("#emergency-repair").uncheck();
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.waitForFunction(()=>!document.querySelector(".is-flowing,.ripple-impact"));
  check(await page.locator(".water-sheen").evaluateAll(items=>items.every(item=>getComputedStyle(item).animationName==="none"&&Number(getComputedStyle(item).opacity)===0)),"Reduced motion stops and hides every restored progress animation");
  check(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior==="auto"),"Reduced motion retains nonanimated scrolling");
  await page.locator("#ei-rate-number").fill("65");
  check(await page.locator("#ei-rate").inputValue()==="65"&&await page.locator("#after-runway").textContent()===runwayHeading(simulate(profiles.get("39859"),{job_loss:true,ei_rate:.65})),"Number input, slider and calculations remain synchronized under reduced motion");
  await checkNoExpandingRipple(page);
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Static scenario controls retain responsive page width");
  await page.locator("#emergency-repair").check();await page.locator("#repair-cost").fill(String(profiles.get("39859").buffer+1));
  check(await page.locator('.comparison-metric[data-metric="buffer_left"] .comparison-after svg').evaluate(svg=>{
   const bar=svg.querySelector(".bar-after");return Number(bar.getAttribute("x"))<Number(svg.querySelector(".zero-line").getAttribute("x1"))&&Number(bar.getAttribute("width"))>0;
  }),"A negative buffer retains its exact signed bar relative to the zero origin");
  check(await page.locator("#goal-progress").evaluate(item=>item.value)===0,"Depleted savings retain zero native progress");
  await page.locator("#ei-rate-number").fill("0");
  check(await page.locator('.comparison-metric[data-metric="income"] .comparison-after .bar-after').count()===0,"Zero scenario amounts have no fake filled bar");
  await page.locator("#reset-scenario").click();
  check(await page.locator("#comparison").isHidden(),"Reset still clears the scenario result");
  await page.emulateMedia({reducedMotion:"no-preference"});await page.locator("#job-loss").check();
  await page.locator("#higher-bills").check();await page.locator("#emergency-repair").check();
  await checkSignedChanges(page);await checkNoExpandingRipple(page);
  await page.locator("#before-after-details>summary").click();await checkSignedChanges(page);
  await page.locator("#reset-scenario").click();await page.locator("#emergency-repair").check();await page.locator("#repair-cost").fill("0.001");
  const tiny=await checkSignedChanges(page);
  check(tiny.some(item=>item.text==="−< $0.01"&&item.color==="rgb(61, 56, 245)"),"Sub-cent decreases retain their blue minus sign instead of becoming a neutral zero");
  await page.waitForTimeout(300);await checkNoExpandingRipple(page);
  await page.waitForFunction(()=>!document.querySelector(".is-flowing,.ripple-impact"));
  await page.locator("#lookup-button").hover();
  check(await page.locator("#lookup-button").evaluate(item=>getComputedStyle(item).filter==="brightness(0.94)"),"The original button hover effect remains intact");
  await page.locator(".metric-info summary").first().hover();
  check(await page.locator(".metric-info summary").first().evaluate(item=>getComputedStyle(item).backgroundColor==="rgb(238, 237, 255)"),"The original information hover surface remains intact");
  await page.locator(".chart-point").first().hover();
  check(await page.locator(".chart-point .bar-in").first().evaluate(item=>getComputedStyle(item).stroke==="rgb(36, 38, 51)"),"The original chart hover boundary remains intact");
  check(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior==="smooth"),"The original normal-motion smooth scrolling remains intact");
  await page.locator("#reset-scenario").click();
  check(await page.locator(".is-flowing,.ripple-impact").count()===0,"Reset removes active and pending progress and result feedback");
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
