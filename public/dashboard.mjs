// Presentation and planning rules are separate from the official financial engine.
import {simulate} from "./engine.mjs";
export const money = value => Number.isFinite(value)
  ? new Intl.NumberFormat("en-CA", {style: "currency", currency: "CAD"}).format(value) : "Unavailable";
export const monthName = month => new Intl.DateTimeFormat("en-CA", {month: "short", year: "numeric", timeZone: "UTC"}).format(new Date(`${month}-01T00:00:00Z`));

export function decodeHistory(payload, profiles, sourceHashes) {
  if (payload?.schema_version !== 1 || JSON.stringify(payload.columns) !== JSON.stringify(["month", "money_in", "money_out"]) || payload.dataset?.history_limit !== 12 || payload.dataset?.currency !== "CAD" || !payload.accounts || Array.isArray(payload.accounts)) throw new Error("Monthly history has an invalid format.");
  if (payload.dataset.account_count !== profiles.size || Object.keys(payload.accounts).length !== profiles.size) throw new Error("Monthly history is incomplete.");
  for (const name of ["monthly_summary.csv", "loans.csv"]) if (!sourceHashes?.[name] || payload.dataset.source_sha256?.[name] !== sourceHashes[name]) throw new Error("Monthly history and profiles use different source files.");
  let count = 0;
  const result = new Map();
  for (const [id, profile] of profiles) {
    const rows = payload.accounts[id];
    if (!Array.isArray(rows) || rows.length !== Math.min(profile.months, 12)) throw new Error("An account's monthly history is incomplete.");
    let previous = "";
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row[0]) || row[0] <= previous || row[0] < profile.first_month || row[0] > profile.last_month || !row.slice(1).every(value => value === null || Number.isFinite(value))) throw new Error("Monthly history contains an invalid record.");
      previous = row[0];
    }
    if (previous !== profile.last_month) throw new Error("Monthly history does not reach the account's last recorded month.");
    count += rows.length;
    result.set(id, rows);
  }
  if (count !== payload.dataset.exported_rows) throw new Error("Monthly history row count does not match its metadata.");
  return result;
}

export function monthlyInsights(rows) {
  if (!rows.length) return ["No recorded monthly cash flows are available."];
  const complete = rows.filter(row => row.slice(1).every(Number.isFinite));
  const notes = [];
  if (complete.length) {
    const count = complete.filter(row => row[2] > row[1]).length;
    notes.push(`Money out exceeded money in during ${count} of ${complete.length} recorded months with complete cash-flow data in this view.`);
  }
  const spending = rows.filter(row => Number.isFinite(row[2]));
  if (spending.length) {
    const peak = Math.max(...spending.map(row => row[2]));
    const peaks = spending.filter(row => row[2] === peak);
    notes.push(`Highest recorded spending in this view: ${money(peak)} in ${monthName(peaks[0][0])}${peaks.length > 1 ? ` (tied across ${peaks.length} months)` : ""}.`);
  }
  return notes.length ? notes : ["Cash-flow values are missing for the recorded months in this view; they have not been replaced with zero."];
}

export function monthlySummary(rows) {
  const complete = rows.filter(row => row.slice(1).every(Number.isFinite));
  if (!complete.length) return "No complete monthly cash-flow pairs are available.";
  const count = complete.filter(row => row[2] > row[1]).length;
  return `${count} of ${complete.length} recorded ${complete.length === 1 ? "month" : "months"} had more money out than in.${complete.length < rows.length ? " Incomplete months excluded." : ""}`;
}

export function monthlyDiscovery(profile, rows) {
  const complete = rows.filter(row => row.slice(1).every(Number.isFinite));
  const shortfalls = complete.filter(row => row[2] > row[1]).length;
  if (Number.isFinite(profile.income) && Number.isFinite(profile.spending) && profile.income > profile.spending && shortfalls) return `Typical money in is higher, yet ${shortfalls} of ${complete.length} recent months had more money out.${complete.length < rows.length ? " Incomplete months excluded." : ""}`;
  return monthlySummary(rows);
}

// Descriptive balance/spending ratio, separate from official runway and planning rules.
export function bufferEquivalent(profile) {
  if (![profile.buffer, profile.spending].every(Number.isFinite) || profile.spending <= 0) return null;
  const ratio = profile.buffer / profile.spending;
  if (!Number.isFinite(ratio)) return null;
  return {ratio, label: profile.buffer < 0 ? "Below zero" : profile.buffer === 0 ? "No positive buffer" : ratio < .05 ? "Less than 0.1 month" : `≈ ${new Intl.NumberFormat("en-CA", {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(ratio)} months`, positive: profile.buffer > 0};
}

