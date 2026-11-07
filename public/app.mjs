import {decodeProfiles, simulate} from "./engine.mjs";

const $ = id => document.getElementById(id);
const amount = new Intl.NumberFormat("en-CA", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const money = value => value === null ? "Unavailable" : amount.format(value);
let profiles = new Map();
let selected = null;
let loadGeneration = 0;

function message(element, text) {
  element.textContent = text;
  element.hidden = !text;
}

function clearSelection() {
  selected = null;
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
  setControls();
  updateComparison();
}

function numberInput(id, label) {
  const input = $(id);
  if (!input.value.trim() || !input.checkValidity()) throw new Error(`Enter a valid, non-negative number for ${label}.`);
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Enter a valid, non-negative number for ${label}.`);
  return value;
}

function updateComparison() {
  if (!selected) return;
  setControls();
  try {
    const before = simulate(selected);
    const after = simulate(selected, {
      job_loss: $("job-loss").checked,
      ei_rate: $("job-loss").checked ? numberInput("ei-rate", "EI replacement rate") / 100 : .55,
      higher_bills: $("higher-bills").checked,
      bill_increase_rate: $("higher-bills").checked ? numberInput("bill-rate", "bill increase") / 100 : .15,
      emergency_repair: $("emergency-repair").checked,
      repair_cost: $("emergency-repair").checked ? numberInput("repair-cost", "repair cost") : 0,
    });
    const rows = [
      ["Monthly income", money(before.income), money(after.income)],
      ["Monthly spending (includes loan payments)", money(before.spending), money(after.spending)],
      ["One-off costs", money(before.one_off_costs), money(after.one_off_costs)],
      ["Remaining buffer", money(before.buffer_left), money(after.buffer_left)],
      ["Monthly shortfall", money(before.monthly_shortfall), money(after.monthly_shortfall)],
      ["Financial runway", before.runway_label, after.runway_label],
    ];
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const tr = document.createElement("tr");
      row.forEach((text, index) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        cell.textContent = text;
        tr.append(cell);
      });
      fragment.append(tr);
    }
    $("comparison-body").replaceChildren(fragment);
    $("baseline-runway").textContent = before.runway_label;
    $("after-runway").textContent = after.runway_label;
    const explanation = $("result-explanation");
    explanation.className = "notice";
    if (after.buffer_left <= 0) {
      explanation.classList.add("warning");
      explanation.textContent = "Your buffer is depleted or negative. Under the official rules, runway is 0 months, even if current income covers monthly spending.";
    } else if (after.no_shortfall) {
      explanation.textContent = "No shortfall (120+): income covers monthly spending under the current assumptions. This judging label does not guarantee financial security for the next 120 months.";
    } else {
      explanation.textContent = `The monthly shortfall is ${money(after.monthly_shortfall)}, with ${money(after.buffer_left)} remaining in the buffer. ${after.capped ? "Runway is capped at 120 months under the official rules." : "Dividing the buffer by the shortfall gives the simplified runway shown above."}`;
    }
    message($("scenario-error"), "");
    $("comparison-body").closest("section").hidden = false;
  } catch (error) {
    message($("scenario-error"), error.message);
    $("comparison-body").closest("section").hidden = true;
    $("baseline-runway").textContent = "Unavailable";
    // Keep the valid baseline visible if only a shock parameter is invalid.
    try { $("baseline-runway").textContent = simulate(selected).runway_label; } catch { /* unavailable data explained above */ }
  }
}

function chooseAccount(accountId) {
  const profile = profiles.get(accountId.trim());
  if (!profile) {
    clearSelection();
    message($("lookup-error"), "Account not found. Choose an ID from the official account list, or select a random account.");
    return;
  }
  selected = profile;
  $("account-id").value = profile.account_id;
  message($("lookup-error"), "");
  $("dashboard").hidden = false;
  $("empty-state").hidden = true;
  $("account-history").textContent = `Account ${profile.account_id} · ${profile.months} months\n${profile.first_month} to ${profile.last_month} · Buffer: ${profile.buffer_valid_rows}/${profile.buffer_rows} valid rows`;
  const definitions = [
    ["I · Typical monthly income", "income", "Median monthly money coming in."],
    ["S · Typical monthly spending", "spending", "Median monthly money going out, including loan payments."],
    ["F · Typical fixed costs", "fixed_costs", "Median of each month's combined bills, insurance and loan payments."],
    ["B · Savings buffer", "buffer", "Average of the last six monthly average balances. May be negative."],
    ["H · Household bills", "household_bills", "Median monthly household bills."],
    ["P · Loan payment", "loan_payment", "Payments for loans running at year-end 2025. Already included in spending."],
  ];
  const cards = document.createDocumentFragment();
  for (const [label, key, definition] of definitions) {
    const card = document.createElement("article");
    card.className = "metric";
    const title = document.createElement("p");
    title.className = "metric-label";
    title.textContent = label;
    const value = document.createElement("strong");
    value.textContent = money(profile[key]);
    value.dataset.metric = key;
    const help = document.createElement("p");
    help.className = "definition";
    help.textContent = definition;
    card.append(title, value, help);
    cards.append(card);
  }
  $("metrics").replaceChildren(cards);
  const warnings = document.createDocumentFragment();
  for (const warning of profile.warnings) {
    const notice = document.createElement("p");
    notice.className = "notice warning";
    notice.textContent = warning;
    warnings.append(notice);
  }
  $("data-warnings").replaceChildren(warnings);
  $("higher-bills").disabled = !Number.isFinite(profile.household_bills);
  resetScenario();
}

async function loadProfiles() {
  const generation = ++loadGeneration;
  clearSelection();
  $("load-error").hidden = true;
  $("load-error-text").textContent = "";
  $("retry-load").onclick = loadProfiles;
  $("data-status").textContent = "Loading official account profiles…";
  for (const id of ["account-id", "lookup-button", "random-account"]) $(id).disabled = true;
  try {
    const response = await fetch(new URL("./data/profiles.json", import.meta.url), {cache: "no-cache"});
    if (!response.ok) throw new Error(`Account data could not be loaded (HTTP ${response.status}).`);
    const payload = await response.json();
    const loaded = decodeProfiles(payload);
    if (generation !== loadGeneration) return;
    profiles = loaded;
    const options = document.createDocumentFragment();
    for (const id of profiles.keys()) {
      const option = document.createElement("option");
      option.value = id;
      options.append(option);
    }
    $("account-options").replaceChildren(options);
    for (const id of ["account-id", "lookup-button", "random-account"]) $(id).disabled = false;
    $("account-id").placeholder = "Enter an account ID or search the list";
    $("data-status").textContent = `${profiles.size.toLocaleString("en-CA")} official accounts · Ready`;
    $("dataset-detail").textContent = `${payload.dataset.monthly_rows.toLocaleString("en-CA")} monthly records and ${payload.dataset.loan_rows.toLocaleString("en-CA")} loan records, covering ${payload.dataset.first_month} to ${payload.dataset.last_month}. All ${profiles.size.toLocaleString("en-CA")} accounts are loaded.`;
  } catch (error) {
    if (generation !== loadGeneration) return;
    profiles = new Map();
    $("account-options").replaceChildren();
    for (const id of ["account-id", "lookup-button", "random-account"]) $(id).disabled = true;
    $("data-status").textContent = "Account data unavailable";
    $("load-error").hidden = false;
    $("load-error-text").textContent = `${error.message} Check your connection and try again. Sample accounts are never used to replace missing data.`;
  }
}

$("lookup-form").addEventListener("submit", event => {event.preventDefault(); chooseAccount($("account-id").value);});
$("random-account").addEventListener("click", () => {
  const ids = [...profiles.keys()];
  if (ids.length) chooseAccount(ids[Math.floor(Math.random() * ids.length)]);
});
$("reset-scenario").addEventListener("click", resetScenario);
for (const id of ["job-loss", "higher-bills", "emergency-repair", "ei-rate", "bill-rate", "repair-cost"]) $(id).addEventListener("input", updateComparison);
loadProfiles();
