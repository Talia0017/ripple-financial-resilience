import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {COLUMNS, calculateRunway, decodeProfiles, oneDecimal, simulate} from "../../public/engine.mjs";

// Explicitly synthetic profile for edge cases; never a website fallback.
const fixture = {account_id: "synthetic-001", income: 3000, spending: 2500, fixed_costs: 800, buffer: 5000, household_bills: 500, loan_payment: 200, months: 6, first_month: "2025-01", last_month: "2025-06", buffer_rows: 6, buffer_valid_rows: 6, warnings: []};
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-8 + Math.abs(b) * 1e-10, `${a} != ${b}`);
const payload = () => ({schema_version: 1, dataset: {account_count: 1, monthly_rows: 6, loan_rows: 1, first_month: "2025-01", last_month: "2025-06"}, columns: COLUMNS, rows: [COLUMNS.map(key => fixture[key])]});

test("required job-loss example produces 5.9 months", () => {
  const result = simulate(fixture, {job_loss: true});
  close(result.income, 1650); close(result.gap, 850); close(result.runway, 5000 / 850);
  assert.equal(result.runway_label, "5.9 months");
});
test("bills affect H only and loan payments are not added twice", () => {
  assert.equal(simulate(fixture, {higher_bills: true}).spending, 2575);
  assert.equal(simulate(fixture).spending, 2500);
  assert.equal(simulate({...fixture, loan_payment: 99999}).spending, 2500);
});
test("all shocks combine and one-off repair is deducted exactly once", () => {
  const result = simulate(fixture, {job_loss: true, higher_bills: true, emergency_repair: true, repair_cost: 2500});
  close(result.income, 1650); assert.equal(result.spending, 2575); assert.equal(result.buffer_left, 2500);
  close(result.runway, 2500 / 925);
});
test("custom rates, EI 0 and EI 100 work", () => {
  const result = simulate(fixture, {job_loss: true, ei_rate: .8, higher_bills: true, bill_increase_rate: .5, emergency_repair: true, repair_cost: 1234});
  assert.equal(result.income, 2400); assert.equal(result.spending, 2750); assert.equal(result.buffer_left, 3766);
  assert.equal(simulate(fixture, {job_loss: true, ei_rate: 0}).income, 0);
  assert.equal(simulate(fixture, {job_loss: true, ei_rate: 1}).income, 3000);
});
test("disabled shocks and reset defaults preserve the baseline", () => {
  assert.deepEqual(simulate(fixture, {ei_rate: 0, bill_increase_rate: 4, repair_cost: 99999}), simulate(fixture));
});
test("zero and negative buffers take precedence over no shortfall", () => {
  for (const buffer of [0, -200]) {
    const result = simulate({...fixture, buffer});
    assert.equal(result.runway, 0); assert.equal(result.no_shortfall, false);
  }
});
test("repair at or above buffer gives zero, preserving negative remainder", () => {
  for (const cost of [5000, 6000]) {
    const result = simulate(fixture, {emergency_repair: true, repair_cost: cost});
    assert.equal(result.runway, 0); assert.equal(result.buffer_left, 5000 - cost);
  }
});
test("zero shortfall, surplus and the numeric 120 cap are distinct", () => {
  assert.equal(simulate({...fixture, income: 2500}).runway_label, "No shortfall (120+)");
  assert.equal(simulate(fixture).runway_label, "No shortfall (120+)");
  assert.deepEqual(calculateRunway(5000, 1), {runway: 120, no_shortfall: false, capped: true});
});
test("missing critical values do not become zero", () => {
  for (const field of ["income", "spending", "buffer"]) assert.throws(() => simulate({...fixture, [field]: null}));
  assert.doesNotThrow(() => simulate({...fixture, household_bills: null, loan_payment: null}));
  assert.throws(() => simulate({...fixture, household_bills: null}, {higher_bills: true}));
});
test("invalid and nonfinite controls are rejected", () => {
  for (const options of [{ei_rate: -.1}, {ei_rate: 1.1}, {ei_rate: NaN}, {bill_increase_rate: -1}, {repair_cost: Infinity}, {repair_cost: -1}, {job_loss: "false"}]) assert.throws(() => simulate(fixture, options));
  assert.throws(() => calculateRunway(Infinity, 10));
});
test("one-decimal formatting preserves Python ties-to-even behavior", () => {
  for (const [value, expected] of [[0, "0.0"], [1.25, "1.2"], [1.75, "1.8"], [5.85, "5.8"], [5000 / 850, "5.9"], [120, "120.0"], [Number.MIN_VALUE, "0.0"]]) assert.equal(oneDecimal(value), expected);
});
test("decode preserves account strings, missing metrics and limited-history warnings", () => {
  const data = payload();
  const profile = {...fixture, account_id: "001", months: 2, buffer_rows: 2, buffer_valid_rows: 1, loan_payment: null, warnings: ["synthetic short-history warning"]};
  data.rows = [COLUMNS.map(key => profile[key])];
  const decoded = decodeProfiles(data).get("001");
  assert.equal(decoded.loan_payment, null); assert.equal(decoded.months, 2); assert.deepEqual(decoded.warnings, profile.warnings);
  assert.equal(decodeProfiles(data).has("nonexistent"), false);
});
test("incomplete, duplicate and corrupt profile payloads fail closed", () => {
  const mutations = [data => data.schema_version = 99, data => data.columns = [], data => data.rows = [], data => {data.rows.push(data.rows[0]); data.dataset.account_count = 2;}, data => data.rows[0][1] = Infinity, data => data.rows[0][7] = -1, data => data.rows[0][8] = "2025-13"];
  for (const change of mutations) {const data = payload(); change(data); assert.throws(() => decodeProfiles(data));}
});
test("all 4,500 bundled profiles and random account lookups are usable", async () => {
  const data = JSON.parse(await readFile(new URL("../../public/data/profiles.json", import.meta.url), "utf8"));
  const profiles = decodeProfiles(data);
  assert.equal(profiles.size, 4500);
  for (const profile of profiles.values()) {assert.ok(Number.isFinite(simulate(profile).runway)); assert.ok(Number.isFinite(simulate(profile, {job_loss: true, higher_bills: true, emergency_repair: true, repair_cost: Math.max(profile.spending, 0)}).runway));}
  const ids = [...profiles.keys()];
  let seed = 20261107;
  for (let i = 0; i < 50; i++) {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const id = ids[seed % ids.length]; assert.equal(profiles.get(id).account_id, id);}
});