export function discoveryEvidence(profiles, histories = null) {
  const buffers = datasetStory(profiles);
  const monthly = histories ? {eligible: 0, observed: 0, withShortfall: 0} : null;
  const counts = {depleted: 0, shortfall: 0, no_shortfall: 0};
  let unknown = 0;
  for (const profile of profiles.values()) {
    if (monthly && Number.isFinite(profile.income) && Number.isFinite(profile.spending) && profile.income > profile.spending) {
      monthly.eligible++;
      const complete = (histories.get(profile.account_id) ?? []).filter(row => row.slice(1).every(Number.isFinite));
      if (complete.length) {
        monthly.observed++;
        if (complete.some(row => row[2] > row[1])) monthly.withShortfall++;
      }
    }
    try {
      const result = simulate(profile, {job_loss: true, ei_rate: .55});
      counts[result.buffer_left <= 0 ? "depleted" : result.no_shortfall ? "no_shortfall" : "shortfall"]++;
    } catch { unknown++; }
  }
  return {monthly, buffers, shock: {count: profiles.size - unknown, unknown, groups: [
    {key: "depleted", label: "No positive buffer", count: counts.depleted},
    {key: "shortfall", label: "Buffer with a monthly gap", count: counts.shortfall},
    {key: "no_shortfall", label: "No monthly shortfall", count: counts.no_shortfall},
  ]}};
}

export function runwayHeading(result) {
  if (result.buffer_left <= 0) return "0.0 months";
  if (result.no_shortfall) return "No monthly shortfall";
  return result.runway_label;
}

export function runwayExplanation(result) {
  if (result.buffer_left <= 0) return `The estimated buffer is ${money(result.buffer_left)}. The official rule gives zero runway when the buffer is depleted or negative${result.gap <= 0 ? ", even when monthly money in covers spending" : ""}.`;
  if (result.no_shortfall) return "Money in covers typical monthly spending under these assumptions. The official label is “No shortfall (120+)”; it is not a guarantee of 120 months of financial security.";
  if (result.capped) return `The ${money(result.buffer_left)} buffer is divided by a ${money(result.monthly_shortfall)} monthly shortfall. The displayed result is capped at 120 months by the judging rule; it is not a forecast.`;
  return `An estimated ${money(result.buffer_left)} buffer could cover the ${money(result.monthly_shortfall)} monthly shortfall for approximately ${result.runway_label}. This simplified estimate is not a forecast.`;
}

export function scenarioNarrative(before, after, active) {
  if (!active) return "No shocks selected. The comparison matches this account's historical baseline. Choose one or combine several changes to explore a hypothetical scenario.";
  const parts = [];
  const reduction = before.income - after.income;
  const increase = after.spending - before.spending;
  if (reduction > 0) parts.push(`Monthly money in decreases by ${money(reduction)}.`);
  if (reduction < 0) parts.push(`Monthly money in increases by ${money(-reduction)} under the selected multiplier.`);
  if (increase > 0) parts.push(`Monthly spending increases by ${money(increase)}.`);
  if (increase < 0) parts.push(`Monthly spending decreases by ${money(-increase)} under the selected bill assumption.`);
  if (after.one_off_costs > 0) parts.push(`A one-time ${money(after.one_off_costs)} repair is deducted from the buffer.`);
  if (!parts.length) parts.push("The selected assumptions leave these financial amounts unchanged.");
  parts.push(after.monthly_shortfall > 0 ? `The resulting monthly shortfall is ${money(after.monthly_shortfall)}.` : "There is no monthly shortfall under these assumptions.");
  return parts.join(" ");
}

// A scan-friendly summary; the full explanation remains in the comparison disclosure.
export function scenarioSummary(before, after, active) {
  if (!active) return "No shocks selected. Showing the historical baseline.";
  const parts = [];
  const incoming = after.income - before.income, spending = after.spending - before.spending;
  if (incoming !== 0) parts.push(`Money in ${incoming < 0 ? "−" : "+"}${money(Math.abs(incoming))}/month`);
  if (spending !== 0) parts.push(`Spending ${spending < 0 ? "−" : "+"}${money(Math.abs(spending))}/month`);
  if (after.one_off_costs > 0) parts.push(`Repair ${money(after.one_off_costs)} once`);
  if (!parts.length) return "The selected assumptions leave the baseline unchanged.";
  parts.push(after.monthly_shortfall > 0 ? `Shortfall ${money(after.monthly_shortfall)}/month` : "No monthly shortfall");
  if (after.buffer_left <= 0) parts.push("Buffer depleted: zero-runway rule applies");
  return parts.join(" · ");
}

