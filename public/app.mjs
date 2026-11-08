import {decodeProfiles, simulate} from "./engine.mjs";
import {money, monthName, decodeHistory, monthlyInsights, monthlyDiscovery, bufferEquivalent, runwayHeading, runwayExplanation, scenarioInsight, comparisonMetrics, savingsPlan, backupPlan} from "./dashboard.mjs";
import {renderMonthlyChart, renderComparisonChart} from "./charts.mjs";

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
const narrowWorkspace = matchMedia("(max-width: 1100px)");

function message(item, text) {item.textContent = text; item.hidden = !text;}
const amountForCopy = value => value > 0 && value < .005 ? "less than $0.01" : money(value);
function clearScenarioOutput() {
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
  if (!after) {title = "Next step unavailable";text = "Check the account data or scenario inputs.";}
  else if (after.buffer_left <= 0) {
    title = after.buffer_left < 0 ? `${amountForCopy(-after.buffer_left)} below zero` : "Restore the estimated buffer";
    text = "Review options to restore the estimated buffer.";
  } else if (after.monthly_shortfall > 0) {
    title = `Review a monthly gap of ${amountForCopy(after.monthly_shortfall)}`;
    text = "";
  } else if (plan?.remaining === 0) {
    title = "Example savings target met";
    text = `Three-month spending target: ${amountForCopy(plan.goal)}.`;
  } else if (plan) {
    title = `${amountForCopy(plan.remaining)} to the example savings goal`;
    text = plan.contribution > 0 ? `Example contribution: ${amountForCopy(plan.contribution)}/month.` : "No positive monthly surplus is available for a contribution.";
  } else {title = "Savings goal unavailable";text = "A positive spending estimate is needed.";}
  $("next-step-title").textContent = title;message($("next-step-text"), text);
  const host = $("goal-plan-content");
  host.replaceChildren();
  $("goal-progress").hidden = !plan;
  $("goal-progress").parentElement.hidden = !plan;
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
function scenarioAnnotation(before, after, insight) {
  if (!insight.affected.length) return "No financial amounts changed.";
  if (after.buffer_left <= 0) return `The estimated buffer is ${after.buffer_left < 0 ? "below zero" : "depleted"}, so modeled runway is zero.`;
  const limit = after.capped ? " The model caps runway at 120 months." : "";
  if (after.one_off_costs > 0) return `A one-time repair of ${amountForCopy(after.one_off_costs)} leaves an estimated ${amountForCopy(after.buffer_left)} buffer${after.monthly_shortfall > 0 ? ` against a monthly shortfall of ${amountForCopy(after.monthly_shortfall)}` : ""}.${limit}`;
  const changes = comparisonMetrics(before, after).filter(row => row.changed && ["income", "spending"].includes(row.key));
  const causes = changes.map((row, index) => `${row.key === "income" ? "Money in" : index ? "spending" : "Spending"} ${row.delta < 0 ? "falls" : "rises"} by ${amountForCopy(Math.abs(row.delta))}`);
  return `${causes.join(" and ")}${after.monthly_shortfall > 0 ? `, leaving a monthly shortfall of ${amountForCopy(after.monthly_shortfall)}` : ", with no monthly shortfall"}.${limit}`;
}
function updateComparison() {
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
    $("result-explanation").textContent = scenarioAnnotation(before, after, insight);
    message($("result-supporting"), insight.supporting);
    $("scenario-insight").dataset.affected = insight.affected.join(" ");
    $("scenario-contributors").replaceChildren(...insight.contributors.map(text => element("li", text)));
    message($("scenario-error"), "");
    $("comparison").hidden = false;
    $("scenario-breakdown").hidden = !$("comparison-chart").childElementCount;
    $("before-after-details").hidden = false;
    renderPlans(after, count > 0);
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
  $("history-status").textContent = `${rows.length < historyWindow ? `${rows.length} records · ` : ""}${monthName(rows[0][0])} – ${monthName(rows.at(-1)[0])}`;
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
    message($("lookup-error"), "Demo account not found. Choose an ID from the list or try Random.");
    return;
  }
  selected = profile; selectedHistory = null; historyWindow = 6;
  document.body.classList.add("has-account");
  $("account-id").value = profile.account_id;
  $("account-id").removeAttribute("aria-invalid");
  message($("lookup-error"), "");
  $("dashboard").hidden = false;
  $("selected-account").textContent = `Account ${profile.account_id}`;
  $("account-history").textContent = `${profile.months} recorded months · ${profile.first_month} – ${profile.last_month}`;
  const definitions = [
    ["Money In", "income", "Median monthly money in across all recorded months. Includes all incoming money, not just salary."],
    ["Spending", "spending", "Median monthly money out across all recorded months, including loan payments."],
    ["Estimated Buffer", "buffer", "Average recorded balance over the latest six monthly records, not verified cash you can access. The spending equivalent divides this estimate by typical monthly spending; it ignores money in and is not financial runway or total savings."],
  ];
  $("metrics").replaceChildren(...definitions.map(([label, key, help]) => {
    const card = element("article", undefined, "metric");
    const value = element("strong", money(profile[key]));value.dataset.metric = key;
    if (key === "income") value.replaceChildren(element("span", value.textContent, "lime-value"));
    const heading = element("div", undefined, "metric-heading");
    const info = element("details", undefined, "metric-info");
    const trigger = element("summary", "i");
    trigger.setAttribute("aria-label", `What does ${label} mean?`);
    info.append(trigger, element("p", help));
    heading.append(element("p", label, "metric-label"), info);
    card.append(heading, value);
    if (key === "buffer") {
      const equivalent = bufferEquivalent(profile);
      const context = element("p", undefined, "buffer-context");context.id = "buffer-context";
      context.append(element("strong", !equivalent ? "Spending equivalent unavailable" : equivalent.positive ? `${equivalent.ratio < .05 ? "< 0.1" : "≈ " + new Intl.NumberFormat("en-CA", {maximumFractionDigits: 1}).format(equivalent.ratio)} months of typical spending` : equivalent.label));
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
  revealAnchor();
}
async function loadProfiles() {
  const generation = ++loadGeneration;
  clearSelection();historyPromise = null;
  document.body.classList.add("is-loading");
  $("load-error").hidden = true;
  message($("data-status"), "Loading demo accounts…");
  for (const id of ["account-id", "lookup-button", "random-account"]) $(id).disabled = true;
  try {
    const response = await fetch(new URL("./data/profiles.json", import.meta.url), {cache: "no-cache"});
    if (!response.ok) throw new Error(`Account data could not be loaded (HTTP ${response.status}).`);
    const payload = await response.json(), loaded = decodeProfiles(payload);
    if (generation !== loadGeneration) return;
    profiles = loaded;sourceHashes = payload.dataset.source_sha256;
    $("account-options").replaceChildren(...[...profiles.keys()].map(id => {const option = element("option");option.value = id;return option;}));
    for (const id of ["account-id", "lookup-button", "random-account"]) $(id).disabled = false;
    $("account-id").placeholder = "Enter an ID";
    message($("data-status"), "");
    $("dataset-detail").textContent = `${payload.dataset.monthly_rows.toLocaleString("en-CA")} monthly records and ${payload.dataset.loan_rows.toLocaleString("en-CA")} loan records, covering ${payload.dataset.first_month} to ${payload.dataset.last_month}. All ${profiles.size.toLocaleString("en-CA")} accounts are supported. Amounts are displayed in CAD, following the challenge dataset units; no currency conversion is applied.`;
    document.body.classList.remove("is-loading");
  } catch (error) {
    if (generation !== loadGeneration) return;
    profiles = new Map();$("account-options").replaceChildren();
    document.body.classList.remove("is-loading");
    message($("data-status"), "");
    $("load-error").hidden = false;
    $("load-error-text").textContent = "Demo accounts couldn't load. Check your connection and try again.";
    $("dataset-detail").textContent = "Dataset details are unavailable until demo accounts load.";
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
function revealData() {
  $("about-data").open = true;
  $("about-data").querySelector("summary").focus({preventScroll: true});
  $("about-data").scrollIntoView({block: "nearest", behavior: "instant"});
}
function revealAnchor() {
  if (location.hash === "#about-data") revealData();
  else if (selected && ["#shock-title", "#plan-title"].includes(location.hash)) revealWorkspace(location.hash === "#plan-title");
}
window.addEventListener("hashchange", revealAnchor);
$("footer-data").addEventListener("click", event => {event.preventDefault();revealData();});
$("explore-change").addEventListener("click", () => revealWorkspace());
function syncSecondaryFocus() {for (const region of document.querySelectorAll(".secondary-scroll")) {if (narrowWorkspace.matches) region.removeAttribute("tabindex");else region.tabIndex = 0;}}
narrowWorkspace.addEventListener("change", () => {if (selected) $("scenario-workspace").open = !narrowWorkspace.matches;syncSecondaryFocus();});
syncSecondaryFocus();
$("retry-load").addEventListener("click", loadProfiles);
$("retry-history").addEventListener("click", () => {historyPromise = null;loadHistory();});
for (const id of ["job-loss", "higher-bills", "emergency-repair", "bill-rate", "repair-cost"]) $(id).addEventListener("input", updateComparison);
$("ei-rate").addEventListener("input", () => {$("ei-rate-number").value = $("ei-rate").value;updateComparison();});
$("ei-rate-number").addEventListener("input", () => {
  const input = $("ei-rate-number");
  if (input.value.trim() && input.checkValidity() && Number.isFinite(Number(input.value))) $("ei-rate").value = input.value;
  updateComparison();
});
for (const [id, count] of [["history-six", 6], ["history-twelve", 12]]) $(id).addEventListener("click", () => {historyWindow = count;renderHistory();});
loadProfiles();
revealAnchor();

// Observe the visible panel, not the plot that is hidden temporarily during account changes.
let lastChartWidth = 0;
new ResizeObserver(entries => {
  const width = Math.round(entries[0].contentRect.width);
  if (!width || width === lastChartWidth) return;
  lastChartWidth = width;
  if (selectedHistory) renderHistory();
}).observe(document.querySelector(".cashflow-panel"));
