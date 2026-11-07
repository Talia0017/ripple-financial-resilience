"""One-page local Streamlit application backed only by the official CSVs."""

from pathlib import Path

import pandas as pd
import streamlit as st

from data_access import DataError, default_data_dir, load_data
from engine import CalculationError, Scenario, calculate_customer, simulate


st.set_page_config(page_title="Ripple — Financial Resilience Engine", page_icon="🌱", layout="wide")


def money(value):
    return "Unavailable" if value is None else f"{value:,.2f}"


def file_signature(directory):
    # Refresh cached data automatically when either CSV is replaced.
    return tuple(
        (p.name, p.stat().st_mtime_ns, p.stat().st_size) if p.is_file() else (p.name, None, None)
        for p in (directory / "monthly_summary.csv", directory / "loans.csv")
    )


@st.cache_data(show_spinner="Loading the official CSV files…")
def cached_load(directory: str, signature):
    return load_data(Path(directory))


def reset_scenario():
    # Runs before widgets are recreated, including when the selected account changes.
    for key in ("job_loss", "higher_bills", "emergency_repair", "ei_rate", "bill_rate", "repair_cost"):
        st.session_state.pop(key, None)


st.title("Ripple — Financial Resilience Engine")
st.caption("Sheridan Datathon 2026 · Tangerine Track · Resilience Rewired · Phase 1")
st.write("Choose an official challenge account, review its finances, and combine shocks to see how long its buffer could last.")

directory = default_data_dir()
try:
    bundle = cached_load(str(directory), file_signature(directory))
except (DataError, OSError) as exc:
    st.error(str(exc))
    st.info(f"Data directory: {directory}\n\nRequired files: monthly_summary.csv and loans.csv.")
    st.stop()
for warning in bundle.warnings:
    st.warning(warning)

account_ids = sorted(bundle.monthly["account_id"].unique().tolist())
st.caption(f"Loaded {len(account_ids):,} official accounts · {len(bundle.monthly):,} monthly records · Amounts use the original CSV units; no currency conversion is applied.")
account_id = st.selectbox(
    "Account ID (type to search)", account_ids, index=None, placeholder="Enter or select an official account ID",
    key="account_id", on_change=reset_scenario,
)
if account_id is None:
    st.info("Choose an account to begin. Results come from the official challenge CSVs; sample accounts are not used as a fallback.")
    st.stop()
try:
    customer = calculate_customer(bundle.monthly, bundle.loans, account_id)
except CalculationError as exc:
    st.error(str(exc))
    st.stop()

st.header("Customer financial overview")
st.caption(
    f"Account {account_id} · {customer.months} months ({customer.first_month} to {customer.last_month})"
    f" · Buffer: {customer.buffer_valid_rows} valid values in the last {customer.buffer_rows} rows"
)
for warning in customer.warnings:
    st.warning(warning)

metrics = [
    ("I · Typical monthly income", customer.income, "Median money_in across all available months."),
    ("S · Typical monthly spending", customer.spending, "Median money_out across all available months, including loan payments."),
    ("F · Typical fixed costs", customer.fixed_costs, "Add household_bills, insurance and loan_payments within each month, then take the median of those monthly totals."),
    ("B · Savings buffer", customer.buffer, "Mean avg_daily_balance across the last six rows sorted by month. This historical estimate is not a live balance."),
    ("H · Household bills", customer.household_bills, "Median household_bills across all available months."),
    ("P · Loan payment", customer.loan_payment, "Monthly payments for loans running at year-end 2025 (status C/D). No matching loan means zero; unavailable loan data remains unknown."),
]
for start in (0, 3):
    columns = st.columns(3)
    for column, (label, value, help_text) in zip(columns, metrics[start:start + 3]):
        column.metric(label, money(value), help=help_text)

try:
    baseline = simulate(customer)
except CalculationError as exc:
    st.error(str(exc))
    st.info("Valid income, spending and buffer data is required before a scenario can be calculated.")
    st.stop()
st.metric("Baseline financial runway", baseline.runway_label)
st.caption("Runway estimates how many months the buffer can cover a monthly shortfall under the official simplified rules.")

st.header("Explore financial shocks")
st.write("Combine shocks to explore different scenarios. These settings do not modify the source CSVs.")
st.button("Reset scenario", on_click=reset_scenario)
left, middle, right = st.columns(3)
with left:
    job_loss = st.checkbox("Job loss", key="job_loss")
    ei_rate = st.slider("EI replacement rate (%)", 0, 100, 55, key="ei_rate", disabled=not job_loss)
    st.caption("When enabled, income = I × replacement rate. The challenge default is 55%.")
