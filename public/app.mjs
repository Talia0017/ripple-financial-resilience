import {decodeProfiles, simulate} from "./engine.mjs";

const $ = id => document.getElementById(id);
const amount = new Intl.NumberFormat("en-CA", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const money = value => value === null ? "无法计算" : amount.format(value);
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
  if (!input.value.trim() || !input.checkValidity()) throw new Error(`请为${label}输入有效的非负数字。`);
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0) throw new Error(`请为${label}输入有效的非负数字。`);
  return value;
}

function updateComparison() {
  if (!selected) return;
  setControls();
  try {
    const before = simulate(selected);
    const after = simulate(selected, {
      job_loss: $("job-loss").checked,
      ei_rate: $("job-loss").checked ? numberInput("ei-rate", "EI 替代率") / 100 : .55,
      higher_bills: $("higher-bills").checked,
      bill_increase_rate: $("higher-bills").checked ? numberInput("bill-rate", "账单涨幅") / 100 : .15,
      emergency_repair: $("emergency-repair").checked,
      repair_cost: $("emergency-repair").checked ? numberInput("repair-cost", "维修费用") : 0,
    });
    const rows = [
      ["月收入 · Income", money(before.income), money(after.income)],
      ["月支出 · Spending（已含贷款付款）", money(before.spending), money(after.spending)],
      ["一次性费用 · One-off costs", money(before.one_off_costs), money(after.one_off_costs)],
      ["剩余缓冲金 · Buffer left", money(before.buffer_left), money(after.buffer_left)],
      ["每月资金缺口 · Monthly shortfall", money(before.monthly_shortfall), money(after.monthly_shortfall)],
      ["财务续航 · Runway", before.runway_label, after.runway_label],
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
      explanation.textContent = "缓冲金已耗尽或为负。按官方规则，财务续航为 0 个月，即使当前收入足以支付月度开支。";
    } else if (after.no_shortfall) {
      explanation.textContent = "No shortfall (120+)：在当前固定参数下，收入足以覆盖每月支出。这是官方比赛标签，不表示未来 120 个月都有保障。";
    } else {
      explanation.textContent = `当前每月资金缺口为 ${money(after.monthly_shortfall)}，剩余缓冲金为 ${money(after.buffer_left)}。${after.capped ? "续航结果已按官方规则限制在 120 个月。" : "以固定参数相除，得到上方的简化续航月数。"}`;
    }
    message($("scenario-error"), "");
    $("comparison-body").closest("section").hidden = false;
  } catch (error) {
    message($("scenario-error"), error.message);
    $("comparison-body").closest("section").hidden = true;
    $("baseline-runway").textContent = "无法计算";
    // Keep the valid baseline visible if only a shock parameter is invalid.
    try { $("baseline-runway").textContent = simulate(selected).runway_label; } catch { /* unavailable data explained above */ }
  }
}

function chooseAccount(accountId) {
  const profile = profiles.get(accountId.trim());
  if (!profile) {
    clearSelection();
    message($("lookup-error"), "找不到这个账户 ID。请从可搜索的官方账户列表中选择，或点击随机选择。");
    return;
  }
  selected = profile;
  $("account-id").value = profile.account_id;
  message($("lookup-error"), "");
  $("dashboard").hidden = false;
  $("empty-state").hidden = true;
  $("account-history").textContent = `账户 ${profile.account_id} · ${profile.months} 个月\n${profile.first_month} 至 ${profile.last_month} · 缓冲金 ${profile.buffer_valid_rows}/${profile.buffer_rows} 行有效`;
  const definitions = [
    ["I · 典型月收入", "income", "全部已有月份 money_in 的中位数。"],
    ["S · 典型月支出", "spending", "money_out 的中位数，已包含贷款付款。"],
    ["F · 典型固定开支", "fixed_costs", "先逐月相加家庭账单、保险与贷款付款，再取中位数。"],
    ["B · 储蓄缓冲金", "buffer", "最后六行平均日余额的平均值，可能为负。"],
    ["H · 家庭账单", "household_bills", "household_bills 的中位数。"],
    ["P · 贷款月供", "loan_payment", "2025 年底 C/D 状态贷款月供，不额外加入 S。"],
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
  $("data-status").textContent = "正在加载官方账户资料…";
  for (const id of ["account-id", "lookup-button", "random-account"]) $(id).disabled = true;
  try {
    const response = await fetch(new URL("./data/profiles.json", import.meta.url), {cache: "no-cache"});
    if (!response.ok) throw new Error(`账户资料请求失败（HTTP ${response.status}）。`);
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
    $("account-id").placeholder = "输入账户 ID，或展开列表搜索";
    $("data-status").textContent = `${profiles.size.toLocaleString("en-CA")} 个官方账户 · 已就绪`;
    $("dataset-detail").textContent = `${payload.dataset.monthly_rows.toLocaleString("en-CA")} 条月度记录、${payload.dataset.loan_rows.toLocaleString("en-CA")} 条贷款记录；覆盖 ${payload.dataset.first_month} 至 ${payload.dataset.last_month}。已加载全部 ${profiles.size.toLocaleString("en-CA")} 个账户。`;
  } catch (error) {
    if (generation !== loadGeneration) return;
    profiles = new Map();
    $("account-options").replaceChildren();
    for (const id of ["account-id", "lookup-button", "random-account"]) $(id).disabled = true;
    $("data-status").textContent = "账户资料未加载";
    $("load-error").hidden = false;
    $("load-error-text").textContent = `${error.message} 请检查网络后重新加载；网站不会用演示账户替代缺失数据。`;
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
