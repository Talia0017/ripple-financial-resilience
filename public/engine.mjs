// Official static runway rules. Kept independent of the browser for verification.
export const COLUMNS = ["account_id", "income", "spending", "fixed_costs", "buffer", "household_bills", "loan_payment", "months", "first_month", "last_month", "buffer_rows", "buffer_valid_rows", "warnings"];
const MONEY_FIELDS = COLUMNS.slice(1, 7);

export function decodeProfiles(payload) {
  if (!payload || payload.schema_version !== 1 || !Array.isArray(payload.columns) || JSON.stringify(payload.columns) !== JSON.stringify(COLUMNS) || !Array.isArray(payload.rows)) throw new Error("账户资料格式不正确，请重新加载。");
  if (!Number.isInteger(payload.dataset?.account_count) || payload.dataset.account_count < 1 || payload.rows.length !== payload.dataset.account_count) throw new Error("账户资料不完整，请重新加载。");
  if (![payload.dataset.monthly_rows, payload.dataset.loan_rows].every(value => Number.isInteger(value) && value >= 0) || ![payload.dataset.first_month, payload.dataset.last_month].every(value => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) || payload.dataset.first_month > payload.dataset.last_month) throw new Error("资料来源信息不完整。");
  const profiles = new Map();
  for (const row of payload.rows) {
    if (!Array.isArray(row) || row.length !== COLUMNS.length) throw new Error("账户记录格式不正确。");
    const profile = Object.fromEntries(COLUMNS.map((key, index) => [key, row[index]]));
    if (typeof profile.account_id !== "string" || !profile.account_id.trim() || profiles.has(profile.account_id)) throw new Error("账户 ID 缺失或重复。");
    for (const field of MONEY_FIELDS) if (profile[field] !== null && !Number.isFinite(profile[field])) throw new Error("账户金额包含无效值。");
    for (const field of ["months", "buffer_rows", "buffer_valid_rows"]) if (!Number.isInteger(profile[field]) || profile[field] < 0) throw new Error("账户月份数量无效。");
    if (profile.months < 1 || profile.buffer_rows > 6 || profile.buffer_rows > profile.months || profile.buffer_valid_rows > profile.buffer_rows) throw new Error("账户历史窗口无效。");
    if (![profile.first_month, profile.last_month].every(value => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) || profile.first_month > profile.last_month) throw new Error("账户月份范围无效。");
    if (!Array.isArray(profile.warnings) || !profile.warnings.every(value => typeof value === "string")) throw new Error("数据提示格式不正确。");
    profile.warnings = Object.freeze([...profile.warnings]);
    profiles.set(profile.account_id, Object.freeze(profile));
  }
  return profiles;
}

// Match Python's one-decimal, ties-to-even formatting using the exact binary
// value, avoiding JS toFixed's different result at an exact tie such as 1.25.
export function oneDecimal(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("续航数值无效。");
  if (value === 0) return "0.0";
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  const significand = (bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
  const power = (exponent || 1) - 1023 - 52;
  let numerator = significand * 10n;
  let rounded;
  if (power >= 0) rounded = numerator << BigInt(power);
  else {
    const denominator = 1n << BigInt(-power);
    rounded = numerator / denominator;
    const remainder = numerator % denominator;
    if (remainder * 2n > denominator || (remainder * 2n === denominator && rounded % 2n === 1n)) rounded += 1n;
  }
  return `${rounded / 10n}.${rounded % 10n}`;
}

export function calculateRunway(bufferLeft, gap) {
  if (!Number.isFinite(bufferLeft) || !Number.isFinite(gap)) throw new Error("缓冲金或每月差额无效。");
  if (bufferLeft <= 0) return {runway: 0, no_shortfall: false, capped: false};
  if (gap <= 0) return {runway: 120, no_shortfall: true, capped: false};
  const months = bufferLeft / gap;
  return {runway: Math.min(months, 120), no_shortfall: false, capped: months >= 120};
}

export function simulate(profile, options = {}) {
  const scenario = {job_loss: false, ei_rate: .55, higher_bills: false, bill_increase_rate: .15, emergency_repair: false, repair_cost: 0, ...options};
  for (const field of ["income", "spending", "buffer"]) if (!Number.isFinite(profile[field])) throw new Error("收入、支出或缓冲金缺少有效数据，无法模拟。");
  for (const field of ["job_loss", "higher_bills", "emergency_repair"]) if (typeof scenario[field] !== "boolean") throw new Error("情景开关必须是布尔值。");
  if (!Number.isFinite(scenario.ei_rate) || scenario.ei_rate < 0 || scenario.ei_rate > 1) throw new Error("EI 替代率必须介于 0% 和 100% 之间。");
  if (!Number.isFinite(scenario.bill_increase_rate) || scenario.bill_increase_rate < 0) throw new Error("账单涨幅必须是非负有效数字。");
  if (!Number.isFinite(scenario.repair_cost) || scenario.repair_cost < 0) throw new Error("维修费用必须是非负有效数字。");
  if (scenario.higher_bills && !Number.isFinite(profile.household_bills)) throw new Error("家庭账单缺少有效数据，无法模拟账单上涨。");
  const income = scenario.job_loss ? profile.income * scenario.ei_rate : profile.income;
  const spending = profile.spending + (scenario.higher_bills ? profile.household_bills * scenario.bill_increase_rate : 0);
  const one_off_costs = scenario.emergency_repair ? scenario.repair_cost : 0;
  const buffer_left = profile.buffer - one_off_costs;
  const gap = spending - income;
  const result = {...calculateRunway(buffer_left, gap), income, spending, one_off_costs, buffer_left, gap, monthly_shortfall: Math.max(gap, 0)};
  result.runway_label = result.no_shortfall ? "No shortfall (120+)" : `${oneDecimal(result.runway)} 个月${result.capped ? "（上限）" : ""}`;
  return result;
}
