"""One-page local Streamlit application backed only by the official CSVs."""

from pathlib import Path

import pandas as pd
import streamlit as st

from data_access import DataError, default_data_dir, load_data
from engine import CalculationError, Scenario, calculate_customer, simulate


st.set_page_config(page_title="Ripple — Financial Resilience Engine", page_icon="🌱", layout="wide")


def money(value):
    return "无法计算" if value is None else f"{value:,.2f}"


def file_signature(directory):
    # Refresh cached data automatically when either CSV is replaced.
    return tuple(
        (p.name, p.stat().st_mtime_ns, p.stat().st_size) if p.is_file() else (p.name, None, None)
        for p in (directory / "monthly_summary.csv", directory / "loans.csv")
    )


@st.cache_data(show_spinner="正在读取官方 CSV…")
def cached_load(directory: str, signature):
    return load_data(Path(directory))


def reset_scenario():
    # Runs before widgets are recreated, including when the selected account changes.
    for key in ("job_loss", "higher_bills", "emergency_repair", "ei_rate", "bill_rate", "repair_cost"):
        st.session_state.pop(key, None)


st.title("Ripple — Financial Resilience Engine")
st.caption("Sheridan Datathon 2026 · Tangerine Track · Resilience Rewired · 第一阶段")
st.write("选择一个真实账户，查看财务概况，再组合冲击，观察缓冲金能支撑多久。")

directory = default_data_dir()
try:
    bundle = cached_load(str(directory), file_signature(directory))
except (DataError, OSError) as exc:
    st.error(str(exc))
    st.info(f"数据应放在：{directory}\n\n需要 monthly_summary.csv 和 loans.csv。")
    st.stop()
for warning in bundle.warnings:
    st.warning(warning)

account_ids = sorted(bundle.monthly["account_id"].unique().tolist())
st.caption(f"已载入 {len(account_ids):,} 个真实账户 · {len(bundle.monthly):,} 条月度记录 · 金额沿用 CSV 原始单位，未换算币种。")
account_id = st.selectbox(
    "账户 ID（输入可搜索）", account_ids, index=None, placeholder="输入或选择真实 account_id",
    key="account_id", on_change=reset_scenario,
)
if account_id is None:
    st.info("请先选择账户。所有结果均来自官方 CSV，应用不使用演示客户。")
    st.stop()
try:
    customer = calculate_customer(bundle.monthly, bundle.loans, account_id)
except CalculationError as exc:
    st.error(str(exc))
    st.stop()

st.header("客户财务概况 · Customer Financial Overview")
st.caption(
    f"账户 {account_id} · 共 {customer.months} 个月（{customer.first_month} 至 {customer.last_month}）"
    f" · 缓冲金：最近 {customer.buffer_rows} 行，其中 {customer.buffer_valid_rows} 行有效"
)
for warning in customer.warnings:
    st.warning(warning)

metrics = [
    ("I · 典型月收入", customer.income, "所有月份 money_in 的中位数。"),
    ("S · 典型月支出", customer.spending, "所有月份 money_out 的中位数，已包含贷款付款。"),
    ("F · 典型固定开支", customer.fixed_costs, "每月 household_bills + insurance + loan_payments，先逐月相加，再取中位数。"),
    ("B · 储蓄缓冲金", customer.buffer, "按月份排序，最近六行 avg_daily_balance 的平均值。它是历史代理值，不是实时余额。"),
    ("H · 家庭账单", customer.household_bills, "所有月份 household_bills 的中位数。"),
    ("P · 贷款月供", customer.loan_payment, "2025 年底状态为 C/D 的贷款 monthly_payment。无相应贷款为 0；贷款数据不可用时显示无法计算。"),
]
for start in (0, 3):
    columns = st.columns(3)
    for column, (label, value, help_text) in zip(columns, metrics[start:start + 3]):
        column.metric(label, money(value), help=help_text)

try:
    baseline = simulate(customer)
except CalculationError as exc:
    st.error(str(exc))
    st.info("请补齐有效的收入、支出和缓冲金数据后再进行模拟。")
    st.stop()
st.metric("基准财务续航 · Baseline Financial Runway", baseline.runway_label)
st.caption("Runway 表示缓冲金可覆盖月度资金缺口的月数，按官方简化规则计算。")

st.header("互动财务冲击 · Financial Shocks")
st.write("可同时开启多种冲击。参数只用于当前模拟，不会修改 CSV。")
st.button("重置情景 · Reset Scenario", on_click=reset_scenario)
left, middle, right = st.columns(3)
with left:
    job_loss = st.checkbox("失业 · Job Loss", key="job_loss")
    ei_rate = st.slider("EI 收入替代率（%）", 0, 100, 55, key="ei_rate", disabled=not job_loss)
    st.caption("开启后，收入 = I × 替代率。55% 是比赛默认假设。")
