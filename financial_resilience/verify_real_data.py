"""Check every real account against a separate standard-library reference.

Reads the official CSVs without modifying them. Saves only aggregate check counts.
"""

from collections import defaultdict
import csv
from itertools import product
import json
import math
from pathlib import Path
from statistics import mean, median

from streamlit.testing.v1 import AppTest

from data_access import default_data_dir, load_data
from engine import Scenario, calculate_customer, simulate


def close(actual, expected):
    if not math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-8):
        raise AssertionError(f"Calculation differs: {actual} vs {expected}")


def main():
    directory = default_data_dir()
    bundle = load_data(directory)
    if bundle.warnings or bundle.loans is None:
        raise AssertionError(f"Official data needs review: {bundle.warnings}")
    reference_monthly = defaultdict(list)
    with (directory / "monthly_summary.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            reference_monthly[row["account_id"].strip()].append({
                "month": row["month"],
                **{key: float(row[key]) for key in ("money_in", "money_out", "household_bills", "insurance", "loan_payments", "avg_daily_balance")},
            })
    reference_loans = defaultdict(float)
    with (directory / "loans.csv").open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if row["status"].strip().upper() in ("C", "D") and row["loan_start"] <= "2025-12-31":
                reference_loans[row["account_id"].strip()] += float(row["monthly_payment"])

    scenarios_checked = 0
    negative_buffers = 0
    baseline_labels = defaultdict(int)
    for account_id, frame in bundle.monthly.groupby("account_id", sort=False):
        person = calculate_customer(frame, bundle.loans, account_id)
        rows = sorted(reference_monthly[account_id], key=lambda row: row["month"])
        expected = {
            "income": median(row["money_in"] for row in rows),
            "spending": median(row["money_out"] for row in rows),
            "fixed_costs": median(row["household_bills"] + row["insurance"] + row["loan_payments"] for row in rows),
            "buffer": mean(row["avg_daily_balance"] for row in rows[-6:]),
            "household_bills": median(row["household_bills"] for row in rows),
            "loan_payment": reference_loans[account_id],
        }
        for field, amount in expected.items():
            close(getattr(person, field), amount)
        negative_buffers += person.buffer < 0
        baseline = simulate(person)
        baseline_labels["no_shortfall" if baseline.no_shortfall else "zero" if baseline.runway == 0 else "finite"] += 1
        for job_loss, bills, repair in product((False, True), repeat=3):
            result = simulate(person, Scenario(job_loss, .55, bills, .15, repair, person.spending))
            income = expected["income"] * (.55 if job_loss else 1)
            spending = expected["spending"] + (expected["household_bills"] * .15 if bills else 0)
            remaining = expected["buffer"] - (expected["spending"] if repair else 0)
            gap = spending - income
            no_shortfall = remaining > 0 and gap <= 0
            runway = 0 if remaining <= 0 else 120 if gap <= 0 else min(remaining / gap, 120)
            for actual, wanted in [(result.income, income), (result.spending, spending), (result.buffer_left, remaining), (result.gap, gap), (result.runway, runway)]:
                close(actual, wanted)
            assert result.no_shortfall == no_shortfall
            scenarios_checked += 1

    # Real-data page integration, including the listed real IDs and combined shocks.
    app = AppTest.from_file(str(Path(__file__).with_name("app.py")), default_timeout=30).run()
    assert not app.exception
    assert len(app.selectbox[0].options) == len(reference_monthly)
    selected = app.selectbox[0].options[0]
    app.selectbox[0].select(selected).run()
    assert not app.exception and len(app.metric) == 8
    app.checkbox(key="job_loss").check().run()
    app.checkbox(key="higher_bills").check().run()
    app.checkbox(key="emergency_repair").check().run()
    assert not app.exception
    person = calculate_customer(bundle.monthly, bundle.loans, selected)
    combined = simulate(person, Scenario(True, .55, True, .15, True, person.spending))
    assert app.metric[-1].value == combined.runway_label
    app.button[0].click().run()
    assert not app.exception and app.metric[-1].value == simulate(person).runway_label
    report = {
        "monthly_rows": len(bundle.monthly), "accounts_checked": len(reference_monthly),
        "loan_rows": len(bundle.loans), "metric_checks": len(reference_monthly) * 6,
        "scenario_checks": scenarios_checked, "negative_buffer_accounts": negative_buffers,
        "baseline_classification": dict(baseline_labels),
        "real_data_streamlit_apptest": "passed: lookup, overview, combined shocks, reset; not a visual browser test",
        "reference": "independent csv + statistics implementation; all amounts matched",
    }
    Path(__file__).with_name("verification_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
