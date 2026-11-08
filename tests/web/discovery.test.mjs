import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {decodeProfiles, simulate} from "../../public/engine.mjs";
import {decodeHistory, monthlyDiscovery, bufferEquivalent, discoveryEvidence} from "../../public/dashboard.mjs";

// Deliberately synthetic, isolated fixtures for missing and boundary values.
const profile = {account_id: "synthetic", income: 3000, spending: 2500, buffer: 5000, household_bills: 500};

test("monthly discovery reveals summary-surplus exceptions from actual complete pairs", () => {
  const rows = [["2025-01", 3000, 3100], ["2025-03", 3000, 2000], ["2025-04", null, 4000]];
  assert.equal(monthlyDiscovery(profile, rows), "Typical money in is higher, yet 1 of 2 recent months had more money out. Incomplete months excluded.");
  assert.match(monthlyDiscovery({...profile, income: 2000}, rows), /1 of 2 recorded months/);
  assert.match(monthlyDiscovery(profile, [["2025-01", null, null]]), /No complete/);
  assert.match(monthlyDiscovery(profile, [["2025-01", 3000, 2000]]), /0 of 1 recorded month/);
});
test("buffer spending-equivalent remains distinct from runway and savings advice", () => {
  const equivalent = bufferEquivalent(profile);
  assert.equal(equivalent.ratio, 2);assert.equal(equivalent.label, "≈ 2.0 months");
  assert.equal(simulate(profile).no_shortfall, true);
  assert.equal(bufferEquivalent({...profile, buffer: -100}).positive, false);
  assert.equal(bufferEquivalent({...profile, buffer: -100}).label, "Below zero");
  assert.equal(bufferEquivalent({...profile, buffer: 0}).label, "No positive buffer");
  assert.equal(bufferEquivalent({...profile, buffer: .001}).label, "Less than 0.1 month");
  for (const spending of [0, -1, null]) assert.equal(bufferEquivalent({...profile, spending}), null);
  assert.equal(bufferEquivalent({...profile, buffer: null}), null);
  assert.equal(bufferEquivalent({...profile, buffer: Number.MAX_VALUE, spending: Number.MIN_VALUE}), null);
});
test("population evidence excludes missing observations and keeps unavailable shocks explicit", () => {
  const profiles = new Map([["synthetic", profile], ["unknown", {...profile, account_id: "unknown", income: null}]]);
  const partial = discoveryEvidence(profiles);
  assert.equal(partial.monthly, null);assert.equal(partial.shock.unknown, 1);
  const complete = discoveryEvidence(profiles, new Map([["synthetic", [["2025-01", null, 4000]]]]));
  assert.deepEqual(complete.monthly, {eligible: 1, observed: 0, withShortfall: 0});
  assert.equal(complete.shock.count, 1);
});
test("all three findings match independent Python checks on official assets", async () => {
  const payload = JSON.parse(await readFile(new URL("../../public/data/profiles.json", import.meta.url)));
  const history = JSON.parse(await readFile(new URL("../../public/data/history.json", import.meta.url)));
  const profiles = decodeProfiles(payload), histories = decodeHistory(history, profiles, payload.dataset.source_sha256);
  const evidence = discoveryEvidence(profiles, histories);
  assert.deepEqual(evidence.monthly, {eligible: 3309, observed: 3309, withShortfall: 3299});
  assert.equal(evidence.buffers.sample, 166);
  assert.deepEqual(evidence.buffers.groups.map(group => group.medianBuffer), [30434.58583333333, 17689.631666666668]);
  assert.deepEqual(evidence.shock.groups.map(group => group.count), [23, 4243, 234]);
  assert.equal(evidence.shock.count, 4500);assert.equal(evidence.shock.unknown, 0);
  assert.equal(evidence.shock.groups.reduce((sum, group) => sum + group.count, 0), 4500);
});
