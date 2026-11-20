import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import "./index.css";

function App() {
  const [token, setToken] = useState(
    sessionStorage.getItem("adminToken") || ""
  );

  function handleLogin(event) {
    event.preventDefault();
    sessionStorage.setItem("adminToken", token);
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
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />

          <button type="submit">Access Dashboard</button>
        </form>
      </div>
    );
  }

  return <Dashboard token={token} />;
}

export default App;