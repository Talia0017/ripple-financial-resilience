"""Synthetic export checks; no official customer records are embedded here."""

import json
from pathlib import Path
import tempfile
import unittest

from data_access import DataError
from export_profiles import COLUMNS, build_profiles, build_history, write_profiles
from test_engine import loan_fixture, monthly_fixture


class ExportTests(unittest.TestCase):
    def test_export_uses_existing_formulas_and_retains_precision(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            monthly_fixture().assign(avg_daily_balance=[1, 2, 3, 4, 5, 6]).to_csv(root / "monthly_summary.csv", index=False)
            loan_fixture().to_csv(root / "loans.csv", index=False)
            payload = build_profiles(root, expected_accounts=1)
            profile = dict(zip(COLUMNS, payload["rows"][0]))
            self.assertEqual(profile["account_id"], "001")
            self.assertEqual(profile["income"], 3000)
            self.assertEqual(profile["spending"], 2500)
            self.assertEqual(profile["fixed_costs"], 800)
            self.assertEqual(profile["buffer"], 3.5)
            self.assertEqual(profile["loan_payment"], 200)
            output = root / "site/data/profiles.json"
            write_profiles(payload, output)
            first = output.read_bytes()
            write_profiles(payload, output)
            self.assertEqual(first, output.read_bytes())
            self.assertEqual(json.loads(first)["dataset"]["account_count"], 1)
            self.assertNotIn("monthly_records", json.loads(first))
            history = build_history(root, payload)
            self.assertEqual(history["accounts"]["001"][0], ["2025-01", 3000, 2500])
            self.assertEqual(history["dataset"]["exported_rows"], 6)
            self.assertEqual(history["dataset"]["source_sha256"], payload["dataset"]["source_sha256"])

    def test_history_preserves_latest_recorded_values_gaps_and_missing_amounts(self):
        import pandas as pd
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            rows = monthly_fixture().iloc[[0] * 15].copy().reset_index(drop=True)
            rows["month"] = pd.date_range("2023-01-01", periods=15, freq="2MS").strftime("%Y-%m")
            rows["money_in"] = [float(i) + .123456789 for i in range(15)]
            rows.loc[14, "money_out"] = float("nan")
            rows.to_csv(root / "monthly_summary.csv", index=False)
            loan_fixture().to_csv(root / "loans.csv", index=False)
            profiles = build_profiles(root, expected_accounts=1)
            history = build_history(root, profiles)["accounts"]["001"]
            self.assertEqual(len(history), 12)
            self.assertEqual(history[0][0], rows.iloc[3]["month"])
            self.assertAlmostEqual(history[0][1], 3.123456789)
            self.assertEqual(history[-1][0], rows.iloc[-1]["month"])
            self.assertIsNone(history[-1][2])
            profiles["dataset"]["source_sha256"]["monthly_summary.csv"] = "changed"
            with self.assertRaises(DataError):
                build_history(root, profiles)

    def test_incomplete_account_count_and_missing_loans_fail(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            monthly_fixture().to_csv(root / "monthly_summary.csv", index=False)
            with self.assertRaises(DataError):
                build_profiles(root)
            loan_fixture().to_csv(root / "loans.csv", index=False)
            with self.assertRaises(DataError):
                build_profiles(root, expected_accounts=4500)


if __name__ == "__main__":
    unittest.main()
