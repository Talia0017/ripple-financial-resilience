"""All records in this file are synthetic fixtures, never app demo data."""

from dataclasses import replace
from pathlib import Path
import sys
import tempfile
import unittest

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from data_access import DataError, load_data, prepare_loans, prepare_monthly
from engine import CalculationError, Scenario, calculate_customer, calculate_runway, simulate


def monthly_fixture(count=6, account="001"):
    return pd.DataFrame({
        "account_id": [account] * count,
        "month": pd.date_range("2025-01-01", periods=count, freq="MS").strftime("%Y-%m"),
        "money_in": [3000.0] * count,
        "money_out": [2500.0] * count,
        "household_bills": [500.0] * count,
        "insurance": [100.0] * count,
        "loan_payments": [200.0] * count,
        "avg_daily_balance": [5000.0] * count,
    })


def loan_fixture():
    return pd.DataFrame({
        "loan_id": ["test-loan"], "account_id": ["001"], "loan_start": ["2025-01-01"],
        "monthly_payment": [200.0], "status": ["C"],
    })


def customer(monthly=None, loans=None):
    prepared, _ = prepare_monthly(monthly if monthly is not None else monthly_fixture())
    prepared_loans = prepare_loans(loans if loans is not None else loan_fixture())
    return calculate_customer(prepared, prepared_loans, "001")


