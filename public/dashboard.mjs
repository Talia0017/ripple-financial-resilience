// Presentation and planning rules are separate from the official financial engine.
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
