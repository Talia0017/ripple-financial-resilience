import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {decodeProfiles, simulate} from "../../public/engine.mjs";
import {money, decodeHistory, monthlyInsights, monthlySummary, runwayHeading, runwayExplanation, scenarioNarrative, scenarioSummary, savingsPlan, backupPlan, datasetStory} from "../../public/dashboard.mjs";

// Synthetic edge cases stay separate from the official public assets.
const profile = {income: 3000, spending: 2500, buffer: 5000, household_bills: 500};

test("history annotations use observed pairs, retain missing values and disclose peak ties", () => {
  const notes = monthlyInsights([["2025-01", 100, 200], ["2025-03", null, 200], ["2025-04", 300, 150]]);
  assert.match(notes[0], /1 of 2 recorded months/);
  assert.match(notes[1], /\$200\.00 in Jan 2025 \(tied across 2 months\)/);
  assert.match(monthlyInsights([["2025-01", null, null]])[0], /not been replaced with zero/);
  assert.equal(money(null), "Unavailable");
  assert.equal(money(-200), "-$200.00");
  assert.equal(monthlySummary([["2025-01", 100, 200], ["2025-02", null, 200]]), "1 of 1 recorded month had more money out than in. Incomplete months excluded.");
  assert.equal(monthlySummary([["2025-01", null, null]]), "No complete monthly cash-flow pairs are available.");
});
test("runway language separates no shortfall, depleted buffers and the judging cap", () => {
  const baseline = simulate(profile);
  assert.equal(runwayHeading(baseline), "No monthly shortfall");
  assert.match(runwayExplanation(baseline), /not a guarantee/);
  const empty = simulate({...profile, buffer: -50});
  assert.equal(runwayHeading(empty), "0.0 months");
  assert.match(runwayExplanation(empty), /even when monthly money in covers spending/);
  assert.match(runwayExplanation(simulate({...profile, income: 2499})), /capped at 120/);
});
test("combined scenario annotations reflect the unchanged official engine exactly", () => {
  const before = simulate(profile);
  const after = simulate(profile, {job_loss: true, higher_bills: true, emergency_repair: true, repair_cost: 1000});
  const text = scenarioNarrative(before, after, true);
  for (const expected of ["$1,350.00", "$75.00", "$1,000.00", "$925.00"]) assert.ok(text.includes(expected), expected);
  assert.match(runwayExplanation(after), /4\.3 months/);
  assert.match(scenarioNarrative(before, before, false), /No shocks selected/);
  assert.match(scenarioNarrative(before, before, true), /amounts unchanged/);
});
test("compact scenario summaries retain monthly changes, one-time costs and depleted-buffer rules", () => {
  const before = simulate(profile);
  const after = simulate(profile, {job_loss: true, higher_bills: true, emergency_repair: true, repair_cost: 6000});
  const summary = scenarioSummary(before, after, true);
  for (const expected of ["Money in −$1,350.00/month", "Spending +$75.00/month", "Repair $6,000.00 once", "Shortfall $925.00/month", "zero-runway rule"]) assert.ok(summary.includes(expected), expected);
  assert.match(scenarioSummary(before, before, false), /historical baseline/);
  assert.match(scenarioSummary(before, before, true), /unchanged/);
});
test("savings contribution never exceeds surplus or the remaining goal", () => {
  const plan = savingsPlan(profile, simulate(profile));
  assert.equal(plan.goal, 7500);assert.equal(plan.remaining, 2500);
  assert.equal(plan.contribution, 250);assert.equal(plan.months, 10);
  const almost = savingsPlan({...profile, buffer: 7490}, simulate({...profile, buffer: 7490}));
  assert.equal(almost.contribution, 10);assert.equal(almost.months, 1);
  for (const ei_rate of [0, .55, .9, 1]) {
    const scenario = simulate(profile, {job_loss: true, ei_rate});
    const result = savingsPlan(profile, scenario);
    assert.ok(result.contribution <= Math.max(scenario.income - scenario.spending, 0));
  }
});
test("savings plans handle a met target, missing data, zero spending and negative buffers", () => {
  const met = savingsPlan(profile, simulate({...profile, buffer: 10000}));
  assert.equal(met.progress, 1);assert.equal(met.remaining, 0);assert.equal(met.months, 0);assert.equal(met.contribution, 0);
  const depleted = savingsPlan(profile, simulate(profile, {job_loss: true, emergency_repair: true, repair_cost: 6000}));
  assert.equal(depleted.available, 0);assert.equal(depleted.remaining, 7500);assert.equal(depleted.contribution, 0);assert.equal(depleted.months, null);
  for (const spending of [0, -1, null, Number.MAX_VALUE]) assert.equal(savingsPlan({...profile, spending}, simulate(profile)), null);
  assert.equal(savingsPlan(profile, null), null);
});
test("backup steps distinguish recurring gaps and one-off costs without invented affordability", () => {
  const notes = backupPlan(simulate(profile, {job_loss: true, emergency_repair: true, repair_cost: 6000}), true).join(" ");
  for (const expected of ["below zero by $1,000.00", "$850.00", "$6,000.00 once", "not added to recurring"]) assert.ok(notes.includes(expected), expected);
  assert.match(backupPlan(simulate(profile), false).join(" "), /\$500\.00 surplus/);
  assert.match(backupPlan(simulate({...profile, income: 2500, buffer: 0}), true).join(" "), /covers spending exactly/);
});
test("all official histories load and invalid, missing, duplicate or mismatched rows fail closed", async () => {
  const payload = JSON.parse(await readFile(new URL("../../public/data/profiles.json", import.meta.url)));
  const original = JSON.parse(await readFile(new URL("../../public/data/history.json", import.meta.url)));
  const profiles = decodeProfiles(payload), hashes = payload.dataset.source_sha256;
  const history = decodeHistory(original, profiles, hashes);
  assert.equal(history.size, 4500);
  assert.equal([...history.values()].reduce((total, rows) => total + rows.length, 0), 54000);
  const id = profiles.keys().next().value;
  const mutations = [
    data => delete data.accounts[id], data => data.accounts[id].pop(),
    data => data.accounts[id][0][1] = "invented", data => data.accounts[id][0][0] = "2025-13",
    data => data.accounts[id][1][0] = data.accounts[id][0][0], data => data.dataset.currency = "USD",
    data => data.dataset.source_sha256["monthly_summary.csv"] = "changed",
    data => data.dataset.exported_rows -= 1,
  ];
  for (const change of mutations) {const data = structuredClone(original);change(data);assert.throws(() => decodeHistory(data, profiles, hashes));}
  let seed = 20261107;const ids = [...profiles.keys()];
  for (let i = 0; i < 50; i++) {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;const rows = history.get(ids[seed % ids.length]);assert.equal(monthlyInsights(rows.slice(-6)).length, 2);}
});
test("dataset story matches an independently checked 166-account cohort and reports its denominator", async () => {
  const payload = JSON.parse(await readFile(new URL("../../public/data/profiles.json", import.meta.url)));
  const story = datasetStory(decodeProfiles(payload));
  assert.equal(story.total, 4500);assert.equal(story.valid, 4500);assert.equal(story.median, 7568.2625);
  assert.equal(story.sample, 166);assert.deepEqual(story.groups.map(group => group.count), [116, 50]);
  assert.equal(story.groups[1].share, 50 / 166);
  assert.equal(story.groups[0].medianBuffer, 30434.58583333333);
  assert.equal(story.groups[1].medianBuffer, 17689.631666666668);
  assert.equal(datasetStory(new Map()), null);
});
