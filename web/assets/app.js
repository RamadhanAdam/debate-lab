const { createApp, ref, computed, reactive, onMounted, watch } = Vue;

// ── Agent metadata ──────────────────────────────────────────
const AGENT_META = {
  gpt: { emoji: "🎓", name: "GPT-4.1", cls: "gpt", color: "#10a37f" },
  groq: { emoji: "🦙", name: "Llama 3.3 (Groq)", cls: "groq", color: "#f55036" },
  gemini: { emoji: "✨", name: "Gemini Flash", cls: "gemini", color: "#4285f4" },
  human: { emoji: "🧑‍🎓", name: "You", cls: "human", color: "#d4a017" },
};

const AVATAR_EMOJIS = ["🦊", "🐺", "🦁", "🐯", "🦅", "🦉", "🐉", "🦄", "🤖", "👨‍🔬", "👩‍🔬", "🧙"];

// ── API helper ──────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
  return data;
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Main App ────────────────────────────────────────────────
createApp({
  setup() {
    // Auth
    const user = ref(null);
    const authChecked = ref(false);

    // Navigation
    const page = ref("dashboard"); // login | onboarding | dashboard | arena | history | profile

    // Onboarding
    const onboardName = ref("");
    const onboardAvatar = ref("🦊");
    const onboardGroqKey = ref("");
    const onboardGoogleKey = ref("");
    const onboardDone = ref(false);

    // Profile / keys (loaded from localStorage)
    const profileName = ref("");
    const profileAvatar = ref("🦊");
    const groqKey = ref("");
    const googleKey = ref("");
    const keysStatus = ref("idle");
    const keysMsg = ref("Keys not saved");

    // Dashboard
    const debates = ref([]);
    const loadingDebates = ref(false);

    // Arena — run config
    const topic = ref("");
    const mode = ref("review");
    const rounds = ref(1);
    const selectedAgents = ref(["groq"]);
    const jobStatus = ref("idle");
    const jobMsg = ref("Ready");
    const currentJobId = ref(null);

    // Arena — live state
    const arenaActive = ref(false);
    const currentRound = ref(0);
    const totalRounds = ref(1);
    const speakingAgent = ref(null);
    const transcript = ref([]);
    const agentScores = ref({});
    const warnings = ref([]);
    const summary = ref("");
    const resultMode = ref("");

    // Human input
    const humanTurn = ref(false);
    const humanInput = ref("");

    // Input files
    const inputFiles = ref([]);
    const draftContent = ref("# Research Brief\n\nPaste your work here.\n\nThe agents will read this, debate it, score the arguments, and save a report.");
    const cloneUrl = ref("");
    const cloneStatus = ref("");
    const cloneMsg = ref("");

    // Report
    const reports = ref([]);
    const selectedReport = ref(null);
    const reportContent = ref("");
    const reportHtml = computed(() => reportContent.value ? marked.parse(reportContent.value) : "");

    // Chat
    const chatMessages = ref([]);
    const chatInput = ref("");
    const chatLoading = ref(false);

    // History
    const historySearch = ref("");
    const loginEmail = ref("");
    const loginPassword = ref("");
    const loginMode = ref("github");
    const loginError = ref("");
    const loginLoading = ref(false);

    async function emailSignIn() {
      loginLoading.value = true;
      loginError.value = "";
      try {
        await api("/auth/signin", {
          method: "POST",
          body: JSON.stringify({ email: loginEmail.value, password: loginPassword.value }),
        });
        window.location.href = "/";
      } catch (e) {
        loginError.value = e.message;
      } finally {
        loginLoading.value = false;
      }
    }

    async function emailRegister() {
      loginLoading.value = true;
      loginError.value = "";
      try {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email: loginEmail.value, password: loginPassword.value }),
        });
        loginError.value = "Check your email to confirm your account";
      } catch (e) {
        loginError.value = e.message;
      } finally {
        loginLoading.value = false;
      }
    }
    const filteredDebates = computed(() => {
      if (!historySearch.value) return debates.value;
      const q = historySearch.value.toLowerCase();
      return debates.value.filter(d => d.topic?.toLowerCase().includes(q));
    });

    // ── Load keys from localStorage ──
    function loadLocalKeys() {
      groqKey.value = localStorage.getItem("dl_groq_key") || "";
      googleKey.value = localStorage.getItem("dl_google_key") || "";
      profileName.value = localStorage.getItem("dl_name") || "";
      profileAvatar.value = localStorage.getItem("dl_avatar") || "🦊";
      onboardDone.value = !!localStorage.getItem("dl_onboard_done");
    }

    function saveKeys() {
      localStorage.setItem("dl_groq_key", groqKey.value);
      localStorage.setItem("dl_google_key", googleKey.value);
      localStorage.setItem("dl_name", profileName.value);
      localStorage.setItem("dl_avatar", profileAvatar.value);
      keysStatus.value = "saved";
      keysMsg.value = "Keys saved in your browser";
      setTimeout(() => { keysStatus.value = "idle"; keysMsg.value = "Keys not saved"; }, 3000);
    }

    function completeOnboarding() {
      profileName.value = onboardName.value || user.value?.github_username || "Researcher";
      profileAvatar.value = onboardAvatar.value;
      groqKey.value = onboardGroqKey.value;
      googleKey.value = onboardGoogleKey.value;
      saveKeys();
      localStorage.setItem("dl_onboard_done", "1");
      onboardDone.value = true;
      page.value = "dashboard";
    }

    // ── Auth ──
    async function checkAuth() {
      try {
        const data = await api("/auth/me");
        if (data.authenticated) {
          user.value = data;
          loadLocalKeys();
          if (!onboardDone.value) {
            page.value = "onboarding";
          } else {
            page.value = "dashboard";
            loadDashboard();
          }
        } else {
          page.value = "login";
        }
      } catch {
        page.value = "login";
      } finally {
        authChecked.value = true;
      }
    }

    // ── Dashboard ──
    async function loadDashboard() {
      loadingDebates.value = true;
      try {
        const data = await api("/api/reports");
        debates.value = data.reports || [];
      } catch { /* ignore */ }
      finally { loadingDebates.value = false; }
    }

    // ── Input files ──
    async function loadInputFiles() {
      try {
        const data = await api("/api/inputs");
        inputFiles.value = data.files || [];
      } catch { /* ignore */ }
    }

    async function saveDraft() {
      await api("/api/input", {
        method: "POST",
        body: JSON.stringify({ name: "web_brief.md", content: draftContent.value }),
      });
      await loadInputFiles();
    }

    async function deleteInputFile(name) {
      await api("/api/input", {
        method: "DELETE",
        body: JSON.stringify({ name }),
      });
      await loadInputFiles();
    }

    async function uploadFile(event) {
      const files = event.target.files;
      if (!files.length) return;
      for (const file of files) {
        const text = await file.text();
        await api("/api/input", {
          method: "POST",
          body: JSON.stringify({ name: file.name, content: text }),
        });
      }
      await loadInputFiles();
    }

    async function cloneRepo() {
      if (!cloneUrl.value) return;
      cloneStatus.value = "running";
      cloneMsg.value = "Cloning repository...";
      try {
        await api("/api/repo/clone", {
          method: "POST",
          body: JSON.stringify({ url: cloneUrl.value }),
        });
        cloneStatus.value = "completed";
        cloneMsg.value = "Repository cloned successfully";
        await loadInputFiles();
        cloneUrl.value = "";
      } catch (e) {
        cloneStatus.value = "failed";
        cloneMsg.value = e.message;
      }
    }

    // ── Run debate ──
    function toggleAgent(id) {
      const idx = selectedAgents.value.indexOf(id);
      if (idx >= 0) {
        if (selectedAgents.value.length > 1) selectedAgents.value.splice(idx, 1);
      } else {
        selectedAgents.value.push(id);
      }
    }

    async function runDebate() {
      if (!selectedAgents.value.length) {
        jobMsg.value = "Select at least one agent";
        jobStatus.value = "failed";
        return;
      }

      // Save draft first
      await saveDraft();

      // Inject API keys into the request so backend can use them
      jobStatus.value = "running";
      jobMsg.value = "Starting debate...";
      arenaActive.value = true;
      transcript.value = [];
      agentScores.value = {};
      warnings.value = [];
      summary.value = "";
      currentRound.value = 0;
      totalRounds.value = rounds.value;
      page.value = "arena";

      try {
        const data = await api("/api/run", {
          method: "POST",
          body: JSON.stringify({
            topic: topic.value || null,
            mode: mode.value,
            rounds: rounds.value,
            agents: selectedAgents.value,
            groq_key: groqKey.value,
            google_key: googleKey.value,
          }),
        });
        currentJobId.value = data.job_id;
        pollJob(data.job_id);
      } catch (e) {
        jobStatus.value = "failed";
        jobMsg.value = e.message;
        arenaActive.value = false;
      }
    }

    async function pollJob(jobId) {
      try {
        const job = await api(`/api/jobs/${jobId}`);

        if (job.status === "running") {
          jobMsg.value = "Debate in progress...";
          if (job.transcript && job.transcript.length) {
            transcript.value = job.transcript.map(t => ({
              agent: Object.keys(AGENT_META).find(k => AGENT_META[k].name === t.agent) || "groq",
              name: t.agent,
              text: t.text,
            }));
          }
          setTimeout(() => pollJob(jobId), 500);
          return;
        }

        if (job.status === "queued") {
          jobMsg.value = "Queued...";
          setTimeout(() => pollJob(jobId), 500);
          return;
        }

        if (job.status === "failed") {
          jobStatus.value = "failed";
          jobMsg.value = job.error || "Debate failed";
          arenaActive.value = false;
          return;
        }

        // Completed
        jobStatus.value = "completed";
        jobMsg.value = "Debate complete";
        arenaActive.value = false;

        if (job.result) {
          updateArenaFromResult(job.result);
          await loadDashboard();
          await loadReports();
        }
      } catch (e) {
        jobStatus.value = "failed";
        jobMsg.value = e.message;
      }
    }

    function updateArenaFromResult(result) {
      summary.value = result.summary || "";
      resultMode.value = result.mode || "";
      warnings.value = result.warnings || [];
      agentScores.value = result.agent_averages || {};
      totalRounds.value = result.rounds || 1;
      currentRound.value = result.rounds || 1;

      // Build transcript from all rounds
      transcript.value = [];
      if (result.rounds_data) {
        for (const round of result.rounds_data) {
          for (const [agentName, argument] of round) {
            const agentKey = Object.keys(AGENT_META).find(
              k => AGENT_META[k].name === agentName
            ) || "groq";
            transcript.value.push({ agent: agentKey, name: agentName, text: argument });
          }
        }
      }
    }

    // ── Reports ──
    async function loadReports() {
      try {
        const data = await api("/api/reports");
        reports.value = data.reports || [];
        if (reports.value.length && !selectedReport.value) {
          await loadReport(reports.value[0].name);
        }
      } catch { /* ignore */ }
    }

    async function loadReport(name) {
      selectedReport.value = name;
      try {
        const data = await api(`/api/report?name=${encodeURIComponent(name)}`);
        reportContent.value = data.content;
        chatMessages.value = [];
      } catch { /* ignore */ }
    }

    async function deleteReport(name) {
      if (!confirm(`Delete ${name}?`)) return;
      await api("/api/report", {
        method: "DELETE",
        body: JSON.stringify({ name }),
      });
      await loadReports();
      await loadDashboard();
    }

    // ── Chat ──
    async function sendChat() {
      const msg = chatInput.value.trim();
      if (!msg || chatLoading.value) return;
      chatInput.value = "";
      chatMessages.value.push({ role: "user", text: msg });
      chatLoading.value = true;

      try {
        const data = await api("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            message: msg,
            context: reportContent.value,
            history: chatMessages.value.slice(-6),
            groq_key: groqKey.value,
          }),
        });
        chatMessages.value.push({ role: "assistant", text: data.reply });
      } catch (e) {
        chatMessages.value.push({ role: "assistant", text: `Error: ${e.message}` });
      } finally {
        chatLoading.value = false;
      }
    }

    // ── Navigate to arena ──
    function goToArena() {
      loadInputFiles();
      page.value = "arena";
    }

    function goToDebate(debate) {
      if (debate.name) loadReport(debate.name);
      page.value = "history";
    }

    // ── Init ──
    onMounted(() => {
      checkAuth();
    });

    watch(page, (val) => {
      if (val === "arena") loadInputFiles();
      if (val === "history") { loadReports(); loadDashboard(); }
      if (val === "dashboard") loadDashboard();
    });

    return {
      // auth
      user, authChecked, page,
      loginEmail, loginPassword, loginMode, loginError, loginLoading, emailSignIn, emailRegister,
      // onboarding
      onboardName, onboardAvatar, onboardGroqKey, onboardGoogleKey,
      AVATAR_EMOJIS, completeOnboarding,
      // profile
      profileName, profileAvatar, groqKey, googleKey,
      keysStatus, keysMsg, saveKeys,
      // dashboard
      debates, loadingDebates, filteredDebates, historySearch,
      // arena
      topic, mode, rounds, selectedAgents, toggleAgent,
      jobStatus, jobMsg, arenaActive, currentRound, totalRounds,
      speakingAgent, transcript, agentScores, warnings, summary, resultMode,
      humanTurn, humanInput, runDebate,
      // inputs
      inputFiles, draftContent, saveDraft, deleteInputFile,
      uploadFile, cloneUrl, cloneStatus, cloneMsg, cloneRepo,
      // reports
      reports, selectedReport, reportContent, reportHtml,
      loadReport, deleteReport,
      // chat
      chatMessages, chatInput, chatLoading, sendChat,
      // nav
      goToArena, goToDebate,
      // helpers
      AGENT_META, formatBytes, timeAgo,
    };
  },

  template: `
<!-- ── Loading ─────────────────────────────────────────── -->
<div v-if="!authChecked" class="login-page">
  <div style="text-align:center;color:var(--ink2)">Loading...</div>
</div>

<!-- ── Login ───────────────────────────────────────────── -->
<div v-else-if="page === 'login'" class="login-page">
  <div class="login-card">
    <div class="mark">DL</div>
    <h1>Debate Lab</h1>
    <p class="tagline">Multi-model AI review and debate system for researchers.<br>Put your work in. Get three professors arguing about it.</p>
    <a href="/auth/login" class="github-btn">
      <svg height="18" viewBox="0 0 16 16" width="18" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      Sign in with GitHub
    </a>
    <p class="login-note">Your API keys stay in your browser. We never store them on the server.</p>
    <div style="margin:16px 0;display:flex;align-items:center;gap:10px;color:var(--ink2);font-size:12px">
      <div style="flex:1;height:1px;background:var(--line)"></div>or<div style="flex:1;height:1px;background:var(--line)"></div>
    </div>
    <div v-if="loginMode === 'github'">
      <button class="btn btn-secondary btn-full" @click="loginMode = 'email'">Sign in with Email</button>
    </div>
    <div v-else style="display:grid;gap:10px">
      <input v-model="loginEmail" type="email" placeholder="Email">
      <input v-model="loginPassword" type="password" placeholder="Password">
      <div v-if="loginError" style="font-size:12px;color:var(--danger)">{{ loginError }}</div>
      <button class="btn btn-primary btn-full" @click="emailSignIn" :disabled="loginLoading">
        {{ loginLoading ? 'Signing in...' : 'Sign In' }}
      </button>
      <button class="btn btn-secondary btn-full" @click="emailRegister" :disabled="loginLoading">
        Create Account
      </button>
      <button class="btn btn-ghost btn-full" @click="loginMode = 'github'">← Back to GitHub login</button>
    </div>
    <div class="login-features">
      <div class="login-feature">
        <span class="icon">🎓</span>
        <div><strong>Three AI Professors</strong><span>GPT, Llama, and Gemini debate your work from different angles.</span></div>
      </div>
      <div class="login-feature">
        <span class="icon">📊</span>
        <div><strong>Scored Arguments</strong><span>Every argument is scored on specificity, evidence, logic, and more.</span></div>
      </div>
      <div class="login-feature">
        <span class="icon">💬</span>
        <div><strong>Chat with Results</strong><span>Ask follow-up questions about the debate after it finishes.</span></div>
      </div>
    </div>
  </div>
</div>

<!-- ── Onboarding ───────────────────────────────────────── -->
<div v-else-if="page === 'onboarding'" class="onboarding-page">
  <div class="onboarding-card">
    <h1>Welcome to Debate Lab 👋</h1>
    <p class="sub">Let's set up your workspace. This takes about a minute.</p>
    <div class="onboarding-steps">

      <div>
        <div class="step-label">Step 1 — Your name</div>
        <input v-model="onboardName" type="text" :placeholder="user?.github_username || 'Your name'">
      </div>

      <div>
        <div class="step-label">Step 2 — Pick an avatar</div>
        <div class="avatar-options">
          <div v-for="em in AVATAR_EMOJIS" :key="em"
               class="avatar-option"
               :class="{ selected: onboardAvatar === em }"
               @click="onboardAvatar = em">{{ em }}</div>
        </div>
      </div>

      <div>
        <div class="step-label">Step 3 — API Keys (stored in your browser only)</div>
        <div class="field" style="margin-bottom:8px">
          <label>Groq API Key <span style="color:var(--ink2);font-weight:400">(free at console.groq.com)</span></label>
          <input v-model="onboardGroqKey" type="password" placeholder="gsk_...">
        </div>
        <div class="field">
          <label>Google API Key <span style="color:var(--ink2);font-weight:400">(for Gemini, optional)</span></label>
          <input v-model="onboardGoogleKey" type="password" placeholder="AIza...">
        </div>
      </div>

      <button class="btn btn-primary btn-full" @click="completeOnboarding">
        Get Started →
      </button>
    </div>
  </div>
</div>

<!-- ── App Shell ────────────────────────────────────────── -->
<div v-else class="app-shell">

  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="mark">DL</div>
      <div>
        <h1>Debate Lab</h1>
        <p>Research review system</p>
      </div>
    </div>

    <nav class="sidebar-nav">
      <button class="nav-item" :class="{ active: page === 'dashboard' }" @click="page = 'dashboard'">
        <span class="nav-icon">🏠</span> Dashboard
      </button>
      <button class="nav-item" :class="{ active: page === 'arena' }" @click="goToArena()">
        <span class="nav-icon">⚔️</span> New Debate
      </button>
      <button class="nav-item" :class="{ active: page === 'history' }" @click="page = 'history'">
        <span class="nav-icon">📚</span> History
      </button>
      <div class="divider"></div>
      <button class="nav-item" :class="{ active: page === 'profile' }" @click="page = 'profile'">
        <span class="nav-icon">⚙️</span> Settings
      </button>
    </nav>

    <div class="sidebar-user">
      <div class="user-avatar">
        <span v-if="!user?.github_avatar">{{ profileAvatar }}</span>
        <img v-else :src="user.github_avatar" alt="">
      </div>
      <span class="user-name">{{ profileName || user?.github_username || 'Researcher' }}</span>
      <a href="/auth/logout" class="btn btn-ghost btn-sm btn-icon" title="Sign out">↩</a>
    </div>
  </aside>

  <!-- Main -->
  <main class="main-content">

    <!-- ── Dashboard ──────────────────────────────────── -->
    <div v-if="page === 'dashboard'" class="page">
      <div class="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {{ profileName || user?.github_username }}. Here is your research activity.</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ debates.length }}</div>
          <div class="stat-label">Total Debates</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ debates.filter(d => d.mode === 'review').length }}</div>
          <div class="stat-label">Reviews</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ debates.filter(d => d.mode === 'debate').length }}</div>
          <div class="stat-label">Debates</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>Recent Debates</h2>
          <button class="btn btn-primary btn-sm" @click="goToArena()">+ New Debate</button>
        </div>
        <div v-if="loadingDebates" class="muted" style="padding:20px;text-align:center">Loading...</div>
        <div v-else-if="!debates.length" class="muted" style="padding:20px;text-align:center">
          No debates yet. <button class="btn btn-ghost btn-sm" @click="goToArena()">Start your first one →</button>
        </div>
        <div v-else class="recent-debates">
          <div v-for="d in debates.slice(0,8)" :key="d.id"
               class="debate-card" @click="goToDebate(d)">
            <span class="debate-card-icon">{{ d.mode === 'debate' ? '⚔️' : '📋' }}</span>
            <div class="debate-card-body">
              <div class="debate-card-topic">{{ d.topic || 'Untitled debate' }}</div>
              <div class="debate-card-meta">{{ d.mode }} · {{ timeAgo(d.created_at) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Arena ──────────────────────────────────────── -->
    <div v-if="page === 'arena'" class="page">
      <div class="page-header">
        <h1>⚔️ Debate Arena</h1>
        <p>Configure your debate, add input files, and run.</p>
      </div>

      <div class="arena-layout">

        <!-- Left: GPT + Groq -->
        <div class="agent-column">
          <div v-for="id in ['gpt','groq']" :key="id"
               class="agent-card" :class="[id, { speaking: speakingAgent === id }]">
            <div class="agent-avatar-wrap">
              <div class="agent-avatar">{{ AGENT_META[id].emoji }}</div>
              <div v-if="speakingAgent === id" class="speaking-dot"></div>
            </div>
            <div class="agent-name">{{ AGENT_META[id].name }}</div>
            <div class="agent-model">Professor {{ id.toUpperCase() }}</div>
            <div v-if="agentScores[AGENT_META[id].name] !== undefined" class="agent-score">
              {{ (agentScores[AGENT_META[id].name] * 100).toFixed(0) }}
              <div class="agent-score-label">avg score</div>
            </div>
          </div>
        </div>

        <!-- Center: topic, transcript, controls -->
        <div class="arena-center">

          <div class="topic-banner">
            <div class="label">Topic</div>
            <div class="topic-text">{{ topic || 'Review and critique the input files' }}</div>
          </div>

          <div class="round-indicator">
            <div v-for="i in totalRounds" :key="i" class="round-dot"
                 :class="{ done: i < currentRound, current: i === currentRound }"></div>
          </div>

          <div class="transcript" id="transcript">
            <div v-if="!transcript.length" class="muted" style="text-align:center;padding:20px">
              Run a debate to see arguments appear here in real time.
            </div>
            <div v-for="(entry, i) in transcript" :key="i" class="transcript-entry">
              <div class="transcript-who" :class="entry.agent">
                {{ entry.name }} · Round {{ Math.floor(i / selectedAgents.length) + 1 }}
              </div>
              <div class="transcript-text">{{ entry.text }}</div>
            </div>
          </div>

          <!-- Human input -->
          <div v-if="humanTurn" class="human-input-area">
            <h3>🧑‍🎓 Your turn — add your argument</h3>
            <textarea v-model="humanInput" placeholder="Type your argument..." rows="3"></textarea>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn btn-primary" @click="submitHuman">Submit</button>
              <button class="btn btn-secondary" @click="humanTurn = false">Skip</button>
            </div>
          </div>

          <!-- Summary after debate -->
          <div v-if="summary" class="panel">
            <div class="panel-head"><h2>📋 Moderator Summary</h2><span class="pill">{{ resultMode }}</span></div>
            <div v-html="marked.parse(summary)" style="font-size:13px;line-height:1.6"></div>
          </div>

          <!-- Chat -->
          <div v-if="reportContent" class="panel">
            <div class="panel-head"><h2>💬 Chat with this debate</h2></div>
            <div class="chat-panel">
              <div class="chat-messages" id="chatMessages">
                <div v-if="!chatMessages.length" class="muted" style="text-align:center;padding:20px;font-size:13px">
                  Ask anything about this debate...
                </div>
                <div v-for="(msg, i) in chatMessages" :key="i"
                     class="chat-msg" :class="msg.role">{{ msg.text }}</div>
                <div v-if="chatLoading" class="chat-msg assistant">Thinking...</div>
              </div>
              <div class="chat-input-row">
                <input v-model="chatInput" type="text"
                       placeholder="Ask about the debate..."
                       @keydown.enter="sendChat">
                <button class="btn btn-primary btn-sm" @click="sendChat" :disabled="chatLoading">Send</button>
              </div>
            </div>
          </div>

        </div>

        <!-- Right: Gemini + run controls -->
        <div class="agent-column">
          <div class="agent-card gemini" :class="{ speaking: speakingAgent === 'gemini' }">
            <div class="agent-avatar-wrap">
              <div class="agent-avatar">{{ AGENT_META.gemini.emoji }}</div>
              <div v-if="speakingAgent === 'gemini'" class="speaking-dot"></div>
            </div>
            <div class="agent-name">{{ AGENT_META.gemini.name }}</div>
            <div class="agent-model">Professor GEMINI</div>
            <div v-if="agentScores[AGENT_META.gemini.name] !== undefined" class="agent-score">
              {{ (agentScores[AGENT_META.gemini.name] * 100).toFixed(0) }}
              <div class="agent-score-label">avg score</div>
            </div>
          </div>

          <!-- Run controls -->
          <div class="run-panel">
            <div class="field">
              <label>Topic</label>
              <input v-model="topic" type="text" placeholder="Leave empty to review input files">
            </div>
            <div style="display:grid;grid-template-columns:1fr 80px;gap:8px">
              <div class="field">
                <label>Mode</label>
                <select v-model="mode">
                  <option value="review">Review</option>
                  <option value="debate">Debate</option>
                </select>
              </div>
              <div class="field">
                <label>Rounds</label>
                <input v-model.number="rounds" type="number" min="1" max="5">
              </div>
            </div>
            <div>
              <div class="field" style="margin-bottom:6px"><label>Agents</label></div>
              <div class="checks">
                <label v-for="(meta, id) in AGENT_META" :key="id"
                       v-if="id !== 'human'"
                       class="check-item">
                  <span>{{ meta.emoji }} {{ meta.name }}</span>
                  <input type="checkbox" :value="id"
                         :checked="selectedAgents.includes(id)"
                         @change="toggleAgent(id)">
                </label>
              </div>
            </div>
            <div :class="['status', jobStatus]">{{ jobMsg }}</div>
            <button class="btn btn-primary btn-full"
                    :disabled="jobStatus === 'running'"
                    @click="runDebate">
              {{ jobStatus === 'running' ? 'Running...' : '▶ Run Debate' }}
            </button>
          </div>

          <!-- Input files -->
          <div class="panel">
            <div class="panel-head">
              <h2>Input Files</h2>
              <span class="pill">{{ inputFiles.length }}</span>
            </div>
            <div class="file-list" style="margin-bottom:10px">
              <div v-if="!inputFiles.length" class="muted" style="font-size:13px">No files yet.</div>
              <div v-for="f in inputFiles" :key="f.path" class="file-item">
                <span class="file-item-name">{{ f.path }}</span>
                <span class="file-item-size">{{ formatBytes(f.size) }}</span>
                <button class="btn btn-ghost btn-icon btn-sm" @click="deleteInputFile(f.path)" title="Delete">✕</button>
              </div>
            </div>

            <!-- Upload -->
            <label class="upload-zone" style="margin-bottom:8px">
              📁 Upload files (.txt .md .py .js .json .csv)
              <input type="file" multiple
                     accept=".txt,.md,.py,.ts,.js,.json,.csv"
                     style="display:none"
                     @change="uploadFile">
            </label>

            <!-- Clone repo -->
            <div style="display:flex;gap:6px">
              <input v-model="cloneUrl" type="url" placeholder="https://github.com/user/repo">
              <button class="btn btn-secondary btn-sm" @click="cloneRepo">Clone</button>
            </div>
            <div v-if="cloneMsg" :class="['status', cloneStatus]" style="margin-top:6px;font-size:12px">
              {{ cloneMsg }}
            </div>
          </div>

          <!-- Warnings -->
          <div v-if="warnings.length" class="panel">
            <div class="panel-head"><h2>⚠️ Warnings</h2><span class="pill">{{ warnings.length }}</span></div>
            <div class="warning-list">
              <div v-for="w in warnings" :key="w" class="warning-row">{{ w }}</div>
            </div>
          </div>

          <!-- Scores -->
          <div v-if="Object.keys(agentScores).length" class="panel">
            <div class="panel-head"><h2>📊 Scores</h2></div>
            <div class="score-list">
              <div v-for="(score, name) in agentScores" :key="name" class="score-row">
                <strong>{{ name }}</strong>
                <div class="bar"><span :style="{ width: (score*100)+'%' }"></span></div>
                <div style="font-size:12px;color:var(--ink2);margin-top:4px">{{ (score*100).toFixed(0) }} / 100</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- ── History ─────────────────────────────────────── -->
    <div v-if="page === 'history'" class="page">
      <div class="page-header">
        <h1>📚 History</h1>
        <p>All your past debates and reviews.</p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;align-items:start">

        <!-- Report list -->
        <div class="panel">
          <div class="panel-head">
            <h2>Reports</h2>
            <span class="pill">{{ reports.length }}</span>
          </div>
          <input v-model="historySearch" type="text" placeholder="Search..." style="margin-bottom:10px">
          <div style="display:grid;gap:6px;max-height:60vh;overflow-y:auto">
            <div v-if="!reports.length" class="muted" style="font-size:13px;padding:10px 0">No reports yet.</div>
            <div v-for="r in filteredDebates" :key="r.name || r.id"
                 class="debate-card"
                 :style="selectedReport === r.name ? 'border-color:var(--accent)' : ''"
                 @click="loadReport(r.name)">
              <span class="debate-card-icon">📄</span>
              <div class="debate-card-body">
                <div class="debate-card-topic">{{ r.topic || r.name }}</div>
                <div class="debate-card-meta">{{ r.mode }} · {{ timeAgo(r.created_at) }}</div>
              </div>
              <button class="btn btn-danger btn-icon btn-sm"
                      @click.stop="deleteReport(r.name)" title="Delete">🗑</button>
            </div>
          </div>
        </div>

        <!-- Report view + chat -->
        <div style="display:grid;gap:14px">
          <div class="panel">
            <div class="panel-head">
              <h2>{{ selectedReport || 'Select a report' }}</h2>
            </div>
            <div v-if="!reportContent" class="muted" style="font-size:13px;padding:10px 0">
              Select a report from the list.
            </div>
            <div v-else class="report-view" v-html="reportHtml"></div>
          </div>

          <div v-if="reportContent" class="panel">
            <div class="panel-head"><h2>💬 Chat with this debate</h2></div>
            <div class="chat-panel">
              <div class="chat-messages">
                <div v-if="!chatMessages.length" class="muted" style="text-align:center;padding:20px;font-size:13px">
                  Ask anything about this debate...
                </div>
                <div v-for="(msg, i) in chatMessages" :key="i"
                     class="chat-msg" :class="msg.role">{{ msg.text }}</div>
                <div v-if="chatLoading" class="chat-msg assistant">Thinking...</div>
              </div>
              <div class="chat-input-row">
                <input v-model="chatInput" type="text"
                       placeholder="Ask about the debate..."
                       @keydown.enter="sendChat">
                <button class="btn btn-primary btn-sm" @click="sendChat" :disabled="chatLoading">Send</button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ── Profile / Settings ──────────────────────────── -->
    <div v-if="page === 'profile'" class="page">
      <div class="page-header">
        <h1>⚙️ Settings</h1>
        <p>Manage your profile and API keys.</p>
      </div>

      <div style="display:grid;gap:16px;max-width:600px">

        <div class="profile-header">
          <div class="profile-avatar">
            <img v-if="user?.github_avatar" :src="user.github_avatar" alt="">
            <span v-else>{{ profileAvatar }}</span>
          </div>
          <div>
            <div class="profile-name">{{ profileName || user?.github_username }}</div>
            <div class="profile-sub">@{{ user?.github_username }} · GitHub</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>Display Name & Avatar</h2></div>
          <div class="field" style="margin-bottom:12px">
            <label>Display Name</label>
            <input v-model="profileName" type="text" :placeholder="user?.github_username">
          </div>
          <div class="field">
            <label>Avatar</label>
            <div class="avatar-options">
              <div v-for="em in AVATAR_EMOJIS" :key="em"
                   class="avatar-option"
                   :class="{ selected: profileAvatar === em }"
                   @click="profileAvatar = em">{{ em }}</div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>API Keys</h2></div>
          <p style="font-size:13px;color:var(--ink2);margin-bottom:14px">
            Keys are stored in your browser only. We never send them to our server except during a debate run.
          </p>
          <div class="keys-grid">
            <div class="field">
              <label>Groq API Key <a href="https://console.groq.com" target="_blank" style="color:var(--accent);font-weight:400;font-size:11px">Get free key →</a></label>
              <input v-model="groqKey" type="password" placeholder="gsk_...">
            </div>
            <div class="field">
              <label>Google API Key <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--accent);font-weight:400;font-size:11px">Get key →</a></label>
              <input v-model="googleKey" type="password" placeholder="AIza...">
            </div>
          </div>
          <div :class="['status', keysStatus]" style="margin-top:10px">{{ keysMsg }}</div>
          <button class="btn btn-primary" style="margin-top:10px" @click="saveKeys">Save Keys</button>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>Account</h2></div>
          <a href="/auth/logout" class="btn btn-danger">Sign out</a>
        </div>

      </div>
    </div>

  </main>
</div>
  `
}).mount("#app");