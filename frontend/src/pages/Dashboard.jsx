import { useEffect, useState, useCallback } from "react";
import {
  apiRequest,
  downloadDatasetFile,
  getDatasetJob,
  uploadDataset,
} from "../services/api";

function Dashboard({ token }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchWorkers = useCallback(async () => {
    try {
      const data = await apiRequest("/workers", token);
      setWorkers(data.workers);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const initialFetch = window.setTimeout(fetchWorkers, 0);
    const interval = setInterval(fetchWorkers, 15000);
    return () => {
      window.clearTimeout(initialFetch);
      clearInterval(interval);
    };
  }, [fetchWorkers]);

  async function toggleWorker(worker) {
    try {
      await apiRequest("/workers/" + worker.id, token, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !worker.enabled }),
      });
      fetchWorkers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deactivateWorker(worker) {
    if (!window.confirm("Deactivate " + worker.name + "?")) return;
    try {
      await apiRequest("/workers/" + worker.id, token, { method: "DELETE" });
      fetchWorkers();
    } catch (err) {
      setError(err.message);
    }
  }

  const online = workers.filter(
    (w) => w.enabled && w.status === "online",
  ).length;
  const offline = workers.filter(
    (w) => w.enabled && w.status === "offline",
  ).length;
  const disabled = workers.filter((w) => !w.enabled).length;

  if (loading) return <p className="loading">Loading dashboard...</p>;

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <h1>Cloud Platform</h1>
          <p>Dataset processing and distributed worker management</p>
        </div>
        <button
          className="logout"
          onClick={() => {
            sessionStorage.removeItem("adminToken");
            window.location.reload();
          }}
        >
          Logout
        </button>
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      <section className="stats" aria-label="Worker status">
        <Stat title="Total Workers" value={workers.length} />
        <Stat title="Online" value={online} />
        <Stat title="Offline" value={offline} />
        <Stat title="Disabled" value={disabled} />
      </section>

      <DatasetProcessing token={token} />

      <section className="worker-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Infrastructure</p>
            <h2>Worker Management</h2>
          </div>
          <button className="secondary-button" onClick={fetchWorkers}>
            Refresh
          </button>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Platform</th>
                <th>Architecture</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((worker) => (
                <tr key={worker.id}>
                  <td>{worker.name}</td>
                  <td>{worker.platform}</td>
                  <td>{worker.architecture || "Unknown"}</td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (!worker.enabled ? "disabled" : worker.status)
                      }
                    >
                      {!worker.enabled ? "Disabled" : worker.status}
                    </span>
                  </td>
                  <td>
                    {worker.last_seen_at
                      ? new Date(worker.last_seen_at).toLocaleString()
                      : "Never"}
                  </td>
                  <td>
                    <button
                      className="action"
                      onClick={() => toggleWorker(worker)}
                    >
                      {worker.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      className="delete"
                      onClick={() => deactivateWorker(worker)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr>
                  <td colSpan="6">No workers registered yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function DatasetProcessing({ token }) {
  const [file, setFile] = useState(null);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const jobId = sessionStorage.getItem("lastDatasetJob");
    if (!jobId) return;
    getDatasetJob(jobId, token)
      .then(setJob)
      .catch(() => {
        sessionStorage.removeItem("lastDatasetJob");
      });
  }, [token]);

  function chooseFile(event) {
    const selected = event.target.files && event.target.files[0];
    setError("");
    setNotice("");
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setError("Choose a .csv file.");
      event.target.value = "";
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setFile(null);
      setError("The CSV must be 10 MB or smaller.");
      event.target.value = "";
      return;
    }
    setFile(selected);
    setJob(null);
  }

  async function submitUpload(event) {
    event.preventDefault();
    if (!file || busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setNotice("Uploading and processing your dataset…");
    try {
      const result = await uploadDataset(file, token);
      setJob(result);
      sessionStorage.setItem("lastDatasetJob", result.jobId);
      setFile(null);
      form.reset();
      setNotice("Processing complete. Your dataset files are ready.");
    } catch (err) {
      setError(err.message);
      setNotice("");
    } finally {
      setBusy(false);
    }
  }

  async function downloadFile(filename) {
    setDownloading(filename);
    setError("");
    try {
      await downloadDatasetFile(job.jobId, filename, token);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading("");
    }
  }

  const metadata = job && job.results && job.results.metadata;
  const report = job && job.results && job.results.report;
  const files = job && job.generatedFiles ? job.generatedFiles : [];

  return (
    <section className="dataset-section" aria-labelledby="dataset-heading">
      <div className="section-heading dataset-heading">
        <div>
          <p className="eyebrow">Data preparation</p>
          <h2 id="dataset-heading">Process a dataset</h2>
          <p className="section-copy">
            Upload a CSV to clean missing values and duplicates, split the data,
            and generate a schema and processing report.
          </p>
        </div>
        <span className="pipeline-badge">CSV → Python → results</span>
      </div>

      <div className="dataset-grid">
        <form className="upload-card" onSubmit={submitUpload}>
          <label className="file-picker" htmlFor="dataset-file">
            <span className="file-icon" aria-hidden="true">
              ↑
            </span>
            <span>
              <strong>{file ? file.name : "Choose a CSV file"}</strong>
              <small>
                {file ? formatBytes(file.size) : "CSV format · up to 10 MB"}
              </small>
            </span>
            <span className="browse-button">Browse</span>
          </label>
          <input
            id="dataset-file"
            type="file"
            accept=".csv,text/csv"
            onChange={chooseFile}
            disabled={busy}
          />
          <button
            className="primary-button process-button"
            type="submit"
            disabled={!file || busy}
          >
            {busy ? "Processing…" : "Upload and process"}
          </button>
          <p className="privacy-note">
            Your original upload is removed after processing.
          </p>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="error dataset-error" role="alert">
              {error}
            </p>
          )}
        </form>

        <div className="results-card" aria-live="polite">
          {job ? (
            <>
              <div className="results-title">
                <div>
                  <p className="eyebrow">Completed job</p>
                  <h3>Results are ready</h3>
                </div>
                <span className="complete-badge">Complete</span>
              </div>
              <p className="job-id">Job {job.jobId}</p>
              {metadata && (
                <div className="result-metrics">
                  <Metric label="Clean rows" value={metadata.total_records} />
                  <Metric label="Columns" value={metadata.total_columns} />
                  <Metric
                    label="Duplicates removed"
                    value={report && report.duplicate_records_removed}
                  />
                  <Metric
                    label="Missing values handled"
                    value={report && report.missing_values_handled}
                  />
                </div>
              )}
              {report && report.rows_flagged > 0 && (
                <p className="quality-note">
                  {report.rows_flagged} row(s) have values to review. Invalid rows are saved separately.
                  Download data_quality_issues.csv or rejected_rows.csv for details.
                </p>
              )}
              <div className="file-list">
                <h4>Generated files</h4>
                {files.map((filename) => (
                  <div className="file-row" key={filename}>
                    <span>
                      <strong>{filename}</strong>
                      <small>{describeFile(filename)}</small>
                    </span>
                    <button
                      className="download-button"
                      onClick={() => downloadFile(filename)}
                      disabled={Boolean(downloading)}
                      aria-label={"Download " + filename}
                    >
                      {downloading === filename ? "…" : "Download"}
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-results">
              <span className="results-mark" aria-hidden="true">
                ✓
              </span>
              <h3>Results will appear here</h3>
              <p>
                After processing, review the generated files and download only
                the outputs you need.
              </p>
              <ul>
                <li>Cleaned dataset and train, validation, test splits</li>
                <li>
                  Column schema, dataset metadata, and preprocessing report
                </li>
                <li>Data quality issues report for values needing review</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function describeFile(filename) {
  const labels = {
    "cleaned.csv": "Cleaned full dataset",
    "train.csv": "Training split",
    "validation.csv": "Validation split",
    "test.csv": "Test split",
    "schema.json": "Column names and data types",
    "metadata.json": "Dataset and split counts",
    "preprocessing_report.json": "Cleaning summary",
    "data_quality_issues.csv": "Rows and values flagged for review",
    "rejected_rows.csv": "Invalid or duplicate rows with reasons",
  };
  return labels[filename] || "Generated dataset output";
}

function formatBytes(bytes) {
  return bytes < 1024
    ? bytes + " bytes"
    : (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function Metric({ label, value }) {
  return (
    <div className="result-metric">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

function Stat({ title, value }) {
  return (
    <div className="stat-card">
      <p>{title}</p>
      <h2>{value}</h2>
    </div>
  );
}

export default Dashboard;
