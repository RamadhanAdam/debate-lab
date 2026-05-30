export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
  return data;
}

export async function fetchStatus() {
  return api("/api/status");
}

export async function fetchInputs() {
  return api("/api/inputs");
}

export async function saveInput(name, content) {
  return api("/api/input", {
    method: "POST",
    body: JSON.stringify({ name, content }),
  });
}

export async function deleteInput(name) {
  return api("/api/input", {
    method: "DELETE",
    body: JSON.stringify({ name }),
  });
}

export async function fetchReports() {
  return api("/api/reports");
}

export async function fetchReport(name) {
  return api(\`/api/report?name=\${encodeURIComponent(name)}\`);
}

export async function deleteReportReq(name) {
  return api("/api/report", {
    method: "DELETE",
    body: JSON.stringify({ name }),
  });
}

export async function cloneRepoReq(url) {
  return api("/api/repo/clone", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function runDebateReq(payload) {
  return api("/api/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function pollJobReq(jobId) {
  return api(\`/api/jobs/\${jobId}\`);
}

export async function saveReportReq(jobId) {
  return api(\`/api/save_report/\${jobId}\`, { method: "POST" });
}

export async function sendChatReq(payload) {
  return api("/api/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function validateKeyReq(provider, key) {
  return api("/api/validate-key", {
    method: "POST",
    body: JSON.stringify({ provider, key })
  });
}

export async function fetchAgentStats() {
  return api("/api/agent-stats");
}

export async function fetchSessions() {
  return api("/api/sessions");
}

export async function submitHumanInputReq(jobId, text) {
  return api(\`/api/jobs/\${jobId}/human-input\`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
}