with middle:
    higher_bills = st.checkbox("家庭账单上涨 · Higher Bills", key="higher_bills", disabled=customer.household_bills is None)
    bill_rate = st.number_input("家庭账单涨幅（%）", min_value=0.0, value=15.0, step=5.0, key="bill_rate", disabled=not higher_bills)
    st.caption("开启后，支出 = S + H × 涨幅；其他支出不变。")
with right:
    emergency_repair = st.checkbox("紧急维修 · Emergency Repair", key="emergency_repair")
    repair_cost = st.number_input("一次性维修费用", min_value=0.0, value=max(customer.spending, 0.0), step=100.0, format="%.2f", key="repair_cost", disabled=not emergency_repair)
    st.caption("默认费用等于 S；开启后从缓冲金一次扣除。")

scenario = Scenario(job_loss, ei_rate / 100, higher_bills, bill_rate / 100, emergency_repair, repair_cost)
try:
    after = simulate(customer, scenario)
except CalculationError as exc:
    st.error(str(exc))
    st.stop()

st.subheader("冲击前 / 后对比 · Before / After")
comparison = pd.DataFrame({
    "指标": ["月收入", "月支出（已含贷款付款）", "一次性费用", "剩余缓冲金", "每月资金缺口", "财务续航"],
    "冲击前": [money(baseline.income), money(baseline.spending), money(baseline.one_off_costs), money(baseline.buffer_left), money(baseline.monthly_shortfall), baseline.runway_label],
    "冲击后": [money(after.income), money(after.spending), money(after.one_off_costs), money(after.buffer_left), money(after.monthly_shortfall), after.runway_label],
})
st.dataframe(comparison, hide_index=True, width="stretch")
st.metric("冲击后财务续航", after.runway_label)
st.caption("每月资金缺口 = max(支出 − 收入, 0)。收入足以覆盖支出时显示 0；公式仍使用未截断的差额。")
if after.buffer_left <= 0:
    st.warning("缓冲金已耗尽或为负。按官方规则，续航为 0 个月，即使当月收入能够覆盖支出。")
elif after.no_shortfall:
    st.info("No shortfall (120+)：在当前固定参数下没有月度缺口。这是比赛标签，不代表未来 120 个月都有保障。")

with st.expander("计算公式、术语与数据假设", expanded=False):
    st.markdown("""
**官方简化公式**

- I = 全部已有月份 `money_in` 的中位数；S = `money_out` 的中位数。
- F = 每月 `household_bills + insurance + loan_payments` 的总和，再取中位数。
- B = 按月份排序，最后六行 `avg_daily_balance` 的平均值；不足六行则用现有行并提示。
- H = `household_bills` 的中位数。
- P = 截至 2025-12-31 已开始、状态为 C 或 D 的贷款月供之和；A/B 为 0。
  将官方贷款状态视为 2025 年底快照，不根据贷款期限重新推断状态。
- `money_out` 已包含贷款付款。P 和 F 是解释性指标，不额外加进 S。
- 失业：`income_after = I × EI rate`；未开启则为 I。
- 账单上涨：`spending_after = S + H × increase`；未开启则为 S。
- 维修：开启时 `one_off_costs = repair_cost`；未开启则为 0。
- `buffer_left = B − one_off_costs`；`gap = spending_after − income_after`。
- 若 `buffer_left <= 0`，runway = 0。
- 否则若 `gap <= 0`，显示 **No shortfall (120+)**。
- 其他情况：`runway = min(buffer_left / gap, 120)`，显示一位小数。

**如何理解这些数值**

中位数是把各月金额排序后取中间值。缓冲金是历史平均余额的代理值，可能为负，
也不等同于可立即提取的实时存款。缺失金额不补成零；相关统计使用有效记录并显示提示。
F 必须在同一个月的三个组成金额都有效时才使用该月；B 不向六行窗口以外借用旧值。
缺少 I、S 或 B 时停止模拟；缺少 H 时不能开启账单冲击；缺少贷款文件时 P 保持未知。

**模型范围**

这是比赛规定的静态简化计算，尚未建立逐月现金流预测。EI 的 55% 仅为模拟参数，
没有核验资格、金额上限或给付时长，不能理解为 EI 会永久持续。
模型没有模拟利息、税、通胀及行为变化。金额与币种沿用官方 CSV，未自行假设为加元。
个性化应急储蓄目标与备用计划将在下一阶段实现。
""")

with st.expander("查看该账户的原始月度记录"):
    history = bundle.monthly.loc[bundle.monthly["account_id"] == account_id, [
        "month", "money_in", "money_out", "household_bills", "insurance", "loan_payments", "avg_daily_balance"
    ]].sort_values("month").copy()
    history["month"] = history["month"].dt.strftime("%Y-%m")
    st.dataframe(history, hide_index=True, width="stretch")
    st.caption(f"读取位置：{directory}。这里只读取数据，不会保存情景或改写原文件。")
