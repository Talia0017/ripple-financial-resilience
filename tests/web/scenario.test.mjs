import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {simulate, decodeProfiles} from "../../public/engine.mjs";
import {changeLabel, comparisonMetrics, scenarioInsight} from "../../public/dashboard.mjs";

// Synthetic presentation fixtures never replace official website data.
const profile = {income: 3000, spending: 2500, buffer: 5000, household_bills: 500};
const inspect = (options = {}, person = profile) => {
  const before = simulate(person), after = simulate(person, options);
  return {before, after, rows: comparisonMetrics(before, after), insight: scenarioInsight(person, before, after, options)};
};

test("before/after deltas use the original engine and independent per-metric domains", () => {
  const {rows} = inspect({job_loss: true, higher_bills: true, emergency_repair: true, repair_cost: 1000});
  rows.forEach((row, index) => assert.ok(Math.abs(row.delta - [-1350, 75, -1000, 925][index]) < 1e-9));
  assert.deepEqual(rows.map(row => row.change), ["−$1,350.00", "+$75.00", "−$1,000.00", "+$925.00"]);
  assert.deepEqual(rows.slice(0, 3).map(row => row.domain), [[0, 3000], [0, 2575], [0, 5000]]);
  assert.ok(Math.abs(rows[3].domain[1] - 925) < 1e-9);
});
test("no-shock presentation is an invitation with no affected metrics", () => {
  const {rows, insight} = inspect();
  assert.ok(rows.every(row => !row.changed && row.change === "$0.00" && row.direction === "No change"));
  assert.equal(insight.primary, "Choose a financial change to explore its impact.");
  assert.equal(insight.supporting, "");assert.deepEqual(insight.affected, []);
});
test("job loss explains the selected replacement and matches changed rows", () => {
  const {insight} = inspect({job_loss: true});
  assert.match(insight.primary, /55% income replacement.*falls by 45%/);
  assert.match(insight.supporting, /spending unchanged.*\$850\.00/);
  assert.deepEqual(insight.affected, ["income", "monthly_shortfall"]);
  assert.match(inspect({job_loss: true, ei_rate: .8}).insight.primary, /80%.*20%/);
  assert.match(inspect({job_loss: true, ei_rate: 1}).insight.primary, /100%.*unchanged/);
  assert.match(inspect({job_loss: true, ei_rate: 0}).insight.primary, /falls by 100%/);
});
test("higher bills explain the recorded portion and the zero-effect cases", () => {
  assert.match(inspect({higher_bills: true}).insight.primary, /15%.*\$75\.00/);
  assert.match(inspect({higher_bills: true, bill_increase_rate: 0}).insight.primary, /0%.*unchanged/);
  const {rows, insight} = inspect({higher_bills: true}, {...profile, household_bills: 0});
  assert.ok(rows.every(row => !row.changed));
  assert.match(insight.primary, /no modeled effect.*\$0\.00/);
  assert.match(insight.supporting, /do not establish.*no living expenses/);
});
test("repair reduces only the buffer once and handles exhausted or negative balances", () => {
  const {rows, insight} = inspect({emergency_repair: true, repair_cost: 6000});
  assert.deepEqual(rows.filter(row => row.changed).map(row => row.key), ["buffer_left"]);
  assert.deepEqual(rows[2].domain, [-1000, 5000]);
  assert.equal(rows[2].after, -1000);
  assert.match(insight.primary, /one-time repair removes \$6,000\.00/);
  assert.match(insight.supporting, /runway is 0 months/);
  assert.match(inspect({emergency_repair: true, repair_cost: 0}).insight.primary, /unchanged/);
  assert.match(inspect({emergency_repair: true, repair_cost: 5000}).insight.supporting, /depleted/);
  const negative = inspect({emergency_repair: true, repair_cost: 20}, {...profile, buffer: -100});
  assert.deepEqual(negative.rows[2].domain, [-120, 0]);
  assert.equal(negative.rows[2].change, "−$20.00");
});
test("combined scenarios show one result and keep individual contributions on demand", () => {
  const {insight} = inspect({job_loss: true, higher_bills: true, emergency_repair: true, repair_cost: 1000});
  assert.match(insight.primary, /Combined shocks add \$925\.00/);
  assert.equal(insight.contributors.length, 3);
  const exhausted = inspect({job_loss: true, emergency_repair: true, repair_cost: 6000}).insight;
  assert.match(exhausted.primary, /cash buffer at -\$1,000\.00/);
  assert.match(exhausted.supporting, /runway is 0 months/);
  const noEffect = inspect({job_loss: true, ei_rate: 1, higher_bills: true, emergency_repair: true, repair_cost: 0}, {...profile, household_bills: 0}).insight;
  assert.deepEqual(noEffect.affected, []);
  assert.match(noEffect.supporting, /Replacement is 100%; recorded bills are \$0\.00; emergency cost is \$0\.00/);
});
test("no-shortfall language never treats the judging label as a duration", () => {
  const {after, insight} = inspect({emergency_repair: true, repair_cost: 1000});
  assert.equal(after.no_shortfall, true);
  assert.match(insight.supporting, /money in covers spending/);
  assert.doesNotMatch(insight.primary + insight.supporting, /120 months/);
});
test("zero and negative inflows use supported numerical explanations", () => {
  assert.match(inspect({job_loss: true}, {...profile, income: 0}).insight.primary, /Recorded monthly money in is \$0\.00/);
  const result = inspect({job_loss: true}, {...profile, income: -100});
  assert.match(result.insight.primary, /rises by \$45\.00/);
});
test("missing values fail closed and sub-cent changes are not labelled as zero", () => {
  const before = simulate(profile);
  for (const field of ["income", "spending", "buffer_left", "monthly_shortfall"]) assert.throws(() => comparisonMetrics(before, {...before, [field]: null}));
  assert.equal(changeLabel(-0), "$0.00");
  assert.equal(changeLabel(.001), "+< $0.01");
  assert.equal(changeLabel(-.001), "−< $0.01");
  assert.throws(() => changeLabel(NaN));
  const tiny = inspect({higher_bills: true, bill_increase_rate: .000001});
  assert.match(tiny.insight.primary, /less than 0\.1%.*less than \$0\.01/);
  assert.equal(tiny.rows[1].change, "+< $0.01");
});
test("all official accounts keep exact deltas and matching emphasis across all shock combinations", async () => {
  const payload = JSON.parse(await readFile(new URL("../../public/data/profiles.json", import.meta.url)));
  for (const person of decodeProfiles(payload).values()) {
    const before = simulate(person);
    for (let mask = 0; mask < 8; mask++) {
      const options = {job_loss: Boolean(mask & 1), higher_bills: Boolean(mask & 2), emergency_repair: Boolean(mask & 4), repair_cost: Math.max(person.spending, 0)};
      const after = simulate(person, options), rows = comparisonMetrics(before, after);
      const expected = rows.filter(row => row.delta !== 0).map(row => row.key);
      for (const row of rows) {
        assert.equal(row.delta, after[row.key] - before[row.key]);
        assert.ok(row.domain[0] <= Math.min(row.before, row.after, 0));
        assert.ok(row.domain[1] >= Math.max(row.before, row.after, 0));
      }
      assert.deepEqual(scenarioInsight(person, before, after, options).affected, expected);
    }
  }
});