export function changeLabel(delta) {
  if (!Number.isFinite(delta)) throw new Error("A monetary change is unavailable.");
  if (delta === 0) return "$0.00";
  const amount = Math.abs(delta) < .005 ? "< $0.01" : money(Math.abs(delta));
  return `${delta < 0 ? "−" : "+"}${amount}`;
}

export function comparisonMetrics(before, after) {
  return [["income", "Monthly Money In"], ["spending", "Monthly Spending"], ["buffer_left", "Remaining Cash Buffer"], ["monthly_shortfall", "Monthly Shortfall"]].map(([key, label]) => {
    const start = before[key], end = after[key], delta = end - start;
    if (![start, end, delta].every(Number.isFinite)) throw new Error("A monetary comparison is unavailable. Missing values are not replaced with zero.");
    const minimum = Math.min(0, start, end), maximum = Math.max(0, start, end);
    return {key, label, before: start, after: end, delta, changed: delta !== 0,
      direction: delta < 0 ? "Decrease" : delta > 0 ? "Increase" : "No change",
      change: changeLabel(delta), domain: minimum === maximum ? [0, 1] : [minimum, maximum]};
  });
}

export function scenarioInsight(profile, before, after, options = {}) {
  options = {ei_rate: .55, bill_increase_rate: .15, ...options};
  const metrics = comparisonMetrics(before, after);
  const affected = metrics.filter(row => row.changed).map(row => row.key);
  const contributors = [], noEffect = [];
  const percent = value => value !== 0 && Math.abs(value) < .05 ? "less than 0.1" : new Intl.NumberFormat("en-CA", {maximumFractionDigits: 1}).format(value);
  const changeAmount = value => Math.abs(value) > 0 && Math.abs(value) < .005 ? "less than $0.01" : money(Math.abs(value));
  const incoming = metrics[0].delta, spending = metrics[1].delta, buffer = metrics[2].delta;
  if (options.job_loss) {
    const rate = percent(options.ei_rate * 100);
    if (incoming < 0 && before.income > 0) contributors.push(`At ${rate}% income replacement, monthly money in falls by ${percent(-incoming / before.income * 100)}%.`);
    else if (incoming !== 0) contributors.push(`At ${rate}% replacement, modeled monthly money in ${incoming < 0 ? "falls" : "rises"} by ${changeAmount(incoming)}.`);
    else {
      contributors.push(before.income === 0 ? "Recorded monthly money in is $0.00, so the replacement multiplier has no effect." : `${rate}% replacement leaves monthly money in unchanged.`);
      noEffect.push(before.income === 0 ? "recorded money in is $0.00" : `replacement is ${rate}%`);
    }
  }
  if (options.higher_bills) {
    const rate = percent(options.bill_increase_rate * 100);
    if (spending > 0) contributors.push(`A ${rate}% rise in recorded household bills adds ${changeAmount(spending)} to monthly spending.`);
    else if (spending < 0) contributors.push(`The ${rate}% bill multiplier reduces modeled spending by ${changeAmount(spending)} because the recorded bill estimate is negative.`);
    else {
      contributors.push(profile.household_bills === 0 ? `A ${rate}% bill increase has no modeled effect because recorded household bills are $0.00.` : `A ${rate}% bill increase leaves monthly spending unchanged.`);
      noEffect.push(profile.household_bills === 0 ? "recorded bills are $0.00" : `the bill increase is ${rate}%`);
    }
  }
  if (options.emergency_repair) {
    contributors.push(buffer === 0 ? "A $0.00 emergency cost leaves the estimated cash buffer unchanged." : `The one-time repair removes ${changeAmount(buffer)} from the estimated cash buffer.`);
    if (buffer === 0) noEffect.push("emergency cost is $0.00");
  }
  if (!contributors.length) return {primary: "Choose a financial change to explore its impact.", supporting: "", contributors, affected};
  let supporting = after.buffer_left <= 0 ? "The buffer is depleted or negative, so the official runway is 0 months."
    : after.monthly_shortfall > 0 ? `${spending === 0 ? "With spending unchanged, the" : "The"} estimated monthly shortfall is ${changeAmount(after.monthly_shortfall)}.`
    : "Monthly money in covers spending under these assumptions.";
  let primary;
  if (contributors.length === 1) {
    primary = contributors[0];
    if (options.higher_bills && profile.household_bills === 0) supporting = "Zero recorded bills do not establish that there are no living expenses.";
  } else if (!affected.length) {
    primary = "The combined assumptions leave all four monetary metrics unchanged.";
    supporting = noEffect.length ? noEffect.join("; ").replace(/^./, value => value.toUpperCase()) + "." : supporting;
  } else if (after.buffer_left <= 0 && buffer !== 0) primary = `Combined shocks leave the estimated cash buffer at ${money(after.buffer_left)}.`;
  else if (metrics[3].delta !== 0) primary = `Combined shocks ${metrics[3].delta > 0 ? "add" : "remove"} ${changeAmount(metrics[3].delta)} ${metrics[3].delta > 0 ? "to" : "from"} the estimated monthly shortfall.`;
  else if (buffer !== 0) primary = `Combined shocks reduce the estimated cash buffer by ${changeAmount(buffer)}.`;
  else if (incoming !== 0) primary = `Combined shocks ${incoming < 0 ? "reduce" : "increase"} monthly money in by ${changeAmount(incoming)}.`;
  else primary = `Combined shocks ${spending > 0 ? "increase" : "reduce"} monthly spending by ${changeAmount(spending)}.`;
  return {primary, supporting, contributors, affected};
}

