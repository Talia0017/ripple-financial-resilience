import {decodeProfiles, simulate} from "./engine.mjs";
import {money, monthName, decodeHistory, monthlyInsights, monthlyDiscovery, bufferEquivalent, runwayHeading, runwayExplanation, scenarioInsight, comparisonMetrics, savingsPlan, backupPlan} from "./dashboard.mjs";
import {renderMonthlyChart, renderComparisonChart, renderProgressFlow} from "./charts.mjs";

const $ = id => document.getElementById(id);
const element = (tag, text, className) => {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
};
let profiles = new Map(), selected = null, sourceHashes = null;
let loadGeneration = 0, historyGeneration = 0, historyWindow = 6;
let historyPromise = null, selectedHistory = null;
let lastScenario = null;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const narrowWorkspace = matchMedia("(max-width: 1100px)");
const rippleTargets = new Map();
const flowTargets = new Map();
let rippleTimer = null, pendingRipple = null;

function clearWaterFlow() {for (const finish of flowTargets.values()) finish();}
function flowWater(keys = null, scope = document) {
  clearWaterFlow();
  if (reducedMotion.matches) return;
  for (const host of scope.querySelectorAll(".comparison-after .pair-bar, #goal-water svg")) {
    const surface = host.querySelector(".water-sheen");
    if (!surface || host.closest("details:not([open]), [hidden]")) continue;
    const metric = host.closest("[data-metric]")?.dataset.metric;
    if (keys && (metric ? !keys.includes(metric) : !keys.includes("buffer_left"))) continue;
    const finish = event => {
      if (event && (event.target !== surface || event.animationName !== "water-current")) return;
      surface.removeEventListener("animationend", finish);surface.removeEventListener("animationcancel", finish);
      host.classList.remove("is-flowing");flowTargets.delete(host);
    };
    host.classList.add("is-flowing");flowTargets.set(host, finish);
    surface.addEventListener("animationend", finish);surface.addEventListener("animationcancel", finish);
  }
}
function clearRippleFeedback() {
  if (rippleTimer !== null) clearTimeout(rippleTimer);
  rippleTimer = null;pendingRipple = null;
  for (const finish of rippleTargets.values()) finish();
  clearWaterFlow();
}
function playRippleFeedback(source, keys, runwayChanged, settled = false) {
  if (reducedMotion.matches || !source?.isConnected || source.closest("details:not([open])") || !selected) {clearRippleFeedback();return;}
  clearRippleFeedback();
  const ns = "http://www.w3.org/2000/svg";
  const wave = document.createElementNS(ns, "svg");
  for (const [key, value] of Object.entries({viewBox: "0 0 120 56", class: `shock-wave${settled ? " is-settled" : ""}`, "aria-hidden": "true", focusable: "false"})) wave.setAttribute(key, value);
  const shape = (tag, attributes) => {
    const item = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
    wave.append(item);
  };
  shape("path", {class: "water-drop", d: "M60 1c-2 3-4 5-4 7a4 4 0 0 0 8 0c0-2-2-4-4-7Z"});
  shape("ellipse", {class: "water-ring water-ring-first", cx: 60, cy: 22, rx: 24, ry: 6});
  shape("ellipse", {class: "water-ring water-ring-second", cx: 60, cy: 22, rx: 31, ry: 8});
  source.append(wave);
  const targets = [[source, "ripple-source", wave, "ripple-scene"], ...keys.flatMap(key =>
    [...document.querySelectorAll(`#comparison-chart [data-metric="${key}"], #unchanged-comparison [data-metric="${key}"]`)]
      .filter(item => !item.closest("details:not([open]), [hidden]"))
      .map(item => [item, "ripple-impact", item, "impact-spread"]))];
  if (runwayChanged) {const item = document.querySelector(".outcome");targets.push([item, "ripple-impact", item, "impact-spread"]);}
  if (keys.length) {const item = $("next-step-message");targets.push([item, "ripple-impact", item, "impact-spread"]);}
  for (const [item, className, listener, animationName] of targets) {
    if (!item) continue;
    const finish = event => {
      if (event && (event.target !== listener || event.animationName !== animationName)) return;
      listener.removeEventListener("animationend", finish);listener.removeEventListener("animationcancel", finish);
      item.classList.remove(className);rippleTargets.delete(item);
      if (listener === wave) wave.remove();
    };
    item.classList.add(className);rippleTargets.set(item, finish);
    listener.addEventListener("animationend", finish);listener.addEventListener("animationcancel", finish);
  }
  if (keys.length || runwayChanged) flowWater(keys);
}
function rippleFeedback(event, keys, runwayChanged) {
  if (reducedMotion.matches) {clearRippleFeedback();return;}
  const source = event?.target?.closest(".shock-option, .shock-assumption");
  if (!source) return;
  if (event.target.type === "checkbox") {playRippleFeedback(source, keys, runwayChanged);return;}
  const previous = pendingRipple?.source === source ? pendingRipple : null;
  pendingRipple = {source, keys: [...new Set([...(previous?.keys ?? []), ...keys])], runway: runwayChanged || Boolean(previous?.runway), account: selected.account_id};
  if (rippleTimer !== null) clearTimeout(rippleTimer);
  // Calculation is immediate; only the small final visual ripple waits for input to settle.
  rippleTimer = setTimeout(() => {
    const pulse = pendingRipple;
    if (pulse && pulse.account === selected?.account_id) playRippleFeedback(pulse.source, pulse.keys, pulse.runway, true);
    else clearRippleFeedback();
  }, 180);
}
reducedMotion.addEventListener("change", () => {if (reducedMotion.matches) clearRippleFeedback();});

