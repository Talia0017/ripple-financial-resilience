"""Streamlit widget integration checks, using explicitly synthetic CSVs."""

from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import pandas as pd
from streamlit.testing.v1 import AppTest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_engine import monthly_fixture, loan_fixture

APP = Path(__file__).resolve().parents[1] / "app.py"


class AppTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        rows = pd.concat([monthly_fixture(), monthly_fixture(account="002").assign(money_out=1000)])
        rows.to_csv(self.folder / "monthly_summary.csv", index=False)
        loan_fixture().to_csv(self.folder / "loans.csv", index=False)
        self.env = patch.dict("os.environ", {"RESILIENCE_DATA_DIR": str(self.folder)})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def app(self):
        app = AppTest.from_file(str(APP), default_timeout=15).run()
        self.assertEqual(len(app.exception), 0)
        return app

    def choose(self):
        app = self.app()
        self.assertEqual(app.selectbox[0].options, ["001", "002"])
        app.selectbox[0].select("001").run()
        self.assertEqual(len(app.exception), 0)
        return app

    def test_initial_lookup_and_financial_overview(self):
        app = self.choose()
        self.assertEqual(app.metric[0].value, "3,000.00")
        self.assertEqual(app.metric[1].value, "2,500.00")
        self.assertEqual(app.metric[5].value, "200.00")
        self.assertEqual(app.metric[6].value, "No shortfall (120+)")

    def test_combine_and_adjust_controls(self):
        app = self.choose()
        app.checkbox(key="job_loss").check().run()
        self.assertEqual(app.metric[-1].value, "5.9 months")
        app.checkbox(key="higher_bills").check().run()
        app.checkbox(key="emergency_repair").check().run()
        self.assertEqual(app.number_input(key="repair_cost").value, 2500)
        self.assertEqual(app.metric[-1].value, "2.7 months")
        app.slider(key="ei_rate").set_value(80).run()
        app.number_input(key="bill_rate").set_value(50.0).run()
        app.number_input(key="repair_cost").set_value(1234.0).run()
        self.assertEqual(app.metric[-1].value, "10.8 months")
        self.assertEqual(len(app.exception), 0)

    def test_reset_and_switch_account(self):
        app = self.choose()
        app.checkbox(key="job_loss").check().run()
        app.slider(key="ei_rate").set_value(20).run()
        app.checkbox(key="emergency_repair").check().run()
        app.number_input(key="repair_cost").set_value(9999.0).run()
        self.assertEqual(app.metric[-1].value, "0.0 months")
        app.button[0].click().run()
        self.assertFalse(app.checkbox(key="job_loss").value)
        self.assertFalse(app.checkbox(key="emergency_repair").value)
        self.assertEqual(app.slider(key="ei_rate").value, 55)
        self.assertEqual(app.number_input(key="bill_rate").value, 15)
        self.assertEqual(app.number_input(key="repair_cost").value, 2500)
        app.checkbox(key="job_loss").check().run()
        app.selectbox[0].select("002").run()
        self.assertFalse(app.checkbox(key="job_loss").value)
        self.assertEqual(app.number_input(key="repair_cost").value, 1000)
        self.assertEqual(len(app.exception), 0)

    def test_missing_files_have_readable_messages(self):
        (self.folder / "monthly_summary.csv").unlink()
        app = self.app()
        self.assertTrue(app.error)
        self.assertIn("monthly_summary.csv", app.error[0].value)

    def test_missing_loans_still_allows_simulation(self):
        (self.folder / "loans.csv").unlink()
        app = self.choose()
        self.assertEqual(app.metric[5].value, "Unavailable")
        app.checkbox(key="job_loss").check().run()
        self.assertEqual(app.metric[-1].value, "5.9 months")

    def test_missing_income_blocks_simulation(self):
        monthly_fixture().assign(money_in=None).to_csv(self.folder / "monthly_summary.csv", index=False)
        app = self.app()
        app.selectbox[0].select("001").run()
        self.assertTrue(app.error)
        self.assertEqual(len(app.checkbox), 0)
        self.assertEqual(len(app.exception), 0)

    def test_missing_bills_disables_only_bill_shock(self):
        monthly_fixture().assign(household_bills=None).to_csv(self.folder / "monthly_summary.csv", index=False)
        app = self.app()
        app.selectbox[0].select("001").run()
        self.assertTrue(app.checkbox(key="higher_bills").disabled)
        app.checkbox(key="job_loss").check().run()
        self.assertEqual(app.metric[-1].value, "5.9 months")
        self.assertEqual(len(app.exception), 0)


if __name__ == "__main__":
    unittest.main()