export function savingsPlan(profile, scenario) {
  if (!Number.isFinite(profile.spending) || profile.spending <= 0 || !scenario || ![scenario.buffer_left, scenario.income, scenario.spending].every(Number.isFinite)) return null;
  const goal = profile.spending * 3;
  if (!Number.isFinite(goal)) return null;
  const available = Math.max(scenario.buffer_left, 0);
  const remaining = Math.max(goal - available, 0);
  const surplus = Math.max(scenario.income - scenario.spending, 0);
  const contribution = remaining === 0 ? 0 : Math.min(remaining, surplus * .5);
  return {goal, available, remaining, surplus, contribution, progress: Math.min(available / goal, 1), months: remaining === 0 ? 0 : contribution > 0 ? Math.ceil(remaining / contribution) : null};
}

export function backupPlan(after, active) {
  const steps = [];
  if (after.buffer_left < 0) steps.push(`The remaining balance estimate is below zero by ${money(-after.buffer_left)}. This model does not treat a negative balance as available cash.`);
  else if (after.buffer_left === 0) steps.push("The estimated buffer is depleted. No reserve is available in this model to cover a further shortfall.");
  if (after.monthly_shortfall > 0) steps.push(`To close this ${active ? "scenario's" : "baseline"} monthly gap, identify ${money(after.monthly_shortfall)} in combined lower spending or additional money in. The data does not establish which costs can be reduced.`);
  else steps.push(`Monthly money in covers spending${after.income > after.spending ? ` with an estimated ${money(after.income - after.spending)} surplus` : " exactly"}. Review this estimate before setting aside money.`);
  if (after.one_off_costs > 0) steps.push(`The repair uses ${money(after.one_off_costs)} once. Review how to restore that buffer; it is not added to recurring monthly spending.`);
  if (!active) steps.push("Try a job-loss, higher-bill or repair scenario to see how the backup steps change.");
  else steps.push("Check available support and which commitments can be adjusted. The dataset does not establish EI eligibility, borrowing capacity or benefit duration.");
  return steps;
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function datasetStory(profiles) {
  const valid = [...profiles.values()].filter(p => Number.isFinite(p.income) && Number.isFinite(p.spending));
  if (!valid.length) return null;
  const middle = median(valid.map(p => p.income));
  if (middle <= 0) return null;
  const lower = middle * .95, upper = middle * 1.05;
  const cohort = valid.filter(p => p.income >= lower && p.income <= upper);
  if (!cohort.length) return null;
  const groups = [false, true].map(shortfall => {
    const records = cohort.filter(p => (p.spending > p.income) === shortfall);
    const buffers = records.map(p => p.buffer).filter(Number.isFinite);
    return {label: shortfall ? "Spending exceeds money in" : "Money in covers spending", count: records.length, share: records.length / cohort.length, medianBuffer: buffers.length ? median(buffers) : null, bufferCount: buffers.length};
  });
  return {total: profiles.size, valid: valid.length, median: middle, lower, upper, sample: cohort.length, groups};
}