function message(item, text) {item.textContent = text; item.hidden = !text;}
function clearScenarioOutput() {
  clearRippleFeedback();lastScenario = null;
  $("comparison").hidden = true;
  $("scenario-breakdown").hidden = true;
  $("before-after-details").hidden = true;
  $("unchanged-comparison").replaceChildren();
  $("scenario-invitation").hidden = true;
  $("comparison-chart").replaceChildren();
  $("comparison-body").replaceChildren();
  $("scenario-contributors").replaceChildren();
  for (const id of ["after-runway", "runway-baseline", "scenario-state", "runway-explanation", "result-explanation", "result-cause", "result-supporting"]) $(id).textContent = "";
  $("result-supporting").hidden = true;
  $("scenario-insight").removeAttribute("data-affected");
}
function clearSelection() {
  document.body.classList.remove("has-account");
  selected = null;
  selectedHistory = null;
  historyGeneration++;
  $("dashboard").hidden = true;
  $("empty-state").hidden = false;
  clearScenarioOutput();
}
function setControls() {
  for (const [switchId, inputId, settingsId] of [["job-loss", "ei-rate", "job-settings"], ["higher-bills", "bill-rate", "bill-settings"], ["emergency-repair", "repair-cost", "repair-settings"]]) {
    const enabled = $(switchId).checked;
    $(inputId).disabled = !enabled;
    $(settingsId).hidden = !enabled;
  }
  $("ei-rate-number").disabled = !$("job-loss").checked;
  $("ei-output").textContent = `${$("ei-rate-number").value || "—"}%`;
}
function resetScenario() {
  clearRippleFeedback();lastScenario = null;
  for (const id of ["job-loss", "higher-bills", "emergency-repair"]) $(id).checked = false;
  $("ei-rate").value = "55";
  $("ei-rate-number").value = "55";
  $("bill-rate").value = "15";
  $("repair-cost").value = String(Math.max(selected?.spending ?? 0, 0));
  $("comparison-details").open = false;
  $("before-after-details").open = false;
  $("full-plan-details").open = false;
  updateComparison();
}
function numberInput(id, label) {
  const input = $(id);
  if (!input.value.trim() || !input.checkValidity() || !Number.isFinite(Number(input.value)) || Number(input.value) < 0) throw new Error(id === "ei-rate-number" ? "Enter a whole-number replacement percentage from 0 to 100." : `Enter a valid, non-negative number for ${label}.`);
  return Number(input.value);
}
function fillTable(id, rows) {
  $(id).replaceChildren(...rows.map(row => {
    const tr = element("tr");
    row.forEach((text, index) => {
      const cell = element(index ? "td" : "th", text);
      if (!index) cell.scope = "row";
      tr.append(cell);
    });
    return tr;
  }));
}
function renderPlans(after, active) {
  const plan = savingsPlan(selected, after);
  $("plan-context").textContent = `${active ? "Current scenario" : "Historical baseline"} · Illustrative`;
  let title, text;
  if (!after) {title = "Next step unavailable";text = "Resolve missing account values or invalid assumptions to see a relevant plan.";}
  else if (after.buffer_left <= 0) {
    title = after.buffer_left < 0 ? `${money(-after.buffer_left)} below zero` : "Restore the estimated buffer";
    text = "Review available support and adjustable commitments before planning a savings contribution.";
  } else if (after.monthly_shortfall > 0) {
    title = `Review a ${money(after.monthly_shortfall)} monthly gap`;
    text = "Review lower spending or additional money in before planning a contribution.";
  } else if (plan?.remaining === 0) {
    title = "Example savings target met";
    text = `The estimated buffer meets the ${money(plan.goal)} three-month spending target. Confirm what cash is actually accessible.`;
  } else if (plan) {
    title = `${money(plan.remaining)} to the example savings goal`;
    text = plan.contribution > 0 ? `Illustration: ${money(plan.contribution)}/month from half the estimated surplus. Review the full plan's assumptions.` : "No positive monthly surplus is available for a modeled contribution. Review cash flow first.";
  } else {title = "Savings goal unavailable";text = backupPlan(after, active)[0];}
  $("next-step-title").textContent = title;$("next-step-text").textContent = text;
  const host = $("goal-plan-content");
  host.replaceChildren();
  $("goal-progress").hidden = !plan;
  $("goal-progress").parentElement.hidden = !plan;
  if (plan) renderProgressFlow($("goal-water"), plan.progress);else $("goal-water").replaceChildren();
  $("goal-summary").textContent = !plan ? "Not available" : plan.remaining === 0 ? "Target met" : money(plan.remaining);
  $("goal-caption").textContent = !plan ? "Valid spending and scenario data needed." : plan.remaining === 0 ? `${money(plan.goal)} three-month spending target.` : `remaining toward a ${money(plan.goal)} three-month spending target.`;
  if (plan) {$("goal-progress").max = plan.goal;$("goal-progress").value = Math.min(plan.available, plan.goal);}
  const belowZero = after && after.buffer_left < 0;
  $("backup-summary").textContent = !after ? "Not available" : belowZero ? `${money(-after.buffer_left)} below zero` : after.monthly_shortfall > 0 ? `${money(after.monthly_shortfall)}/month` : after.buffer_left === 0 ? "No buffer remaining" : `${money(after.income - after.spending)}/month`;
  $("backup-caption").textContent = !after ? "Review the scenario inputs." : belowZero ? "Address the estimated balance deficit." : after.monthly_shortfall > 0 ? "Close the estimated monthly gap." : after.buffer_left === 0 ? "Review how to restore an estimated reserve." : "Estimated surplus to review.";
  if (!plan) host.append(element("p", "A positive spending estimate and valid scenario data are needed to calculate a meaningful savings goal.", "notice"));
  else {
    const goal = element("p", money(plan.goal), "goal-number");
    goal.append(element("small", "Three months of typical baseline spending"));
    const figures = element("dl", undefined, "plan-figures");
    for (const [label, value] of [["Buffer toward goal · current scenario", money(plan.available)], ["Remaining target", money(plan.remaining)], ["Potential monthly contribution", money(plan.contribution)], ["Estimated time to goal", plan.months === null ? "Not estimable" : plan.months === 0 ? "Target met" : `${plan.months.toLocaleString("en-CA")} months`]]) {
      const group = element("div");group.append(element("dt", label), element("dd", value));figures.append(group);
    }
    const note = plan.remaining === 0 ? "The estimated buffer meets this example target. A balance estimate is not proof of accessible savings."
      : plan.contribution > 0 ? `Illustration: set aside half of the current scenario's ${money(plan.surplus)} estimated monthly surplus, limited to the remaining target. Timing assumes unchanged cash flow, no interest and no further shocks.`
      : "No positive monthly surplus is available under this scenario. No contribution or completion date is suggested. Review the gap before planning a contribution.";
    host.append(goal, figures, element("p", note, "fineprint"));
    if (after.buffer_left < 0) host.append(element("p", "A negative balance contributes zero toward this goal; the below-zero amount remains a separate issue to address.", "fineprint"));
  }
  $("backup-plan").replaceChildren(...(after ? backupPlan(after, active) : ["Scenario data is unavailable. Resolve missing account values or invalid assumptions before using a backup plan."]).map(text => element("li", text)));
}
function updateComparison(event) {
  if (!selected) return;
  setControls();
  try {
    const before = simulate(selected);
    const options = {
      job_loss: $("job-loss").checked,
      ei_rate: $("job-loss").checked ? numberInput("ei-rate-number", "income replacement percentage") / 100 : .55,
      higher_bills: $("higher-bills").checked,
      bill_increase_rate: $("higher-bills").checked ? numberInput("bill-rate", "bill increase") / 100 : .15,
      emergency_repair: $("emergency-repair").checked,
      repair_cost: $("emergency-repair").checked ? numberInput("repair-cost", "repair cost") : 0,
    };
    const after = simulate(selected, options);
    const count = [options.job_loss, options.higher_bills, options.emergency_repair].filter(Boolean).length;
    if (!count) {
      clearScenarioOutput();
      $("scenario-invitation").hidden = false;
      message($("scenario-error"), "");
      renderPlans(before, false);
      lastScenario = before;
      return;
    }
    $("scenario-invitation").hidden = true;
    $("scenario-state").textContent = `${count} hypothetical ${count === 1 ? "shock" : "shocks"} selected`;
    renderComparisonChart($("comparison-chart"), before, after, "changed");
    renderComparisonChart($("unchanged-comparison"), before, after, "unchanged");
    fillTable("comparison-body", [
      ["Monthly money in", money(before.income), money(after.income)],
      ["Monthly spending · includes loan payments", money(before.spending), money(after.spending)],
      ["One-time costs", money(before.one_off_costs), money(after.one_off_costs)],
      ["Remaining buffer", money(before.buffer_left), money(after.buffer_left)],
      ["Monthly shortfall", money(before.monthly_shortfall), money(after.monthly_shortfall)],
      ["Official financial runway", before.runway_label, after.runway_label],
    ]);
    $("after-runway").textContent = runwayHeading(after);
    $("runway-baseline").textContent = `Before: ${runwayHeading(before)}`;
    $("runway-explanation").textContent = runwayExplanation(after);
    const insight = scenarioInsight(selected, before, after, options);
    $("result-cause").textContent = insight.primary;
    $("result-explanation").textContent = !insight.affected.length ? "No financial amounts changed; the historical baseline runway still applies under these assumptions."
      : after.buffer_left <= 0 ? "No positive buffer remains, so the model gives zero runway even if money in covers spending."
      : after.no_shortfall ? "Money in covers monthly spending under these assumptions; this is not a guaranteed duration."
      : `${money(after.buffer_left)} of estimated buffer covers a ${money(after.monthly_shortfall)} monthly gap in this model.${after.capped ? " Runway is capped at 120 months." : ""}`;
    message($("result-supporting"), insight.supporting);
    $("scenario-insight").dataset.affected = insight.affected.join(" ");
    $("scenario-contributors").replaceChildren(...insight.contributors.map(text => element("li", text)));
    message($("scenario-error"), "");
    $("comparison").hidden = false;
    $("scenario-breakdown").hidden = !$("comparison-chart").childElementCount;
    $("before-after-details").hidden = false;
    renderPlans(after, count > 0);
    const previous = lastScenario ?? before;
    const keys = comparisonMetrics(previous, after).filter(row => row.changed).map(row => row.key);
    rippleFeedback(event, keys, previous.runway !== after.runway || previous.no_shortfall !== after.no_shortfall);
    lastScenario = after;
  } catch (error) {
    clearScenarioOutput();
    message($("scenario-error"), error.message);
    renderPlans(null, false);
  }
}
function renderHistory() {
  if (!selectedHistory) return;
  $("history-content").hidden = false;
  const rows = selectedHistory.slice(-historyWindow);
  $("history-six").setAttribute("aria-pressed", String(historyWindow === 6));
  $("history-twelve").setAttribute("aria-pressed", String(historyWindow === 12));
  $("history-status").textContent = `${rows.length} recorded ${rows.length === 1 ? "month" : "months"} · ${monthName(rows[0][0])} – ${monthName(rows.at(-1)[0])}`;
  renderMonthlyChart($("monthly-chart"), rows, $("monthly-tooltip"));
  const insights = monthlyInsights(rows);
  const observation = element("p", monthlyDiscovery(selected, rows));
  $("monthly-insights").replaceChildren(element("span", "Worth noticing", "insight-label"), observation);
  $("additional-monthly-insight").textContent = insights.slice(1).join(" ");
  fillTable("monthly-table", rows.map(([month, incoming, outgoing]) => [monthName(month), money(incoming), money(outgoing)]));
  $("history-note").textContent = `Showing the most recent ${rows.length} available records, up to ${historyWindow}. Accounts may have fewer records or gaps between months. Monthly values come directly from the official source, not from the summary medians.`;
  $("history-content").hidden = false;
}
async function loadHistory() {
  if (!selected) return;
  const generation = ++historyGeneration;
  selectedHistory = null;
  $("monthly-chart").replaceChildren();$("monthly-insights").replaceChildren();$("monthly-table").replaceChildren();
  $("monthly-tooltip").hidden = true;$("monthly-tooltip").textContent = "";
  $("additional-monthly-insight").textContent = "";$("history-note").textContent = "";
  $("history-content").hidden = true;
  $("retry-history").hidden = true;
  $("history-status").textContent = "Loading recorded monthly cash flows…";
  for (const id of ["history-six", "history-twelve"]) $(id).disabled = true;
  const currentProfiles = profiles, hashes = sourceHashes;
  if (!historyPromise) historyPromise = fetch(new URL("./data/history.json", import.meta.url), {cache: "no-cache"}).then(async response => {
    if (!response.ok) throw new Error(`Monthly history could not be loaded (HTTP ${response.status}).`);
    return decodeHistory(await response.json(), currentProfiles, hashes);
  });
  try {
    const histories = await historyPromise;
    if (generation !== historyGeneration || !selected) return;
    selectedHistory = histories.get(selected.account_id);
    for (const id of ["history-six", "history-twelve"]) $(id).disabled = false;
    renderHistory();
  } catch (error) {
    if (generation !== historyGeneration) return;
    historyPromise = null;
    $("history-status").textContent = `${error.message} Summary metrics and scenarios remain available. Monthly values have not been invented.`;
    $("retry-history").hidden = false;
  }
}
function chooseAccount(accountId) {
  const profile = profiles.get(accountId.trim());
  if (!profile) {
    clearSelection();
    $("account-id").setAttribute("aria-invalid", "true");
    message($("lookup-error"), "Account not found. Choose an ID from the official list, or try Random Account.");
    return;
  }
  selected = profile; selectedHistory = null; historyWindow = 6;
  document.body.classList.add("has-account");
  $("account-id").value = profile.account_id;
  $("account-id").removeAttribute("aria-invalid");
  message($("lookup-error"), "");
  $("dashboard").hidden = false; $("empty-state").hidden = true;
  $("selected-account").textContent = `Account ${profile.account_id}`;
  $("account-history").textContent = `${profile.months} recorded months · ${profile.first_month} – ${profile.last_month}`;
  const definitions = [
    ["Typical Monthly Money In", "income", "All money entering the account, not necessarily salary."],
    ["Typical Monthly Spending", "spending", "Money going out, including loan payments."],
    ["Estimated Cash Buffer", "buffer", "Historical average balance estimate, not total savings."],
  ];
  $("metrics").replaceChildren(...definitions.map(([label, key, help]) => {
    const card = element("article", undefined, "metric");
    const value = element("strong", money(profile[key]));value.dataset.metric = key;
    const heading = element("div", undefined, "metric-heading");
    const info = element("details", undefined, "metric-info");
    const trigger = element("summary", "i");
    trigger.setAttribute("aria-label", `About ${label}`);
    info.append(trigger, element("p", help));
    heading.append(element("p", label, "metric-label"), info);
    card.append(heading, value);
    if (key === "buffer") {
      const equivalent = bufferEquivalent(profile);
      const context = element("p", undefined, "buffer-context");context.id = "buffer-context";
      context.append(element("strong", !equivalent ? "Equivalent unavailable" : equivalent.positive ? `${equivalent.ratio < .05 ? "< 0.1" : "≈ " + new Intl.NumberFormat("en-CA", {maximumFractionDigits: 1}).format(equivalent.ratio)}× monthly spending` : equivalent.label), element("span", " · not runway"));
      card.append(context);
    }
    return card;
  }));
  $("scenario-baseline").replaceChildren(...[["Money In", "income"], ["Spending", "spending"], ["Cash Buffer", "buffer"]].map(([label, key]) => {
    const group = element("div");group.append(element("dt", label), element("dd", money(profile[key])));return group;
  }));
  $("supporting-metrics").replaceChildren(...[
    ["Typical Fixed Costs", "fixed_costs", "Bills, insurance and loan payments"],
    ["Household Bills", "household_bills", profile.household_bills === 0 ? "Zero recorded does not mean no living expenses" : "Typical recorded monthly bills"],
    ["Loan Payment", "loan_payment", "Loans running at year-end 2025"],
  ].map(([label, key, help]) => {
    const group = element("div"), dt = element("dt", label);
    dt.append(element("small", help));group.append(dt, element("dd", money(profile[key])));return group;
  }));
  $("data-warnings").replaceChildren(...profile.warnings.map(text => element("p", text, "notice warning")));
  try {
    const baseline = simulate(profile);
    $("baseline-runway").textContent = runwayHeading(baseline);
    $("baseline-explanation").textContent = runwayExplanation(baseline);
  } catch {
    $("baseline-runway").textContent = "Unavailable";
    $("baseline-explanation").textContent = "Money in, spending and buffer must all be available to calculate runway. Missing values are not replaced with zero.";
  }
  $("higher-bills").disabled = !Number.isFinite(profile.household_bills);
  $("scenario-workspace").open = !narrowWorkspace.matches;
  $("financial-details").open = false;
  for (const id of ["goal-plan-details", "backup-plan-details"]) $(id).open = true;
  resetScenario();loadHistory();
  $("overview-title").tabIndex = -1;$("overview-title").focus({preventScroll: true});
}
async function loadProfiles() {
  const generation = ++loadGeneration;
  clearSelection();historyPromise = null;
  document.body.classList.add("is-loading");
  $("load-error").hidden = true;
  $("data-status").textContent = "Loading official accounts…";
  for (const id of ["account-id", "lookup-button", "random-account"]) $(id).disabled = true;
  try {
    const response = await fetch(new URL("./data/profiles.json", import.meta.url), {cache: "no-cache"});
    if (!response.ok) throw new Error(`Account data could not be loaded (HTTP ${response.status}).`);
    const payload = await response.json(), loaded = decodeProfiles(payload);
    if (generation !== loadGeneration) return;
    profiles = loaded;sourceHashes = payload.dataset.source_sha256;
    $("account-options").replaceChildren(...[...profiles.keys()].map(id => {const option = element("option");option.value = id;return option;}));
    for (const id of ["account-id", "lookup-button", "random-account"]) $(id).disabled = false;
    $("account-id").placeholder = "Enter or search an Account ID";
    $("data-status").textContent = `${profiles.size.toLocaleString("en-CA")} official accounts · Ready`;
    $("dataset-detail").textContent = `${payload.dataset.monthly_rows.toLocaleString("en-CA")} monthly records and ${payload.dataset.loan_rows.toLocaleString("en-CA")} loan records, covering ${payload.dataset.first_month} to ${payload.dataset.last_month}. All ${profiles.size.toLocaleString("en-CA")} accounts are supported. Amounts are displayed in CAD, following the challenge dataset units; no currency conversion is applied.`;
    document.body.classList.remove("is-loading");
  } catch (error) {
    if (generation !== loadGeneration) return;
    profiles = new Map();$("account-options").replaceChildren();
    document.body.classList.remove("is-loading");
    $("data-status").textContent = "Account data unavailable";
    $("load-error").hidden = false;
    $("load-error-text").textContent = `${error.message} Check your connection and try again. Missing data is never replaced with sample accounts.`;
  }
}
$("lookup-form").addEventListener("submit", event => {event.preventDefault();chooseAccount($("account-id").value);});
$("random-account").addEventListener("click", () => {const ids = [...profiles.keys()];if (ids.length) chooseAccount(ids[Math.floor(Math.random() * ids.length)]);});
$("reset-scenario").addEventListener("click", resetScenario);
function revealWorkspace(plan = false) {
  if (!selected) {$("account-id").focus();return;}
  $("scenario-workspace").open = true;
  if (plan) $("full-plan-details").open = true;
  const target = plan ? $("full-plan-details").querySelector("summary") : document.querySelector('.scenario-selector input:checked, .scenario-selector input:not(:disabled)');
  target.focus({preventScroll: true});
  const rect = target.getBoundingClientRect();
  if (rect.top < 0 || rect.bottom > innerHeight) target.scrollIntoView({block: "nearest", behavior: "instant"});
}
function setNavigation(id) {
  for (const link of document.querySelectorAll("nav a")) {
    if (link.hash === `#${id}`) link.setAttribute("aria-current", "location");else link.removeAttribute("aria-current");
  }
}
document.addEventListener("focusin", event => {
  if (event.target.closest("#next-step, #full-plan-details")) setNavigation("plan-title");
  else if (event.target.closest("#scenario-workspace")) setNavigation("shock-title");
  else if (event.target.closest("#overview, #lookup-form")) setNavigation("overview");
});
for (const link of document.querySelectorAll("nav a")) link.addEventListener("click", () => setNavigation(link.hash.slice(1)));
for (const id of ["before-after-details", "full-plan-details"]) $(id).addEventListener("toggle", () => {
  if ($(id).open) flowWater(null, $(id));
  else for (const [host, finish] of flowTargets) if (host.closest("details:not([open])")) finish();
});
$("explore-change").addEventListener("click", () => revealWorkspace());
for (const link of document.querySelectorAll('a[href="#shock-title"], a[href="#plan-title"]')) link.addEventListener("click", event => {event.preventDefault();revealWorkspace(link.hash === "#plan-title");});
function syncSecondaryFocus() {for (const region of document.querySelectorAll(".secondary-scroll")) {if (narrowWorkspace.matches) region.removeAttribute("tabindex");else region.tabIndex = 0;}}
narrowWorkspace.addEventListener("change", () => {if (selected) $("scenario-workspace").open = !narrowWorkspace.matches;syncSecondaryFocus();});
syncSecondaryFocus();
$("scenario-workspace").addEventListener("toggle", () => {if (!$("scenario-workspace").open) clearRippleFeedback();});
$("retry-load").addEventListener("click", loadProfiles);
$("retry-history").addEventListener("click", () => {historyPromise = null;loadHistory();});
for (const id of ["job-loss", "higher-bills", "emergency-repair", "bill-rate", "repair-cost"]) $(id).addEventListener("input", updateComparison);
$("ei-rate").addEventListener("input", event => {$("ei-rate-number").value = $("ei-rate").value;updateComparison(event);});
$("ei-rate-number").addEventListener("input", event => {
  const input = $("ei-rate-number");
  if (input.value.trim() && input.checkValidity() && Number.isFinite(Number(input.value))) $("ei-rate").value = input.value;
  updateComparison(event);
});
for (const [id, count] of [["history-six", 6], ["history-twelve", 12]]) $(id).addEventListener("click", () => {historyWindow = count;renderHistory();});
loadProfiles();

// Observe the visible panel, not the plot that is hidden temporarily during account changes.
let lastChartWidth = 0;
new ResizeObserver(entries => {
  const width = Math.round(entries[0].contentRect.width);
  if (!width || width === lastChartWidth) return;
  lastChartWidth = width;
  if (selectedHistory) renderHistory();
}).observe(document.querySelector(".cashflow-panel"));
