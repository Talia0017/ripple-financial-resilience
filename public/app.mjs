import {decodeProfiles, simulate} from "./engine.mjs";
import {money, monthName, decodeHistory, monthlyInsights, runwayHeading, runwayExplanation, scenarioNarrative, savingsPlan, backupPlan, datasetStory} from "./dashboard.mjs";
import {renderMonthlyChart, renderComparisonChart, renderStoryChart} from "./charts.mjs";

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

function message(item, text) {item.textContent = text; item.hidden = !text;}
function clearSelection() {
  selected = null;
  selectedHistory = null;
  historyGeneration++;
  $("dashboard").hidden = true;
  $("empty-state").hidden = false;
}
function setControls() {
  $("ei-rate").disabled = !$("job-loss").checked;
  $("bill-rate").disabled = !$("higher-bills").checked;
  $("repair-cost").disabled = !$("emergency-repair").checked;
  $("ei-output").textContent = `${$("ei-rate").value}%`;
}
function resetScenario() {
  for (const id of ["job-loss", "higher-bills", "emergency-repair"]) $(id).checked = false;
  $("ei-rate").value = "55";
  $("bill-rate").value = "15";
  $("repair-cost").value = String(Math.max(selected?.spending ?? 0, 0));
  updateComparison();
}
function numberInput(id, label) {
  const input = $(id);
  if (!input.value.trim() || !input.checkValidity() || !Number.isFinite(Number(input.value)) || Number(input.value) < 0) throw new Error(`Enter a valid, non-negative number for ${label}.`);
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
  const host = $("savings-plan");
  host.replaceChildren();
  if (!plan) host.append(element("p", "A positive spending estimate and valid scenario data are needed to calculate a meaningful savings goal.", "notice"));
  else {
    const goal = element("p", money(plan.goal), "goal-number");
    goal.append(element("small", "Three months of typical baseline spending"));
    const progress = element("progress", `${(plan.progress * 100).toFixed(1)}%` , "goal-progress");
    progress.max = plan.goal; progress.value = Math.min(plan.available, plan.goal);
    progress.setAttribute("aria-label", "Estimated remaining scenario buffer toward the three-month spending goal");
    const figures = element("dl", undefined, "plan-figures");
    for (const [label, value] of [["Buffer toward goal · current scenario", money(plan.available)], ["Remaining target", money(plan.remaining)], ["Potential monthly contribution", money(plan.contribution)], ["Estimated time to goal", plan.months === null ? "Not estimable" : plan.months === 0 ? "Target met" : `${plan.months.toLocaleString("en-CA")} months`]]) {
      const group = element("div");group.append(element("dt", label), element("dd", value));figures.append(group);
    }
    const note = plan.remaining === 0 ? "The estimated buffer meets this example target. A balance estimate is not proof of accessible savings."
      : plan.contribution > 0 ? `Illustration: set aside half of the current scenario's ${money(plan.surplus)} estimated monthly surplus, limited to the remaining target. Timing assumes unchanged cash flow, no interest and no further shocks.`
      : "No positive monthly surplus is available under this scenario. No contribution or completion date is suggested. Review the gap before planning a contribution.";
    host.append(goal, progress, figures, element("p", note, "fineprint"));
    if (after.buffer_left < 0) host.append(element("p", "A negative balance contributes zero toward this goal; the below-zero amount remains a separate issue to address.", "fineprint"));
  }
  $("backup-plan").replaceChildren(...(after ? backupPlan(after, active) : ["Scenario data is unavailable. Resolve missing account values or invalid assumptions before using a backup plan."]).map(text => element("li", text)));
}
function updateComparison() {
  if (!selected) return;
  setControls();
  try {
    const before = simulate(selected);
    const options = {
      job_loss: $("job-loss").checked,
      ei_rate: $("job-loss").checked ? numberInput("ei-rate", "EI replacement rate") / 100 : .55,
      higher_bills: $("higher-bills").checked,
      bill_increase_rate: $("higher-bills").checked ? numberInput("bill-rate", "bill increase") / 100 : .15,
      emergency_repair: $("emergency-repair").checked,
      repair_cost: $("emergency-repair").checked ? numberInput("repair-cost", "repair cost") : 0,
    };
    const after = simulate(selected, options);
    const count = [options.job_loss, options.higher_bills, options.emergency_repair].filter(Boolean).length;
    $("scenario-state").textContent = count ? `${count} hypothetical ${count === 1 ? "shock" : "shocks"} selected` : "No shocks selected";
    renderComparisonChart($("comparison-chart"), before, after, $("comparison-tooltip"));
    fillTable("comparison-body", [
      ["Monthly money in", money(before.income), money(after.income)],
      ["Monthly spending · includes loan payments", money(before.spending), money(after.spending)],
      ["One-time costs", money(before.one_off_costs), money(after.one_off_costs)],
      ["Remaining buffer", money(before.buffer_left), money(after.buffer_left)],
      ["Monthly shortfall", money(before.monthly_shortfall), money(after.monthly_shortfall)],
      ["Official financial runway", before.runway_label, after.runway_label],
    ]);
    $("after-runway").textContent = runwayHeading(after);
    $("runway-explanation").textContent = runwayExplanation(after);
    $("result-explanation").textContent = scenarioNarrative(before, after, count > 0);
    message($("scenario-error"), "");
    $("comparison").hidden = false;
    renderPlans(after, count > 0);
  } catch (error) {
    message($("scenario-error"), error.message);
    $("comparison").hidden = true;
    renderPlans(null, false);
  }
}
function renderHistory() {
  if (!selectedHistory) return;
  const rows = selectedHistory.slice(-historyWindow);
  $("history-six").setAttribute("aria-pressed", String(historyWindow === 6));
  $("history-twelve").setAttribute("aria-pressed", String(historyWindow === 12));
  $("history-status").textContent = `${rows.length} recorded ${rows.length === 1 ? "month" : "months"} · ${monthName(rows[0][0])} – ${monthName(rows.at(-1)[0])}`;
  renderMonthlyChart($("monthly-chart"), rows, $("monthly-tooltip"));
  $("monthly-insights").replaceChildren(...monthlyInsights(rows).map(text => element("p", text)));
  fillTable("monthly-table", rows.map(([month, incoming, outgoing]) => [monthName(month), money(incoming), money(outgoing)]));
  $("history-note").textContent = `Showing the most recent ${rows.length} available records, up to ${historyWindow}. Accounts may have fewer records or gaps between months. Monthly values come directly from the official source, not from the summary medians.`;
  $("history-content").hidden = false;
}
async function loadHistory() {
  if (!selected) return;
  const generation = ++historyGeneration;
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
    card.append(element("p", label, "metric-label"), value, element("p", help, "definition"));return card;
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
  resetScenario();loadHistory();
  $("overview-title").tabIndex = -1;$("overview-title").focus({preventScroll: true});
}
function renderDiscovery() {
  const story = datasetStory(profiles);
  if (!story) {$("story-insight").textContent = "There is insufficient valid data to establish the near-median inflow comparison.";$("story-chart").replaceChildren();return;}
  $("story-insight").textContent = `Among ${story.sample} accounts with typical monthly money in within 5% of the dataset median, ${story.groups[1].count} had typical spending above money in. Similar inflows do not describe the whole financial position.`;
  renderStoryChart($("story-chart"), story);
  $("story-method").textContent = `We used ${story.valid.toLocaleString("en-CA")} accounts with valid money-in and spending summaries out of ${story.total.toLocaleString("en-CA")}. The median money in is ${money(story.median)}. The inclusive band is 95%–105% of that median (approximately ${money(story.lower)}–${money(story.upper)}), giving ${story.sample} accounts. We compared each account's unrounded all-history median spending with its unrounded all-history median money in. Percentages use this ${story.sample}-account band as the denominator.`;
  $("story-buffers").textContent = story.groups.map(group => `${group.label}: median estimated buffer ${money(group.medianBuffer)} (${group.bufferCount} valid buffer estimates among ${group.count} accounts)`).join(". ") + ". These are historical balance estimates, not accessible savings.";
}
async function loadProfiles() {
  const generation = ++loadGeneration;
  clearSelection();historyPromise = null;
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
    renderDiscovery();
  } catch (error) {
    if (generation !== loadGeneration) return;
    profiles = new Map();$("account-options").replaceChildren();
    $("data-status").textContent = "Account data unavailable";
    $("load-error").hidden = false;
    $("load-error-text").textContent = `${error.message} Check your connection and try again. Missing data is never replaced with sample accounts.`;
  }
}
$("lookup-form").addEventListener("submit", event => {event.preventDefault();chooseAccount($("account-id").value);});
$("random-account").addEventListener("click", () => {const ids = [...profiles.keys()];if (ids.length) chooseAccount(ids[Math.floor(Math.random() * ids.length)]);});
$("reset-scenario").addEventListener("click", resetScenario);
$("retry-load").addEventListener("click", loadProfiles);
$("retry-history").addEventListener("click", () => {historyPromise = null;loadHistory();});
for (const id of ["job-loss", "higher-bills", "emergency-repair", "ei-rate", "bill-rate", "repair-cost"]) $(id).addEventListener("input", updateComparison);
for (const [id, count] of [["history-six", 6], ["history-twelve", 12]]) $(id).addEventListener("click", () => {historyWindow = count;renderHistory();});
loadProfiles();
