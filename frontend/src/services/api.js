const API_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiRequest(endpoint, token, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
      ...options.headers,
    },
  });

  const text = await response.text();

let data;

try {
  data = JSON.parse(text);
} catch {
  throw new Error(
    `Expected JSON but received HTML or invalid response. HTTP ${response.status}`
  );
}

  if (!response.ok) {
    throw new Error(data.message || "API request failed");
  }

  return data;
}