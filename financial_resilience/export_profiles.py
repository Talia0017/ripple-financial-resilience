"""Precompute the official challenge accounts for the public, static website.

Public use was confirmed by the organizers as reported by the project owner on
2026-11-07. Profiles retain the existing engine's full precision. A separate
compact history asset contains only month, money_in and money_out for each
account's most recent 12 recorded months; raw CSVs are never published.
"""

import argparse
from dataclasses import fields
import hashlib
import json
import math
from pathlib import Path

from data_access import DataError, default_data_dir, load_data
from engine import Customer, calculate_customer

ROOT = Path(__file__).resolve().parents[1]
COLUMNS = [field.name for field in fields(Customer)]


def build_profiles(data_dir: Path, expected_accounts=None):
    bundle = load_data(data_dir)
    if bundle.loans is None or bundle.warnings:
        raise DataError("A complete public export requires both valid official CSV files. Resolve the data-loading warnings first.")
    grouped_loans = dict(tuple(bundle.loans.groupby("account_id", sort=False)))
    no_loans = bundle.loans.iloc[:0]
    records = []
    for account_id, monthly in bundle.monthly.groupby("account_id", sort=True):
        customer = calculate_customer(monthly, grouped_loans.get(account_id, no_loans), account_id)
        records.append([getattr(customer, column) for column in COLUMNS])
    if expected_accounts is not None and len(records) != expected_accounts:
        raise DataError(f"Expected {expected_accounts} accounts but found {len(records)}. Incomplete data was not published.")
    return {
        "schema_version": 1,
        "dataset": {
            "title": "Sheridan Datathon 2026 — Tangerine Track",
            "account_count": len(records),
            "monthly_rows": len(bundle.monthly),
            "loan_rows": len(bundle.loans),
            "first_month": bundle.monthly["month"].min().strftime("%Y-%m"),
            "last_month": bundle.monthly["month"].max().strftime("%Y-%m"),
            "attribution": "Challenge datasets provided by Sheridan Datathon organizers and Tangerine Track data providers.",
            "permission": "Public use confirmed by organizers, as reported by the project owner on 2026-11-07; challenge data does not contain real customer records.",
            "source_sha256": {
                name: hashlib.sha256((Path(data_dir) / name).read_bytes()).hexdigest()
                for name in ("monthly_summary.csv", "loans.csv")
            },
        },
        "columns": COLUMNS,
        "rows": records,
    }


def write_profiles(payload, output: Path):
    # Full floating-point precision is retained; only the UI rounds for display.
    content = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    if not output.exists() or output.read_text(encoding="utf-8") != content:
        temporary = output.with_suffix(".json.tmp")
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(output)
    return len(content.encode("utf-8"))


def build_history(data_dir: Path, profiles):
    """Export recorded values, never inferred months or reconstructed medians."""
    bundle = load_data(data_dir)
    accounts = {}
    for account_id, rows in bundle.monthly.groupby("account_id", sort=True):
        accounts[account_id] = [
            [row.month.strftime("%Y-%m"),
             float(row.money_in) if math.isfinite(row.money_in) else None,
             float(row.money_out) if math.isfinite(row.money_out) else None]
            for row in rows.tail(12).itertuples()
        ]
    if set(accounts) != {row[0] for row in profiles["rows"]}:
        raise DataError("History and profile account IDs do not match.")
    hashes = {name: hashlib.sha256((Path(data_dir) / name).read_bytes()).hexdigest()
              for name in ("monthly_summary.csv", "loans.csv")}
    if hashes != profiles["dataset"]["source_sha256"]:
        raise DataError("Source files changed during export. Run the exporter again.")
    return {
        "schema_version": 1,
        "columns": ["month", "money_in", "money_out"],
        "dataset": {**profiles["dataset"], "currency": "CAD", "history_limit": 12,
                    "exported_rows": sum(map(len, accounts.values()))},
        "accounts": accounts,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=default_data_dir())
    parser.add_argument("--output", type=Path, default=ROOT / "public/data/profiles.json")
    parser.add_argument("--history-output", type=Path, default=None,
                        help="Defaults to history.json beside the profile output.")
    parser.add_argument("--expected-accounts", type=int, default=4500)
    args = parser.parse_args()
    payload = build_profiles(args.data_dir, args.expected_accounts)
    history = build_history(args.data_dir, payload)
    size = write_profiles(payload, args.output)
    print(f"Exported {payload['dataset']['account_count']} official account profiles; {size:,} bytes.")
    history_size = write_profiles(history, args.history_output or args.output.with_name("history.json"))
    print(f"Exported {history['dataset']['exported_rows']} recorded monthly cash flows; {history_size:,} bytes.")


if __name__ == "__main__":
    main()
