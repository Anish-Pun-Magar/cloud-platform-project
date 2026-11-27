"""Basic CSV cleaning used by both the dashboard and the command line."""

import argparse
import csv
import json
import logging
import re
import sys
from pathlib import Path

import pandas as pd

LOG = logging.getLogger("csv_cleaner")
MISSING = {"", "n/a", "na", "null", "none", "nan", "-"}
EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE = re.compile(r"^\+?[0-9().\s-]+$")
YES = {"yes", "y", "true", "1"}
NO = {"no", "n", "false", "0"}
FILES = ["cleaned.csv", "train.csv", "validation.csv", "test.csv", "schema.json",
         "metadata.json", "preprocessing_report.json", "data_quality_issues.csv", "rejected_rows.csv"]


def read_csv(path):
    """Read the supported encodings and detect comma, semicolon, or tab."""
    raw = Path(path).read_bytes()
    for encoding in ("utf-8-sig", "cp949", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    sample = "\n".join(text.splitlines()[:10])
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=",;\t").delimiter
    except csv.Error:
        delimiter = ","
    data = pd.read_csv(pd.io.common.StringIO(text), sep=delimiter, dtype="string", keep_default_na=False)
    return data, encoding, delimiter


def clean_column_name(name):
    name = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(name).strip())
    name = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()
    return name or "column"


def clean_text(value):
    return re.sub(r"\s+", " ", str(value)).strip()


def number(value):
    text = str(value).replace(",", "").strip()
    percent = text.endswith("%")
    text = re.sub(r"[$€£¥₩₹%]", "", text).strip()
    if not re.fullmatch(r"[-+]?(?:\d+\.?\d*|\.\d+)", text):
        return pd.NA
    value = float(text)
    return value / 100 if percent else value


def date(value):
    return pd.to_datetime(value, errors="coerce", format="mixed")


def kind_for(column, values):
    name = column.lower()
    if "email" in name:
        return "email"
    if any(word in name for word in ("phone", "mobile", "telephone")):
        return "phone"
    if any(word in name for word in ("date", "time")):
        return "date"
    if any(word in name for word in ("active", "enabled", "approved", "paid", "boolean")):
        return "bool"
    if any(word in name for word in ("id", "code", "zip", "postal")):
        return None
    if len(values):
        if values.map(number).notna().mean() >= .9:
            return "number"
        if values.map(date).notna().mean() >= .9:
            return "date"
        if values.str.lower().isin(YES | NO).mean() >= .9:
            return "bool"
    return None


def clean_data(data, key=None):
    """Return clean rows, review issues, rejected rows, and a short report."""
    before = len(data)
    data.columns = [clean_column_name(name) for name in data.columns]
    if data.columns.duplicated().any():
        raise ValueError("Column names repeat after cleanup. Rename them in the source CSV.")

    for column in data:
        values = data[column].map(clean_text)
        data[column] = values.mask(values.str.lower().isin(MISSING), pd.NA).astype("string")
    data = data.dropna(axis=0, how="all").dropna(axis=1, how="all").copy()

    issues = []
    invalid = pd.Series(False, index=data.index)
    reasons = pd.Series("", index=data.index, dtype="string")
    for column in data:
        for row in data.index[data[column].isna()]:
            issues.append({"row_number": row + 2, "column": column, "issue": "missing_value"})

    for column in list(data.columns):
        kind = kind_for(column, data[column].dropna())
        if not kind:
            continue
        raw = data[column]
        if kind == "email":
            values = raw.str.lower()
            valid = values.str.fullmatch(EMAIL, na=False)
            bad = raw.notna() & ~valid
            data[column] = values.where(valid, pd.NA)
        elif kind == "phone":
            valid = raw.str.fullmatch(PHONE, na=False) & raw.str.count(r"\d").between(7, 15)
            bad = raw.notna() & ~valid
            cleaned = raw.map(lambda value: re.sub(r"[^\d+]", "", value) if not pd.isna(value) else pd.NA)
            for row in data.index[raw.notna() & valid & ~raw.str.startswith("+", na=False)]:
                issues.append({"row_number": row + 2, "column": column, "issue": "local_phone_no_country_code"})
            data[column] = cleaned.astype("string")
        elif kind == "number":
            values = raw.map(number).astype("Float64")
            bad = raw.notna() & values.isna()
            if "age" in column:
                range_error = values.notna() & ~values.between(0, 120)
            elif "price" in column:
                range_error = values.notna() & values.lt(0)
            else:
                range_error = pd.Series(False, index=data.index)
            bad |= range_error
            data[column] = values
            if values.dropna().map(float.is_integer).all():
                data[column] = values.astype("Int64")
            for row in data.index[range_error]:
                reasons.loc[row] += f"{column} outside allowed range; "
        elif kind == "bool":
            values = raw.str.lower().map(lambda value: True if value in YES else False if value in NO else pd.NA).astype("boolean")
            bad = raw.notna() & values.isna()
            data[column] = values
        else:
            values = raw.map(date)
            bad = raw.notna() & values.isna()
            data[column] = values.dt.strftime("%Y-%m-%d").astype("string")

        invalid |= bad
        for row in data.index[bad]:
            reasons.loc[row] += f"invalid {kind} in {column}; "

    # Record unusually high or low numeric values using the standard IQR rule.
    for column in data.select_dtypes(include="number"):
        values = pd.to_numeric(data[column], errors="coerce").where(~invalid)
        q1, q3 = values.quantile([.25, .75])
        spread = q3 - q1
        flagged = values.notna() & ((values < q1 - 1.5 * spread) | (values > q3 + 1.5 * spread)) if pd.notna(spread) else False
        for row in data.index[flagged]:
            issues.append({"row_number": row + 2, "column": column, "issue": "numeric_outlier"})

    rejected = data.loc[invalid].copy()
    if not rejected.empty:
        rejected.insert(0, "rejection_reason", reasons.loc[invalid].str.rstrip("; "))
    data = data.loc[~invalid].copy()

    phone = next((column for column in data if column in {"phone", "phone_number", "mobile", "mobile_number", "telephone"}), None)
    name = next((column for column in data if column in {"name", "full_name", "customer_name"}), None)
    if phone and name:
        for phone_value, group in data[data[phone].notna()].groupby(phone):
            if group[name].dropna().astype(str).str.casefold().nunique() > 1:
                for row in group.index:
                    issues.append({"row_number": row + 2, "column": phone, "issue": "shared_phone_number"})

    subset = [clean_column_name(item) for item in key.split(",")] if key else None
    if subset and not set(subset).issubset(data.columns):
        raise ValueError("Duplicate key column not found: " + ", ".join(subset))
    duplicate = data.duplicated(subset=subset, keep="first")
    removed = data.loc[duplicate].copy()
    if not removed.empty:
        removed.insert(0, "rejection_reason", "duplicate row/key")
        rejected = pd.concat([rejected, removed], ignore_index=True)
    data = data.loc[~duplicate].copy()

    report = {"rows_before": before, "rows_after": len(data), "rows_rejected": len(rejected),
              "duplicate_records_removed": int(duplicate.sum()), "missing_values_handled": sum(i["issue"] == "missing_value" for i in issues),
              "rows_flagged": len({i["row_number"] for i in issues}) + len(rejected),
              "changes": ["Cleaned column names and spaces", "Standardized missing markers",
                          "Converted recognizable values", "Removed duplicate rows",
                          "Flagged IQR outliers"],
              "status": "completed_with_review_items" if issues or len(rejected) else "completed"}
    return data.reset_index(drop=True), pd.DataFrame(issues), rejected.reset_index(drop=True), report


