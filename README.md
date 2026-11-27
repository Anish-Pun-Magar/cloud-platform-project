# Cloud Platform

Cloud Platform is a group project with an admin dashboard for managing workers and preparing uploaded CSV datasets.

## What it does

- Provides an admin sign-in and a dashboard for worker status and controls.
- Cleans uploaded CSV data with a Python processor.
- Produces a cleaned dataset, data splits, a schema, metadata, and review files for invalid rows and data quality issues.
- Lets an admin download the generated files from the dashboard.

## How dataset processing works

The React dashboard sends an uploaded CSV to the Node.js API at `/api/v1/datasets/upload`. The API checks the admin token, saves the upload temporarily, and runs `processing-engine/engine/processor.py`. The processor writes results under `processing-engine/data/output/<job-id>/`. The API returns the job details and provides authenticated downloads.

The processor also runs on a CSV file or a folder of CSV files:

```bash
python processing-engine/engine/processor.py input/ -o output/
```

Five example files are in `processing-engine/data/input/test_samples/`. They cover different delimiters, date formats, missing values, duplicates, and values that need review. Run them together with:

```bash
python processing-engine/engine/processor.py processing-engine/data/input/test_samples/ -o processing-engine/data/output/test-samples/
```

## Run locally

You need Node.js, Python 3, and PostgreSQL for the worker-management features.

1. Install the backend and frontend packages:

   ```bash
   npm install --prefix backend
   npm install --prefix frontend
   ```

2. Create `backend/.env` from `backend/.env.example` and set an admin token and PostgreSQL connection values.

3. Install the Python dependency:

   ```bash
   cd processing-engine
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   cd ..
   ```

4. Start the API in one terminal:

   ```bash
   cd backend
   npm run dev
   ```

5. Start the dashboard in another terminal:

   ```bash
   cd frontend
   npm run dev -- --host 0.0.0.0
   ```

Open the local address printed by Vite. Sign in using the same admin token configured in `backend/.env`. The frontend API address is set in `frontend/.env` or `VITE_API_BASE_URL`.

## Generated dataset files

Each processed dataset creates:

- `cleaned.csv`: rows that passed validation.
- `rejected_rows.csv`: invalid or duplicate rows with reasons.
- `data_quality_issues.csv`: missing values, outliers, and phone review flags.
- `train.csv`, `validation.csv`, and `test.csv`: deterministic data splits.
- `schema.json`, `metadata.json`, and `preprocessing_report.json`: dataset details and processing summary.

Phone numbers stay as text in `cleaned.csv`. When opening that CSV in Excel, import the phone column as **Text** to keep leading zeros and international prefixes visible.

More detail about the cleaner is in [docs/data-processing.md](docs/data-processing.md).

## Checks

```bash
python -m unittest discover -s processing-engine/tests -v
npm test --prefix backend
npm run build --prefix frontend
npm run lint --prefix frontend
```
