"""Precompute the official challenge accounts for the public, static website.

Public use was confirmed by the organizers as reported by the project owner on
2026-11-07. No fabricated fallback or raw monthly records are exported.
"""

import argparse
from dataclasses import fields
import hashlib
import json
from pathlib import Path

from data_access import DataError, default_data_dir, load_data
from engine import Customer, calculate_customer

ROOT = Path(__file__).resolve().parents[1]
COLUMNS = [field.name for field in fields(Customer)]


def build_profiles(data_dir: Path, expected_accounts=None):
    bundle = load_data(data_dir)
    if bundle.loans is None or bundle.warnings:
        raise DataError("完整公开导出需要有效的两份官方 CSV，请先解决数据读取警告。")
    grouped_loans = dict(tuple(bundle.loans.groupby("account_id", sort=False)))
    no_loans = bundle.loans.iloc[:0]
    records = []
    for account_id, monthly in bundle.monthly.groupby("account_id", sort=True):
        customer = calculate_customer(monthly, grouped_loans.get(account_id, no_loans), account_id)
        records.append([getattr(customer, column) for column in COLUMNS])
    if expected_accounts is not None and len(records) != expected_accounts:
        raise DataError(f"预期 {expected_accounts} 个账户，实际有 {len(records)} 个；未发布不完整数据。")
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=default_data_dir())
    parser.add_argument("--output", type=Path, default=ROOT / "public/data/profiles.json")
    parser.add_argument("--expected-accounts", type=int, default=4500)
    args = parser.parse_args()
    payload = build_profiles(args.data_dir, args.expected_accounts)
    size = write_profiles(payload, args.output)
    print(f"Exported {payload['dataset']['account_count']} official account profiles; {size:,} bytes.")


if __name__ == "__main__":
    main()
