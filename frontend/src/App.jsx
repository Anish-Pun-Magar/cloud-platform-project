import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import { verifyAdminToken } from "./services/api";
import "./index.css";

function App() {
  const [token, setToken] = useState(sessionStorage.getItem("adminToken") || "");
  const [tokenInput, setTokenInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [checkingToken, setCheckingToken] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setCheckingToken(true);
    setLoginError("");

    try {
      await verifyAdminToken(tokenInput);
      sessionStorage.setItem("adminToken", tokenInput);
      setToken(tokenInput);
      setTokenInput("");
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setCheckingToken(false);
    }
  }

  if (!token) {
    return (
      <div className="login-container">
        <form onSubmit={handleLogin} className="login-card">
          <h2>Cloud Platform</h2>
          <p>Administrator access</p>
          <input
            type="password"
            placeholder="Enter admin token"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
            autoComplete="current-password"
            required
          />
          {loginError && <p className="login-error" role="alert">{loginError}</p>}
          <button type="submit" disabled={checkingToken}>
            {checkingToken ? "Checking…" : "Access Dashboard"}
          </button>
        </form>
      </div>
    );
  }

  return <Dashboard token={token} />;
}

export default App;
