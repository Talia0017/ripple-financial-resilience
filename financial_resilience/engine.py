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
        suffix = " (cap)" if self.capped else ""
        return f"{self.runway:.1f} months{suffix}"


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
        raise CalculationError(f"Account {account_id} was not found. Choose an account from the official dataset.")
    warnings = []
    for field in ("money_in", "money_out", "household_bills", "insurance", "loan_payments"):
        count = int(rows[field].isna().sum())
        if count:
            warnings.append(f"{field} is missing or invalid in {count} months. Related medians use valid months only; missing values are not replaced with zero.")

    # A fixed-cost row is valid only if all three components are present.
    fixed = rows[["household_bills", "insurance", "loan_payments"]].sum(axis=1, min_count=3)
    recent = rows.tail(6)
    valid_buffer = recent["avg_daily_balance"].dropna()
    if len(recent) < 6:
        warnings.append(f"Fewer than six months are available. The buffer uses the available {len(recent)} months and may be less representative.")
    if len(valid_buffer) != len(recent):
        warnings.append(
            f"Only {len(valid_buffer)} of the last {len(recent)} avg_daily_balance values are valid. "
            "The buffer averages these values without using older rows outside the window."
        )
    if len(rows) > 1:
        periods = rows["month"].dt.to_period("M")
        expected = periods.iloc[-1].ordinal - periods.iloc[0].ordinal + 1
        if expected != len(rows):
            warnings.append("There are gaps in the monthly history. The official calculation uses available rows without inventing missing months.")

    loan_payment = None
    if loans is None:
        warnings.append("Loan data is unavailable, so loan payment P is unknown. Income, spending and runway can still be calculated.")
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
            warnings.append("A relevant loan has a missing or invalid status, start date or monthly payment. P cannot be calculated reliably and is not assumed to be zero.")
        else:
            loan_payment = float(running["monthly_payment"].sum())
            if len(running) > 1:
                warnings.append(f"There are {len(running)} running loans with status C/D. P is the sum of their monthly payments.")

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
        raise CalculationError("The buffer or monthly gap is not a finite number, so runway cannot be calculated.")
    # Order matters: a depleted/negative buffer always produces zero runway.
    if buffer_left <= 0:
        return 0.0, False, False
    if gap <= 0:
        return 120.0, True, False
    months = buffer_left / gap
    return min(months, 120.0), False, months >= 120.0


def simulate(customer: Customer, scenario: Optional[Scenario] = None) -> Result:
    scenario = scenario or Scenario()
    for name, value in (("Monthly income I", customer.income), ("Monthly spending S", customer.spending), ("Buffer B", customer.buffer)):
        if value is None or not math.isfinite(value):
            raise CalculationError(f"{name} has no valid data, so this scenario cannot be calculated.")
    if not math.isfinite(scenario.ei_rate) or not 0 <= scenario.ei_rate <= 1:
        raise CalculationError("The EI replacement rate must be between 0% and 100%.")
    if not math.isfinite(scenario.bill_increase_rate) or scenario.bill_increase_rate < 0:
        raise CalculationError("The bill increase must be a finite, non-negative number.")
    if not math.isfinite(scenario.repair_cost) or scenario.repair_cost < 0:
        raise CalculationError("The repair cost must be a finite, non-negative number.")
    if scenario.higher_bills and (customer.household_bills is None or not math.isfinite(customer.household_bills)):
        raise CalculationError("Household bills H are unavailable, so a bill increase cannot be simulated.")

    income = customer.income * scenario.ei_rate if scenario.job_loss else customer.income
    spending = customer.spending
    if scenario.higher_bills:
        spending += customer.household_bills * scenario.bill_increase_rate
    one_off = scenario.repair_cost if scenario.emergency_repair else 0.0
    buffer_left = customer.buffer - one_off
    gap = spending - income
    runway, no_shortfall, capped = calculate_runway(buffer_left, gap)
    return Result(income, spending, one_off, buffer_left, gap, runway, no_shortfall, capped)
