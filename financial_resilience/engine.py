"""Official Datathon calculations. No sample customer data or external services."""

from dataclasses import dataclass
from typing import Optional, Tuple
import math

import pandas as pd


class CalculationError(ValueError):
    """The requested calculation cannot be made with the available data."""


@dataclass(frozen=True)
class Customer:
    account_id: str
    income: Optional[float]
    spending: Optional[float]
    fixed_costs: Optional[float]
    buffer: Optional[float]
    household_bills: Optional[float]
    loan_payment: Optional[float]
    months: int
    first_month: str
    last_month: str
    buffer_rows: int
    buffer_valid_rows: int
    warnings: Tuple[str, ...] = ()


@dataclass(frozen=True)
class Scenario:
    job_loss: bool = False
    ei_rate: float = 0.55
    higher_bills: bool = False
    bill_increase_rate: float = 0.15
    emergency_repair: bool = False
    repair_cost: float = 0.0


@dataclass(frozen=True)
class Result:
    income: float
    spending: float
    one_off_costs: float
    buffer_left: float
    gap: float
    runway: float
    no_shortfall: bool
    capped: bool

    @property
    def monthly_shortfall(self) -> float:
        return max(self.gap, 0.0)

    @property
    def runway_label(self) -> str:
        if self.no_shortfall:
            return "No shortfall (120+)"
        suffix = "（上限）" if self.capped else ""
        return f"{self.runway:.1f} 个月{suffix}"


def _number(value) -> Optional[float]:
    if pd.isna(value):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def _median(series: pd.Series) -> Optional[float]:
    valid = series.dropna()
    return _number(valid.median()) if not valid.empty else None


def calculate_customer(monthly: pd.DataFrame, loans: Optional[pd.DataFrame], account_id: str) -> Customer:
    """Use prepared frames from data_access; unavailable amounts remain None, never zero-filled."""
    account_id = str(account_id).strip()
    rows = monthly.loc[monthly["account_id"] == account_id].sort_values("month")
    if rows.empty:
        raise CalculationError(f"找不到账户 {account_id}。请从真实账户列表中选择。")
    warnings = []
    for field in ("money_in", "money_out", "household_bills", "insurance", "loan_payments"):
        count = int(rows[field].isna().sum())
        if count:
            warnings.append(f"{field} 有 {count} 个月缺失或不是有效数字；相关中位数只使用有效月份，未补成 0。")

    # A fixed-cost row is valid only if all three components are present.
    fixed = rows[["household_bills", "insurance", "loan_payments"]].sum(axis=1, min_count=3)
    recent = rows.tail(6)
    valid_buffer = recent["avg_daily_balance"].dropna()
    if len(recent) < 6:
        warnings.append(f"账户不足六个月：缓冲金使用现有 {len(recent)} 个月，结果可能不稳定。")
    if len(valid_buffer) != len(recent):
        warnings.append(
            f"最近 {len(recent)} 个月的 avg_daily_balance 中只有 {len(valid_buffer)} 个有效值；"
            "缓冲金只对这些值取平均，未向更早月份补取。"
        )
    if len(rows) > 1:
        periods = rows["month"].dt.to_period("M")
        expected = periods.iloc[-1].ordinal - periods.iloc[0].ordinal + 1
        if expected != len(rows):
            warnings.append("月度记录存在时间缺口；按官方规则使用已有月度行，不补造缺失月份。")

    loan_payment = None
    if loans is None:
        warnings.append("贷款文件不可用，无法确认贷款月供 P；收入、支出及 runway 仍可计算。")
    else:
        account_loans = loans.loc[loans["account_id"] == account_id]
        cutoff = pd.Timestamp("2025-12-31")
        # Status C/D is the official year-end running-status definition.
        # Do not infer a different status from duration or add P to spending.
        potentially_current = account_loans.loc[
            account_loans["loan_start"].isna() | (account_loans["loan_start"] <= cutoff)
        ]
        unknown_status = ~potentially_current["status"].isin(["A", "B", "C", "D"])
        running = potentially_current.loc[potentially_current["status"].isin(["C", "D"])]
        bad_running = running["monthly_payment"].isna() | running["loan_start"].isna()
        if unknown_status.any() or bad_running.any():
            warnings.append("相关贷款的状态、起始日或月供缺失/无效，无法可靠计算 P；未假设为 0。")
        else:
            loan_payment = float(running["monthly_payment"].sum())
            if len(running) > 1:
                warnings.append(f"有 {len(running)} 笔 C/D 状态贷款，P 为这些贷款月供的合计。")

    customer = Customer(
        account_id=account_id,
        income=_median(rows["money_in"]),
        spending=_median(rows["money_out"]),
        fixed_costs=_median(fixed),
        buffer=_number(valid_buffer.mean()) if not valid_buffer.empty else None,
        household_bills=_median(rows["household_bills"]),
        loan_payment=loan_payment,
        months=len(rows),
        first_month=rows["month"].iloc[0].strftime("%Y-%m"),
        last_month=rows["month"].iloc[-1].strftime("%Y-%m"),
        buffer_rows=len(recent),
        buffer_valid_rows=len(valid_buffer),
        warnings=tuple(warnings),
    )
    return customer


def calculate_runway(buffer_left: float, gap: float) -> Tuple[float, bool, bool]:
    if not math.isfinite(buffer_left) or not math.isfinite(gap):
        raise CalculationError("缓冲金或月度差额不是有效数字，无法计算 runway。")
    # Order matters: a depleted/negative buffer always produces zero runway.
    if buffer_left <= 0:
        return 0.0, False, False
    if gap <= 0:
        return 120.0, True, False
    months = buffer_left / gap
    return min(months, 120.0), False, months >= 120.0


def simulate(customer: Customer, scenario: Optional[Scenario] = None) -> Result:
    scenario = scenario or Scenario()
    for name, value in (("月收入 I", customer.income), ("月支出 S", customer.spending), ("缓冲金 B", customer.buffer)):
        if value is None or not math.isfinite(value):
            raise CalculationError(f"{name} 缺少有效数据，无法模拟。")
    if not math.isfinite(scenario.ei_rate) or not 0 <= scenario.ei_rate <= 1:
        raise CalculationError("EI 替代率必须介于 0% 与 100% 之间。")
    if not math.isfinite(scenario.bill_increase_rate) or scenario.bill_increase_rate < 0:
        raise CalculationError("账单涨幅必须为非负有限数字。")
    if not math.isfinite(scenario.repair_cost) or scenario.repair_cost < 0:
        raise CalculationError("维修费用必须为非负有限数字。")
    if scenario.higher_bills and (customer.household_bills is None or not math.isfinite(customer.household_bills)):
        raise CalculationError("家庭账单 H 缺少有效数据，无法模拟账单上涨。")

    income = customer.income * scenario.ei_rate if scenario.job_loss else customer.income
    spending = customer.spending
    if scenario.higher_bills:
        spending += customer.household_bills * scenario.bill_increase_rate
    one_off = scenario.repair_cost if scenario.emergency_repair else 0.0
    buffer_left = customer.buffer - one_off
    gap = spending - income
    runway, no_shortfall, capped = calculate_runway(buffer_left, gap)
    return Result(income, spending, one_off, buffer_left, gap, runway, no_shortfall, capped)