class CalculationTests(unittest.TestCase):
    def test_exact_requested_job_loss_example(self):
        result = simulate(customer(), Scenario(job_loss=True))
        self.assertAlmostEqual(result.income, 1650)
        self.assertAlmostEqual(result.gap, 850)
        self.assertAlmostEqual(result.runway, 5000 / 850)
        self.assertEqual(result.runway_label, "5.9 months")

    def test_medians_not_means(self):
        rows = monthly_fixture(3)
        rows["money_in"] = [100, 3000, 100000]
        rows["money_out"] = [10, 2500, 50000]
        self.assertEqual(customer(rows).income, 3000)
        self.assertEqual(customer(rows).spending, 2500)

    def test_fixed_costs_sum_each_month_before_median(self):
        rows = monthly_fixture(3)
        rows["household_bills"] = [0, 100, 100]
        rows["insurance"] = [100, 0, 100]
        rows["loan_payments"] = [100, 100, 0]
        self.assertEqual(customer(rows).fixed_costs, 200)  # sum of medians would be 300

    def test_buffer_sorts_then_uses_last_six_rows(self):
        rows = monthly_fixture(8)
        rows["avg_daily_balance"] = [99999, 99999, 10, 20, 30, 40, 50, 60]
        result = customer(rows.iloc[::-1])
        self.assertEqual(result.buffer, 35)
        self.assertEqual(result.buffer_rows, 6)

    def test_less_than_six_months_disclosed(self):
        result = customer(monthly_fixture(2))
        self.assertEqual(result.buffer, 5000)
        self.assertEqual(result.buffer_rows, 2)
        self.assertTrue(any("Fewer than six months" in warning for warning in result.warnings))

    def test_bill_increase_applies_to_h_only(self):
        result = simulate(customer(), Scenario(higher_bills=True))
        self.assertEqual(result.spending, 2575)

    def test_repair_deducted_once_from_buffer(self):
        result = simulate(customer(), Scenario(emergency_repair=True, repair_cost=2500))
        self.assertEqual(result.buffer_left, 2500)
        self.assertEqual(result.spending, 2500)

    def test_all_shocks_combine(self):
        result = simulate(customer(), Scenario(True, .55, True, .15, True, 2500))
        self.assertAlmostEqual(result.income, 1650)
        self.assertEqual(result.spending, 2575)
        self.assertEqual(result.buffer_left, 2500)
        self.assertAlmostEqual(result.runway, 2500 / 925)

    def test_disabled_shocks_do_not_change_values(self):
        self.assertEqual(simulate(customer()), simulate(customer(), Scenario(False, 0, False, 4, False, 99999)))

    def test_loan_not_double_counted(self):
        person = customer()
        self.assertEqual(person.loan_payment, 200)
        self.assertEqual(simulate(person).spending, 2500)
        self.assertEqual(simulate(person, Scenario(job_loss=True)).spending, 2500)

    def test_running_and_finished_loan_statuses(self):
        for status, expected in [("A", 0), ("B", 0), ("C", 200), ("D", 200)]:
            with self.subTest(status=status):
                loans = loan_fixture()
                loans["status"] = status
                self.assertEqual(customer(loans=loans).loan_payment, expected)

    def test_future_loan_excluded_and_cutoff_included(self):
        loans = loan_fixture()
        loans["loan_start"] = "2026-01-01"
        self.assertEqual(customer(loans=loans).loan_payment, 0)
        loans["loan_start"] = "2025-12-31"
        self.assertEqual(customer(loans=loans).loan_payment, 200)

    def test_multiple_running_loans_summed(self):
        loans = pd.concat([loan_fixture(), loan_fixture().assign(loan_id="second", monthly_payment=300, status="D")])
        self.assertEqual(customer(loans=loans).loan_payment, 500)

    def test_missing_account_loan_is_zero(self):
        self.assertEqual(customer(loans=loan_fixture().assign(account_id="other")).loan_payment, 0)

    def test_missing_loan_file_is_unknown_not_zero(self):
        rows, _ = prepare_monthly(monthly_fixture())
        person = calculate_customer(rows, None, "001")
        self.assertIsNone(person.loan_payment)
        self.assertEqual(simulate(person).spending, 2500)

    def test_invalid_loan_information_is_unknown(self):
        for field, value in [("monthly_payment", ""), ("monthly_payment", -1), ("loan_start", "bad"), ("status", "X")]:
            with self.subTest(field=field, value=value):
                loans = loan_fixture()
                loans[field] = value
                self.assertIsNone(customer(loans=loans).loan_payment)

    def test_nonexistent_account(self):
        rows, _ = prepare_monthly(monthly_fixture())
        with self.assertRaises(CalculationError):
            calculate_customer(rows, None, "missing")

    def test_missing_values_not_filled_with_zero(self):
        rows = monthly_fixture(3)
        rows["money_in"] = [None, 2000, 4000]
        rows["insurance"] = [None, 100, 100]
        result = customer(rows)
        self.assertEqual(result.income, 3000)
        self.assertEqual(result.fixed_costs, 800)
        self.assertTrue(result.warnings)

    def test_buffer_missing_values_do_not_expand_six_row_window(self):
        rows = monthly_fixture(7)
        rows["avg_daily_balance"] = [99999, None, 10, 20, 30, 40, 50]
        result = customer(rows)
        self.assertEqual(result.buffer, 30)
        self.assertEqual(result.buffer_valid_rows, 5)
        self.assertTrue(any("without using older rows" in warning for warning in result.warnings))

    def test_all_missing_critical_values_prevent_simulation(self):
        for field in ["money_in", "money_out", "avg_daily_balance"]:
            with self.subTest(field=field):
                rows = monthly_fixture()
                rows[field] = None
                with self.assertRaises(CalculationError):
                    simulate(customer(rows))

    def test_missing_h_only_blocks_bill_shock(self):
        rows = monthly_fixture()
        rows["household_bills"] = None
        person = customer(rows)
        simulate(person, Scenario(job_loss=True))
        with self.assertRaises(CalculationError):
            simulate(person, Scenario(higher_bills=True))

    def test_negative_balance_is_preserved_and_runway_zero(self):
        person = customer(monthly_fixture().assign(avg_daily_balance=-200))
        self.assertEqual(person.buffer, -200)
        self.assertEqual(simulate(person).runway, 0)
        self.assertFalse(simulate(person).no_shortfall)

    def test_one_off_cost_equal_or_larger_than_buffer(self):
        for cost in [5000, 6000]:
            with self.subTest(cost=cost):
                result = simulate(customer(), Scenario(emergency_repair=True, repair_cost=cost))
                self.assertEqual(result.runway, 0)
                self.assertEqual(result.buffer_left, 5000 - cost)

    def test_runway_rule_precedence_and_cap(self):
        cases = [
            (0, -10, (0, False, False)),
            (-100, 100, (0, False, False)),
            (5000, 0, (120, True, False)),
            (5000, -100, (120, True, False)),
            (5000, 1, (120, False, True)),
            (120, 1, (120, False, True)),
            (5000, 1000, (5, False, False)),
        ]
        for buffer, gap, expected in cases:
            with self.subTest(buffer=buffer, gap=gap):
                self.assertEqual(calculate_runway(buffer, gap), expected)

    def test_no_shortfall_exact_official_label(self):
        self.assertEqual(simulate(customer()).runway_label, "No shortfall (120+)")

    def test_custom_parameters(self):
        result = simulate(customer(), Scenario(True, .8, True, .5, True, 1234))
        self.assertEqual((result.income, result.spending, result.buffer_left), (2400, 2750, 3766))

    def test_invalid_scenario_parameters_rejected(self):
        scenarios = [Scenario(ei_rate=-.1), Scenario(ei_rate=1.1), Scenario(ei_rate=float("nan")),
                     Scenario(bill_increase_rate=-1), Scenario(repair_cost=-1), Scenario(repair_cost=float("inf"))]
        for scenario in scenarios:
            with self.subTest(scenario=scenario), self.assertRaises(CalculationError):
                simulate(customer(), scenario)

    def test_nonfinite_calculation_rejected(self):
        with self.assertRaises(CalculationError):
            calculate_runway(float("inf"), 10)
        with self.assertRaises(CalculationError):
            simulate(replace(customer(), income=float("nan")))


