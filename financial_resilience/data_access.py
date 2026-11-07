"""CSV loading and explicit validation. No silent demo-data fallback."""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple
import os

import pandas as pd


MONTHLY_NUMERIC = ("money_in", "money_out", "household_bills", "insurance", "loan_payments", "avg_daily_balance")
MONTHLY_REQUIRED = ("account_id", "month") + MONTHLY_NUMERIC
LOAN_REQUIRED = ("account_id", "monthly_payment", "status", "loan_start")


class DataError(ValueError):
    pass


@dataclass
class DataBundle:
    monthly: pd.DataFrame
    loans: Optional[pd.DataFrame]
    warnings: Tuple[str, ...]


def default_data_dir() -> Path:
    configured = os.environ.get("RESILIENCE_DATA_DIR")
    return Path(configured).expanduser().resolve() if configured else Path(__file__).resolve().parent.parent / "data"


def _read_csv(path: Path, required) -> pd.DataFrame:
    try:
        frame = pd.read_csv(path, dtype=str, encoding="utf-8-sig", keep_default_na=False)
    except (OSError, UnicodeError, pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        raise DataError(f"Could not read {path.name}: {exc}") from exc
    missing = sorted(set(required) - set(frame.columns))
    if missing:
        raise DataError(f"{path.name} is missing required columns: {', '.join(missing)}")
    return frame


def _numeric(series: pd.Series) -> pd.Series:
    numbers = pd.to_numeric(series, errors="coerce")
    return numbers.replace([float("inf"), -float("inf")], float("nan"))


def prepare_monthly(frame: pd.DataFrame) -> Tuple[pd.DataFrame, Tuple[str, ...]]:
    missing = set(MONTHLY_REQUIRED) - set(frame.columns)
    if missing:
        raise DataError(f"The monthly summary is missing required columns: {', '.join(sorted(missing))}")
    frame = frame.copy()
    frame["account_id"] = frame["account_id"].astype("string").str.strip()
    text_month = frame["month"].astype("string").str.strip()
    valid_format = text_month.str.fullmatch(r"\d{4}-\d{2}", na=False)
    frame["month"] = pd.to_datetime(text_month.where(valid_format), format="%Y-%m", errors="coerce")
    bad_key = frame["account_id"].isna() | frame["account_id"].eq("") | frame["month"].isna()
    count = int(bad_key.sum())
    warnings = (f"Excluded {count} monthly rows with missing account IDs or invalid months. Account results may be incomplete.",) if count else ()
    frame = frame.loc[~bad_key].copy()
    if frame.empty:
        raise DataError("The monthly summary has no usable account and month records.")
    if frame.duplicated(["account_id", "month"]).any():
        raise DataError("The monthly summary contains duplicate account/month records. Correct the duplicates before calculating medians or buffers.")
    for column in MONTHLY_NUMERIC:
        frame[column] = _numeric(frame[column])
    return frame.sort_values(["account_id", "month"]).reset_index(drop=True), warnings


def prepare_loans(frame: pd.DataFrame) -> pd.DataFrame:
    missing = set(LOAN_REQUIRED) - set(frame.columns)
    if missing:
        raise DataError(f"The loans file is missing required columns: {', '.join(sorted(missing))}")
    frame = frame.copy()
    frame["account_id"] = frame["account_id"].astype("string").str.strip()
    if (frame["account_id"].isna() | frame["account_id"].eq("")).any():
        raise DataError("The loans file contains records without an account_id, so loans cannot be matched reliably.")
    if "loan_id" in frame:
        loan_ids = frame["loan_id"].astype("string").str.strip()
        known = loan_ids.notna() & loan_ids.ne("")
        if loan_ids[known].duplicated().any():
            raise DataError("The loans file contains duplicate loan_id values. Monthly payments must not be counted twice.")
    if frame.duplicated().any():
        raise DataError("The loans file contains duplicate records. Monthly payments must not be counted twice.")
    frame["status"] = frame["status"].astype("string").str.strip().str.upper().fillna("")
    frame["loan_start"] = pd.to_datetime(frame["loan_start"], format="%Y-%m-%d", errors="coerce")
    frame["monthly_payment"] = _numeric(frame["monthly_payment"])
    frame.loc[frame["monthly_payment"] < 0, "monthly_payment"] = float("nan")
    return frame


def load_data(data_dir: Path) -> DataBundle:
    data_dir = Path(data_dir)
    monthly_path = data_dir / "monthly_summary.csv"
    if not monthly_path.is_file():
        raise DataError(f"Required file not found: {monthly_path}\nPlace the official monthly_summary.csv and loans.csv files in this data directory. The app does not generate sample accounts.")
    monthly, warnings = prepare_monthly(_read_csv(monthly_path, MONTHLY_REQUIRED))
    loans_path = data_dir / "loans.csv"
    try:
        if not loans_path.is_file():
            raise DataError(f"File not found: {loans_path}. Add the official loans.csv file.")
        loans = prepare_loans(_read_csv(loans_path, LOAN_REQUIRED))
    except DataError as exc:
        loans = None
        warnings += (f"Loan data is unavailable: {exc} Loan payment P will be shown as unknown.",)
    return DataBundle(monthly, loans, warnings)
