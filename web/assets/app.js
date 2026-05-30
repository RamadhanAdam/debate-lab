const state = {
  agents: [],
  reports: [],
  currentJob: null,
};

const els = {
  refreshBtn: document.querySelector("#refreshBtn"),
  topicInput: document.querySelector("#topicInput"),
  modeSelect: document.querySelector("#modeSelect"),
  roundsInput: document.querySelector("#roundsInput"),
  agentChecks: document.querySelector("#agentChecks"),
  runBtn: document.querySelector("#runBtn"),
  jobStatus: document.querySelector("#jobStatus"),
  inputFiles: document.querySelector("#inputFiles"),
  fileCount: document.querySelector("#fileCount"),
  inputEditor: document.querySelector("#inputEditor"),
  saveInputBtn: document.querySelector("#saveInputBtn"),
  reportSelect: document.querySelector("#reportSelect"),
  reportMeta: document.querySelector("#reportMeta"),
  reportView: document.querySelector("#reportView"),
  summaryBox: document.querySelector("#summaryBox"),
  scoresBox: document.querySelector("#scoresBox"),
  warningsBox: document.querySelector("#warningsBox"),
  scoreCount: document.querySelector("#scoreCount"),
  warningCount: document.querySelector("#warningCount"),
  resultMode: document.querySelector("#resultMode"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }
  return data;
}

function setStatus(text, kind = "idle") {
  els.jobStatus.textContent = text;
  els.jobStatus.className = `status ${kind}`;
}

function renderAgents() {
  els.agentChecks.innerHTML = "";
  state.agents.forEach((agent) => {
    const row = document.createElement("label");
    row.className = "check";
    row.innerHTML = `
      <span>${agent.name}</span>
      <input type="checkbox" value="${agent.id}" ${agent.id === "groq" ? "checked" : ""}>
    `;
    els.agentChecks.appendChild(row);
  });
}

function renderInputs(files) {
  els.fileCount.textContent = files.length;
  if (!files.length) {
    els.inputFiles.innerHTML = `<div class="muted">No supported files yet.</div>`;
    return;
  }
  els.inputFiles.innerHTML = files.map((file) => `
    <div class="file-item">
      <strong>${escapeHtml(file.path)}</strong><br>
      <span>${formatBytes(file.size)}</span>
    </div>
  `).join("");
}

function renderReports() {
  els.reportSelect.innerHTML = state.reports.map((report) => `
    <option value="${report.name}">${report.name}</option>
  `).join("");
}

function renderResult(result) {
  els.summaryBox.classList.remove("muted");
  els.summaryBox.textContent = result.summary || "No summary generated.";
  els.resultMode.textContent = result.mode || "-";

  const averages = result.agent_averages || {};
  const entries = Object.entries(averages);
  els.scoreCount.textContent = entries.length;
  if (!entries.length) {
    els.scoresBox.className = "score-list muted";
    els.scoresBox.textContent = "No scores yet.";
  } else {
    els.scoresBox.className = "score-list";
    els.scoresBox.innerHTML = entries.map(([agent, score]) => `
      <div class="score-row">
        <strong>${escapeHtml(agent)} · ${score.toFixed(2)}</strong>
        <div class="bar"><span style="width:${Math.max(0, Math.min(100, score * 100))}%"></span></div>
      </div>
    `).join("");
  }

  renderWarnings(result.warnings || []);
}

function renderWarnings(warnings) {
  els.warningCount.textContent = warnings.length;
  if (!warnings.length) {
    els.warningsBox.className = "warning-list muted";
    els.warningsBox.textContent = "No warnings.";
    return;
  }
  els.warningsBox.className = "warning-list";
  els.warningsBox.innerHTML = warnings.map((warning) => `
    <div class="warning-row">${escapeHtml(warning)}</div>
  `).join("");
}

async function loadStatus() {
  const status = await api("/api/status");
  state.agents = status.agents;
  els.roundsInput.value = status.default_rounds || 1;
  renderAgents();
  renderInputs(status.input_files || []);
}

async function loadReports(selectedName = null) {
  const data = await api("/api/reports");
  state.reports = data.reports || [];
  renderReports();
  if (state.reports.length) {
    els.reportSelect.value = selectedName || state.reports[0].name;
    await loadReport(els.reportSelect.value);
  } else {
    els.reportView.textContent = "";
    els.reportMeta.textContent = "No report loaded";
  }
}

async function loadReport(name) {
  if (!name) return;
  const data = await api(`/api/report?name=${encodeURIComponent(name)}`);
  els.reportMeta.textContent = data.name;
  els.reportView.innerHTML = marked.parse(data.content);
}

async function saveInput() {
  setStatus("Saving input...", "running");
  const result = await api("/api/input", {
    method: "POST",
    body: JSON.stringify({
      name: "web_brief.md",
      content: els.inputEditor.value,
    }),
  });
  setStatus(`Saved ${result.file.path}`, "completed");
  const inputs = await api("/api/inputs");
  renderInputs(inputs.files || []);
}

function selectedAgents() {
  return [...els.agentChecks.querySelectorAll("input:checked")].map((input) => input.value);
}

async function runDebate() {
  const agents = selectedAgents();
  if (!agents.length) {
    setStatus("Choose at least one agent", "failed");
    return;
  }

  await saveInput();
  setStatus("Starting debate...", "running");
  const data = await api("/api/run", {
    method: "POST",
    body: JSON.stringify({
      topic: els.topicInput.value,
      mode: els.modeSelect.value,
      rounds: Number(els.roundsInput.value),
      agents,
    }),
  });
  state.currentJob = data.job_id;
  pollJob(data.job_id);
}

async function pollJob(jobId) {
  const job = await api(`/api/jobs/${jobId}`);
  if (job.status === "queued" || job.status === "running") {
    setStatus(`Debate ${job.status}...`, "running");
    window.setTimeout(() => pollJob(jobId), 1800);
    return;
  }
  if (job.status === "failed") {
    setStatus(job.error || "Debate failed", "failed");
    return;
  }

  setStatus("Debate complete", "completed");
  renderResult(job.result || {});
  const artifact = job.result?.artifact_path?.split("/").pop();
  await loadReports(artifact);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.refreshBtn.addEventListener("click", async () => {
  setStatus("Refreshing...", "running");
  await loadStatus();
  await loadReports();
  setStatus("Ready", "idle");
});

els.saveInputBtn.addEventListener("click", () => {
  saveInput().catch((error) => setStatus(error.message, "failed"));
});

els.runBtn.addEventListener("click", () => {
  runDebate().catch((error) => setStatus(error.message, "failed"));
});

els.reportSelect.addEventListener("change", () => {
  loadReport(els.reportSelect.value).catch((error) => setStatus(error.message, "failed"));
});

(async function init() {
  try {
    await loadStatus();
    await loadReports();
    setStatus("Ready", "idle");
  } catch (error) {
    setStatus(error.message, "failed");
  }
})();