with middle:
    higher_bills = st.checkbox("Higher household bills", key="higher_bills", disabled=customer.household_bills is None)
    bill_rate = st.number_input("Household bill increase (%)", min_value=0.0, value=15.0, step=5.0, key="bill_rate", disabled=not higher_bills)
    st.caption("When enabled, spending = S + H × increase rate. Other spending is unchanged.")
with right:
    emergency_repair = st.checkbox("Emergency repair", key="emergency_repair")
    repair_cost = st.number_input("One-off repair cost", min_value=0.0, value=max(customer.spending, 0.0), step=100.0, format="%.2f", key="repair_cost", disabled=not emergency_repair)
    st.caption("The default cost equals S. When enabled, it is deducted from the buffer once.")

scenario = Scenario(job_loss, ei_rate / 100, higher_bills, bill_rate / 100, emergency_repair, repair_cost)
try:
    after = simulate(customer, scenario)
except CalculationError as exc:
    st.error(str(exc))
    st.stop()

st.subheader("Before / after comparison")
comparison = pd.DataFrame({
    "Metric": ["Monthly income", "Monthly spending (includes loan payments)", "One-off costs", "Remaining buffer", "Monthly shortfall", "Financial runway"],
    "Before shock": [money(baseline.income), money(baseline.spending), money(baseline.one_off_costs), money(baseline.buffer_left), money(baseline.monthly_shortfall), baseline.runway_label],
    "After shock": [money(after.income), money(after.spending), money(after.one_off_costs), money(after.buffer_left), money(after.monthly_shortfall), after.runway_label],
})
st.dataframe(comparison, hide_index=True, width="stretch")
st.metric("Runway after shock", after.runway_label)
st.caption("Monthly shortfall = max(spending − income, 0). The table shows zero when income covers spending; the runway formula still uses the original signed gap.")
if after.buffer_left <= 0:
    st.warning("The buffer is depleted or negative. Under the official rules, runway is 0 months, even if income covers monthly spending.")
elif after.no_shortfall:
    st.info("No shortfall (120+): there is no monthly shortfall under the current assumptions. This judging label does not guarantee financial security for the next 120 months.")

with st.expander("Formulas, financial terms and assumptions", expanded=False):
    st.markdown("""
**Official simplified formulas**

- I = median `money_in` across all available months; S = median `money_out`.
- F = median of each month's `household_bills + insurance + loan_payments` total.
- B = mean `avg_daily_balance` across the last six rows sorted by month.
  If fewer than six rows are available, use those rows and disclose the limitation.
- H = median `household_bills`.
- P = total monthly payments for loans started by 2025-12-31 with status C/D; A/B contribute zero.
  The supplied statuses are interpreted as the year-end-2025 snapshot, without recalculating status from loan duration.
- `money_out` already includes loan payments. P and F explain spending; they are not added to S again.
- Job loss: `income_after = I × EI rate`; otherwise income remains I.
- Higher bills: `spending_after = S + H × increase`; otherwise spending remains S.
- Repair: `one_off_costs = repair_cost` when enabled; otherwise zero.
- `buffer_left = B − one_off_costs`; `gap = spending_after − income_after`.
- If `buffer_left <= 0`, runway = 0.
- Otherwise, if `gap <= 0`, display **No shortfall (120+)**.
- Otherwise, `runway = min(buffer_left / gap, 120)`, displayed to one decimal place.

**Understanding the figures**

The median is the middle value after sorting; for an even number of values, it is the average of the two middle values.
The buffer is an estimate based on historical balances. It can be negative and is not a live available balance.
Missing amounts are not replaced with zero: statistics use valid records and disclose the limitations.
F uses a month only when all three cost components are valid. B never uses older rows outside the six-row window to replace missing values.
Scenarios require valid I, S and B. Missing H disables the bill-increase scenario; missing loan data leaves P unknown.

**Model scope**

This is the challenge's static simplified calculation, not a month-by-month cash-flow forecast.
The 55% EI replacement rate is a scenario assumption. Eligibility, payment caps and benefit duration have not been verified;
it must not be interpreted as an indefinite income source.
The model does not project interest, taxes, inflation or changes in behaviour. Amounts retain the official CSV units, without assuming CAD.
Personalized emergency savings goals and backup plans are planned for a future phase.
""")

with st.expander("View this account's original monthly records"):
    history = bundle.monthly.loc[bundle.monthly["account_id"] == account_id, [
        "month", "money_in", "money_out", "household_bills", "insurance", "loan_payments", "avg_daily_balance"
    ]].sort_values("month").copy()
    history["month"] = history["month"].dt.strftime("%Y-%m")
    st.dataframe(history, hide_index=True, width="stretch")
    st.caption(f"Data source: {directory}. Records are read only; scenarios are not saved and source files are not modified.")