class DataTests(unittest.TestCase):
    def test_account_ids_preserve_leading_zeroes(self):
        with tempfile.TemporaryDirectory() as folder:
            monthly_fixture().to_csv(Path(folder) / "monthly_summary.csv", index=False)
            loan_fixture().to_csv(Path(folder) / "loans.csv", index=False)
            bundle = load_data(Path(folder))
            self.assertEqual(bundle.monthly["account_id"].iloc[0], "001")
            self.assertEqual(bundle.loans["account_id"].iloc[0], "001")

    def test_missing_monthly_file_explains_path(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(DataError, "monthly_summary.csv"):
                load_data(Path(folder))

    def test_missing_loans_file_keeps_monthly_data(self):
        with tempfile.TemporaryDirectory() as folder:
            monthly_fixture().to_csv(Path(folder) / "monthly_summary.csv", index=False)
            bundle = load_data(Path(folder))
            self.assertIsNone(bundle.loans)
            self.assertTrue(bundle.warnings)
            self.assertEqual(len(bundle.monthly), 6)

    def test_malformed_loans_file_keeps_monthly_data(self):
        with tempfile.TemporaryDirectory() as folder:
            monthly_fixture().to_csv(Path(folder) / "monthly_summary.csv", index=False)
            pd.DataFrame({"wrong_column": [1]}).to_csv(Path(folder) / "loans.csv", index=False)
            self.assertIsNone(load_data(Path(folder)).loans)

    def test_missing_monthly_column_rejected(self):
        with self.assertRaises(DataError):
            prepare_monthly(monthly_fixture().drop(columns="money_in"))

    def test_duplicate_account_month_rejected(self):
        with self.assertRaises(DataError):
            prepare_monthly(pd.concat([monthly_fixture(), monthly_fixture()]))

    def test_duplicate_loans_rejected(self):
        with self.assertRaises(DataError):
            prepare_loans(pd.concat([loan_fixture(), loan_fixture()]))

    def test_invalid_dates_and_account_keys_excluded_with_warning(self):
        rows = monthly_fixture(3)
        rows["month"] = ["2025-01", "2025-13", "2025-03-01"]
        prepared, warnings = prepare_monthly(rows)
        self.assertEqual(len(prepared), 1)
        self.assertTrue(warnings)
        with self.assertRaises(DataError):
            prepare_monthly(monthly_fixture().assign(account_id=""))

    def test_month_gaps_disclosed(self):
        result = customer(monthly_fixture(3).drop(index=1))
        self.assertTrue(any("gaps in the monthly history" in warning for warning in result.warnings))

    def test_invalid_numeric_values_are_missing(self):
        rows = monthly_fixture(3)
        rows["money_in"] = ["bad", float("inf"), 3000]
        prepared, _ = prepare_monthly(rows)
        self.assertEqual(prepared["money_in"].isna().sum(), 2)
        self.assertEqual(customer(rows).income, 3000)


if __name__ == "__main__":
    unittest.main()
