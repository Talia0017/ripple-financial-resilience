"""Verify every shipped account and compare browser shock logic to Python."""

from dataclasses import fields
from itertools import product
import json
import math
from pathlib import Path
import subprocess

from data_access import default_data_dir, load_data
from engine import Customer, Scenario, calculate_customer, simulate

ROOT = Path(__file__).resolve().parents[1]


def check_number(actual, expected):
    assert math.isclose(actual, expected, rel_tol=1e-10, abs_tol=1e-8), (actual, expected)


def main():
    payload = json.loads((ROOT / "public/data/profiles.json").read_text(encoding="utf-8"))
    names = [field.name for field in fields(Customer)]
    assert payload["columns"] == names
    exported = {row[0]: dict(zip(names, row)) for row in payload["rows"]}
    assert len(exported) == len(payload["rows"]) == payload["dataset"]["account_count"] == 4500
    bundle = load_data(default_data_dir())
    assert bundle.loans is not None and not bundle.warnings
    assert set(exported) == set(bundle.monthly["account_id"])
    loan_groups = dict(tuple(bundle.loans.groupby("account_id", sort=False)))
    history = json.loads((ROOT / "public/data/history.json").read_text(encoding="utf-8"))
    assert set(history["accounts"]) == set(exported)
    assert history["dataset"]["source_sha256"] == payload["dataset"]["source_sha256"]
    history_checks = 0
    people = {}
    for account_id, rows in bundle.monthly.groupby("account_id", sort=True):
        person = calculate_customer(rows, loan_groups.get(account_id, bundle.loans.iloc[:0]), account_id)
        people[account_id] = person
        shipped = history["accounts"][account_id]
        assert len(shipped) == min(len(rows), 12)
        for actual_row, original in zip(shipped, rows.tail(12).itertuples()):
            assert actual_row[0] == original.month.strftime("%Y-%m")
            for actual_value, expected_value in zip(actual_row[1:], (original.money_in, original.money_out)):
                if math.isfinite(expected_value):
                    check_number(actual_value, expected_value)
                else:
                    assert actual_value is None
            history_checks += 1
        for name in names:
            actual, expected = exported[account_id][name], getattr(person, name)
            if isinstance(expected, float):
                check_number(actual, expected)
            elif name == "warnings":
                assert actual == list(expected)
            else:
                assert actual == expected
    scenarios = [dict(job_loss=job, ei_rate=.55, higher_bills=bills, bill_increase_rate=.15, emergency_repair=repair, repair_cost="S") for job, bills, repair in product((False, True), repeat=3)]
    scenarios += [
        dict(job_loss=True, ei_rate=.8, higher_bills=True, bill_increase_rate=.5, emergency_repair=True, repair_cost=1234),
        dict(job_loss=True, ei_rate=0),
        dict(job_loss=True, ei_rate=1),
        dict(emergency_repair=True, repair_cost="over_buffer"),
    ]
    completed = subprocess.run(["node", "tests/web/export-scenarios.mjs"], cwd=ROOT, input=json.dumps({"payload": payload, "scenarios": scenarios}, allow_nan=False), capture_output=True, text=True, check=True)
    browser_results = iter(json.loads(completed.stdout))
    checked = 0
    for row in payload["rows"]:
        person = people[row[0]]
        for specification in scenarios:
            options = dict(specification)
            if options.get("repair_cost") == "S":
                options["repair_cost"] = person.spending
            elif options.get("repair_cost") == "over_buffer":
                options["repair_cost"] = max(person.buffer, 0) + 1
            expected = simulate(person, Scenario(**options))
            actual = next(browser_results)
            for value, name in zip(actual[:7], ("income", "spending", "one_off_costs", "buffer_left", "gap", "runway", "monthly_shortfall")):
                check_number(value, getattr(expected, name))
            assert actual[7:] == [expected.no_shortfall, expected.capped, expected.runway_label], (person.account_id, specification, actual, expected)
            checked += 1
    assert next(browser_results, None) is None
    assert history_checks == history["dataset"]["exported_rows"]
    print(json.dumps({"accounts_verified": len(exported), "metric_checks": len(exported) * 6, "recorded_months_verified": history_checks, "browser_python_scenarios": checked, "result": "all profiles, recorded cash flows, numeric results and runway labels match the original source and Python engine"}, indent=2))


if __name__ == "__main__":
    main()
