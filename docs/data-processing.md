# CSV processor

`processing-engine/engine/processor.py` cleans a CSV file or every CSV file in a folder. It keeps blank values blank, removes duplicates, checks common value types, flags unusual numbers, and saves invalid rows with a reason.

## Run a folder of CSV files

```bash
python processing-engine/engine/processor.py input/ -o output/
```

Each input CSV gets its own folder inside `output/`. For example, `input/orders.csv` creates `output/orders/cleaned.csv` and the related reports.

To remove duplicates using an ID or email column:

```bash
python processing-engine/engine/processor.py input/ -o output/ --key id
```

The dashboard continues to call the processor automatically when a CSV is uploaded.

## What it does

- Reads UTF-8, CP949, or Latin-1 files with comma, semicolon, or tab separators.
- Tidies column names and surrounding or repeated spaces; treats `N/A`, `null`, and `-` as blank.
- Converts recognizable numbers, dates, and yes/no values. It parses currency and percentages.
- Checks email and phone formats, age from 0 to 120, and non-negative prices.
- Lists IQR outliers and local/shared phone numbers in the quality report. It does not guess a phone country code.
- Saves invalid and duplicate rows to `rejected_rows.csv` with a reason. Other issues appear in `data_quality_issues.csv`.
- Writes cleaned data, train/validation/test splits, and a short report.

## Output files

`cleaned.csv`, `rejected_rows.csv`, `data_quality_issues.csv`, `train.csv`, `validation.csv`, `test.csv`, `schema.json`, `metadata.json`, and `preprocessing_report.json`.
