import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "../services/api";

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
    fetchWorkers();

    const interval = setInterval(fetchWorkers, 15000);
    return () => clearInterval(interval);
  }, [fetchWorkers]);

  async function toggleWorker(worker) {
    try {
      await apiRequest(`/workers/${worker.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !worker.enabled }),
      });

      fetchWorkers();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deactivateWorker(worker) {
    if (!window.confirm(`Deactivate ${worker.name}?`)) return;

    try {
      await apiRequest(`/workers/${worker.id}`, token, {
        method: "DELETE",
      });

      fetchWorkers();
    } catch (err) {
      setError(err.message);
    }
  }

  const online = workers.filter(
    (w) => w.enabled && w.status === "online"
  ).length;

  const offline = workers.filter(
    (w) => w.enabled && w.status === "offline"
  ).length;

  const disabled = workers.filter((w) => !w.enabled).length;

  if (loading) return <p className="loading">Loading dashboard...</p>;

  return (
    <main className="dashboard">
      <header className="topbar">
        <div>
          <h1>Cloud Platform</h1>
          <p>Distributed Worker Management</p>
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

      {error && <div className="error">{error}</div>}

      <section className="stats">
        <Stat title="Total Workers" value={workers.length} />
        <Stat title="Online" value={online} />
        <Stat title="Offline" value={offline} />
        <Stat title="Disabled" value={disabled} />
      </section>

      <section className="worker-section">
        <div className="section-heading">
          <h2>Worker Management</h2>
          <button onClick={fetchWorkers}>Refresh</button>
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
                    <span className={`badge ${
                      !worker.enabled
                        ? "disabled"
                        : worker.status
                    }`}>
                      {!worker.enabled
                        ? "Disabled"
                        : worker.status}
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

function Stat({ title, value }) {
  return (
    <div className="stat-card">
      <p>{title}</p>
      <h2>{value}</h2>
    </div>
  );
}

export default Dashboard;