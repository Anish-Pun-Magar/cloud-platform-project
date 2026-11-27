const API_URL = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/+$/, "");

async function readJsonResponse(response) {
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The server returned an invalid response (HTTP " + response.status + ").");
  }
  if (!response.ok) throw new Error(data.message || "API request failed.");
  return data;
}

export async function verifyAdminToken(token) {
  const response = await fetch(API_URL + "/auth/verify", {
    method: "POST",
    headers: { "x-admin-token": token },
  });
  return readJsonResponse(response);
}

export async function apiRequest(endpoint, token, options = {}) {
  const response = await fetch(API_URL + endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
      ...options.headers,
    },
  });
  return readJsonResponse(response);
}

export async function uploadDataset(file, token) {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(API_URL + "/datasets/upload", {
    method: "POST",
    headers: { "x-admin-token": token },
    body,
  });
  return readJsonResponse(response);
}

export async function getDatasetJob(jobId, token) {
  const response = await fetch(API_URL + "/datasets/" + encodeURIComponent(jobId), {
    headers: { "x-admin-token": token },
  });
  return readJsonResponse(response);
}

export async function downloadDatasetFile(jobId, filename, token) {
  const url = API_URL + "/datasets/" + encodeURIComponent(jobId) +
    "/files/" + encodeURIComponent(filename);
  const response = await fetch(url, { headers: { "x-admin-token": token } });
  if (!response.ok) await readJsonResponse(response);

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