def split_data(data):
    if len(data) < 3:
        return data, data.iloc[:0], data.iloc[:0]
    data = data.sample(frac=1, random_state=42)
    test_size = max(1, round(len(data) * .15))
    validation_size = max(1, round(len(data) * .15))
    return data.iloc[:-(test_size + validation_size)], data.iloc[-(test_size + validation_size):-test_size], data.iloc[-test_size:]


def process_dataset(input_file, output_file, key=None):
    source, encoding, delimiter = read_csv(input_file)
    data, issues, rejected, report = clean_data(source, key=key)
    report.update({"encoding": encoding, "delimiter": "tab" if delimiter == "\t" else delimiter})
    folder = Path(output_file).parent
    folder.mkdir(parents=True, exist_ok=True)
    data.to_csv(output_file, index=False, na_rep="")
    issues.to_csv(folder / "data_quality_issues.csv", index=False)
    rejected.to_csv(folder / "rejected_rows.csv", index=False, na_rep="")
    train, validation, test = split_data(data)
    for name, frame in (("train.csv", train), ("validation.csv", validation), ("test.csv", test)):
        frame.to_csv(folder / name, index=False, na_rep="")
    schema = {"columns": [{"name": name, "data_type": str(data[name].dtype)} for name in data.columns]}
    metadata = {"source_file": Path(input_file).name, "total_records": len(data), "total_columns": len(data.columns), "generated_files": FILES}
    for name, value in (("schema.json", schema), ("metadata.json", metadata), ("preprocessing_report.json", report)):
        (folder / name).write_text(json.dumps(value, indent=2, default=str), encoding="utf-8")
    LOG.info("%s: kept %s rows; rejected %s", input_file, len(data), len(rejected))
    return report


def run(input_path, output_dir, key=None):
    source = Path(input_path)
    files = sorted(source.glob("*.csv")) if source.is_dir() else [source]
    if not files:
        raise FileNotFoundError(f"No CSV files found: {source}")
    for file in files:
        folder = Path(output_dir) / file.stem if source.is_dir() else Path(output_dir)
        process_dataset(file, folder / "cleaned.csv", key=key)


def main():
    parser = argparse.ArgumentParser(description="Clean one CSV or a folder of CSV files.")
    parser.add_argument("input", help="CSV file or input folder")
    parser.add_argument("-o", "--output", required=True, help="Output folder")
    parser.add_argument("--key", help="Optional column(s) for duplicate removal, e.g. email or id")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    run(args.input, args.output, key=args.key)


if __name__ == "__main__":
    if len(sys.argv) == 3 and Path(sys.argv[1]).is_file():
        process_dataset(sys.argv[1], sys.argv[2])  # Existing dashboard call
    else:
        main()
