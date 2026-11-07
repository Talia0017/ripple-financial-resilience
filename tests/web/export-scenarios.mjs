// Differential test bridge: JSON on stdin, results on stdout. Not website code.
import {decodeProfiles, simulate} from "../../public/engine.mjs";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const {payload, scenarios} = JSON.parse(input);
const results = [];
for (const profile of decodeProfiles(payload).values()) {
  for (const specification of scenarios) {
    const options = {...specification};
    if (options.repair_cost === "S") options.repair_cost = profile.spending;
    if (options.repair_cost === "over_buffer") options.repair_cost = Math.max(profile.buffer, 0) + 1;
    const result = simulate(profile, options);
    results.push([result.income, result.spending, result.one_off_costs, result.buffer_left, result.gap, result.runway, result.monthly_shortfall, result.no_shortfall, result.capped, result.runway_label]);
  }
}
process.stdout.write(JSON.stringify(results));
