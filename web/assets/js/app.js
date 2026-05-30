import { AGENT_META, formatBytes, timeAgo } from "./constants.js";
import { 
  checkAuthReq, emailSignInReq, emailRegisterReq 
} from "./auth.js";
import { 
  fetchStatus, fetchInputs, saveInput, deleteInput, deleteAllInputsReq,
  fetchReports, fetchReport, deleteReportReq, cloneRepoReq, sendChatReq,
  validateKeyReq, fetchAgentStats, fetchSessions
} from "./api.js";
import { useArena } from "./arena.js";

const { createApp, ref, computed, onMounted, watch } = window.Vue;

createApp({
  setup() {
    // State
    const user = ref(null);
    const authChecked = ref(false);
    const page = ref("dashboard"); 
    
    // Theme & Sidebar
    const theme = ref(localStorage.getItem("dl_theme") || "dark");
    const sidebarCollapsed = ref(localStorage.getItem("dl_sidebar_collapsed") === "true");

    function toggleTheme() {
      theme.value = theme.value === "dark" ? "light" : "dark";
      localStorage.setItem("dl_theme", theme.value);
      document.documentElement.setAttribute("data-theme", theme.value);
    }

    function toggleSidebarCollapse() {
      sidebarCollapsed.value = !sidebarCollapsed.value;
      localStorage.setItem("dl_sidebar_collapsed", sidebarCollapsed.value);
    }
    document.documentElement.setAttribute("data-theme", theme.value);

    // Sidebar & Mobile
    const sidebarOpen = ref(false);
    function toggleSidebar() { sidebarOpen.value = !sidebarOpen.value; }

    // Toasts
    const toasts = ref([]);
    let toastId = 0;
    function addToast(title, msg, type = "info") {
      const id = toastId++;
      toasts.value.push({ id, title, msg, type });
      if (toasts.value.length > 3) toasts.value.shift();
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id);
      }, 4000);
    }

    // Auth & Onboarding
    const loginEmail = ref("");
    const loginPassword = ref("");
    const loginMode = ref("github");
    const loginLoading = ref(false);
    
    const onboardName = ref("");
    const onboardAvatarColor = ref("#3fb950");
    const onboardDone = ref(false);

    const profileName = ref("");
    const profileAvatarColor = ref("#3fb950");

    // Keys
    const keys = ref({ groq: "", google: "", kimi: "", deepseek: "", claude: "" });
    const keysStatus = ref({ groq: null, google: null, kimi: null, deepseek: null, claude: null });
    const sessionOnlyKeys = ref(localStorage.getItem("dl_session_only") === "true");

    // Dashboard & History
    const debates = ref([]);
    const sessions = ref([]);
    const agentStats = ref([]);
    const loadingDebates = ref(false);
    const historySearch = ref("");

    // Arena State
    const topic = ref("");
    const mode = ref("review");
    const goal = ref("rounds");
    const persona = ref("balanced");
    const rounds = ref(3);
    const selectedAgents = ref(["gpt", "groq", "gemini"]);
    const jobStatus = ref("idle");
    const jobMsg = ref("Ready");
    const currentJobId = ref(null);
    const arenaActive = ref(false);
    const configOpen = ref(true);
    const reportSaved = ref(false);
    const currentRound = ref(0);
    const totalRounds = ref(1);
    const speakingAgent = ref(null);
    const transcript = ref([]);
    const agentScores = ref({});
    const warnings = ref([]);
    const summary = ref("");
    const resultMode = ref("");
    const humanTurn = ref(false);
    const humanInput = ref("");
    const interjecting = ref(false);

    // Inputs
    const inputFiles = ref([]);
    const cloneUrl = ref("");
    const draftContent = ref("");

    // Report / Chat
    const reports = ref([]);
    const selectedReport = ref(null);
    const reportContent = ref("");
    const reportHtml = computed(() => reportContent.value ? marked.parse(reportContent.value) : "");
    const chatMessages = ref([]);
    const chatInput = ref("");
    const chatLoading = ref(false);

    // Functions

    async function emailSignIn() {
      loginLoading.value = true;
      try {
        await emailSignInReq(loginEmail.value, loginPassword.value);
        window.location.href = "/";
      } catch (e) {
        addToast("Sign In Failed", e.message, "error");
      } finally { loginLoading.value = false; }
    }

    async function emailRegister() {
      loginLoading.value = true;
      try {
        await emailRegisterReq(loginEmail.value, loginPassword.value);
        addToast("Success", "Check your email to confirm", "success");
      } catch (e) {
        addToast("Registration Failed", e.message, "error");
      } finally { loginLoading.value = false; }
    }

    function loadLocalKeys() {
      const storage = sessionOnlyKeys.value ? sessionStorage : localStorage;
      keys.value.groq = storage.getItem("dl_key_groq") || "";
      keys.value.google = storage.getItem("dl_key_google") || "";
      keys.value.kimi = storage.getItem("dl_key_kimi") || "";
      keys.value.deepseek = storage.getItem("dl_key_deepseek") || "";
      keys.value.claude = storage.getItem("dl_key_claude") || "";
      
      profileName.value = localStorage.getItem("dl_name") || "";
      profileAvatarColor.value = localStorage.getItem("dl_color") || "#3fb950";
      onboardDone.value = !!localStorage.getItem("dl_onboard_done");
    }

    function saveLocalKeys() {
      const storage = sessionOnlyKeys.value ? sessionStorage : localStorage;
      localStorage.setItem("dl_session_only", sessionOnlyKeys.value);
      
      storage.setItem("dl_key_groq", keys.value.groq);
      storage.setItem("dl_key_google", keys.value.google);
      storage.setItem("dl_key_kimi", keys.value.kimi);
      storage.setItem("dl_key_deepseek", keys.value.deepseek);
      storage.setItem("dl_key_claude", keys.value.claude);
      
      localStorage.setItem("dl_name", profileName.value);
      localStorage.setItem("dl_color", profileAvatarColor.value);
      addToast("Settings Saved", "Your preferences have been stored.", "success");
    }

    function downloadReport(name, content) {
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name.endsWith(".md") ? name : `${name}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast("Exported", "Report downloaded successfully", "success");
    }

    async function validateKey(provider) {
      keysStatus.value[provider] = "testing";
      try {
        const res = await validateKeyReq(provider, keys.value[provider]);
        if (res.valid) {
          keysStatus.value[provider] = "valid";
          addToast("Key Valid", `${provider} API key is working.`, "success");
        } else {
          keysStatus.value[provider] = "invalid";
          addToast("Key Invalid", res.error, "error");
        }
      } catch (e) {
        keysStatus.value[provider] = "invalid";
        addToast("Error", e.message, "error");
      }
    }

    function completeOnboarding() {
      profileName.value = onboardName.value || user.value?.github_username || "Researcher";
      profileAvatarColor.value = onboardAvatarColor.value;
      saveLocalKeys();
      localStorage.setItem("dl_onboard_done", "1");
      onboardDone.value = true;
      page.value = "dashboard";
      loadDashboard();
    }

    async function checkAuth() {
      try {
        const data = await checkAuthReq();
        if (data.authenticated) {
          user.value = data;
          loadLocalKeys();
          if (!onboardDone.value) page.value = "onboarding";
          else { page.value = "dashboard"; loadDashboard(); }
        } else page.value = "login";
      } catch { page.value = "login"; }
      finally { authChecked.value = true; }
    }

    async function loadDashboard() {
      loadingDebates.value = true;
      try {
        const res = await fetchReports();
        debates.value = res.reports || [];
        const statsRes = await fetchAgentStats();
        agentStats.value = statsRes.stats || [];
        const sessRes = await fetchSessions();
        sessions.value = sessRes.sessions || [];
      } catch (e) { addToast("Error", "Failed to load dashboard data", "error"); }
      finally { loadingDebates.value = false; }
    }

    async function loadInputFiles() {
      try {
        const data = await fetchInputs();
        inputFiles.value = data.files || [];
      } catch (e) {}
    }

    async function saveDraft() {
      if (!draftContent.value) return;
      await saveInput("web_brief.md", draftContent.value);
      await loadInputFiles();
    }

    async function deleteInputFileObj(name) {
      await deleteInput(name);
      await loadInputFiles();
    }

    async function clearAllInputs() {
      if (!confirm("Are you sure you want to delete all input files?")) return;
      await deleteAllInputsReq();
      await loadInputFiles();
      addToast("Cleared", "All input files have been deleted.", "info");
    }

    async function uploadFile(event) {
      const files = event.target.files;
      if (!files.length) return;
      for (const file of files) {
        const text = await file.text();
        await saveInput(file.name, text);
      }
      await loadInputFiles();
      addToast("Uploaded", `${files.length} files added`, "success");
    }

    async function cloneRepo() {
      if (!cloneUrl.value) return;
      addToast("Cloning", "Repository cloning started...", "info");
      try {
        const res = await cloneRepoReq(cloneUrl.value);
        await loadInputFiles();
        cloneUrl.value = "";
        addToast("Success", `Cloned ${res.files_copied} files`, "success");
      } catch (e) { addToast("Clone Failed", e.message, "error"); }
    }

    // Arena Setup
    const arenaState = {
      selectedAgents, jobMsg, jobStatus, saveDraft, arenaActive, reportSaved,
      transcript, agentScores, warnings, summary, reportContent, currentRound,
      totalRounds, page, humanTurn, topic, mode, goal, persona, rounds, currentJobId, speakingAgent,
      humanInput, interjecting, profileName, loadDashboard, loadReports: loadReportsData, resultMode
    };
    const { runDebate, pollJob, saveReport, submitHuman, submitInterject, updateArenaFromResult } = useArena(arenaState);

    function toggleAgent(id) {
      const idx = selectedAgents.value.indexOf(id);
      if (idx >= 0) { if (selectedAgents.value.length > 1) selectedAgents.value.splice(idx, 1); }
      else selectedAgents.value.push(id);
    }

    function goToArena() {
      loadInputFiles();
      page.value = "arena";
      reportSaved.value = false;
      currentJobId.value = null;
      transcript.value = [];
      summary.value = "";
      reportContent.value = "";
      sidebarOpen.value = false;
    }

    // Reports & History
    async function loadReportsData() {
      try {
        const data = await fetchReports();
        reports.value = data.reports || [];
        if (reports.value.length && !selectedReport.value) await loadReport(reports.value[0].name);
      } catch (e) {}
    }

    async function loadReport(name) {
      selectedReport.value = name;
      try {
        const data = await fetchReport(name);
        reportContent.value = data.content;
        chatMessages.value = [];
      } catch (e) { addToast("Error", "Failed to load report", "error"); }
    }

    async function deleteReport(name) {
      if (!confirm(`Delete ${name}?`)) return;
      await deleteReportReq(name);
      await loadReportsData();
      await loadDashboard();
      addToast("Deleted", "Report removed", "info");
    }

    function goToHistory(item) {
      if (item && item.name) loadReport(item.name);
      else if (item && item.id) {
         const rep = reports.value.find(r => r.id === item.id);
         if (rep) loadReport(rep.name);
      }
      page.value = "history";
      sidebarOpen.value = false;
    }

    const filteredReports = computed(() => {
      if (!historySearch.value) return reports.value;
      const q = historySearch.value.toLowerCase();
      return reports.value.filter(r => (r.topic||'').toLowerCase().includes(q) || r.mode.includes(q));
    });

    async function sendChat() {
      const msg = chatInput.value.trim();
      if (!msg || chatLoading.value) return;
      chatInput.value = "";
      chatMessages.value.push({ role: "user", text: msg });
      chatLoading.value = true;
      try {
        const data = await sendChatReq({
          message: msg, context: reportContent.value, history: chatMessages.value.slice(-6), groq_key: keys.value.groq
        });
        chatMessages.value.push({ role: "assistant", text: data.reply });
      } catch (e) {
        addToast("Chat Error", e.message, "error");
      } finally { chatLoading.value = false; }
    }

    onMounted(() => { checkAuth(); });

    watch(page, (val) => {
      if (val === "arena") loadInputFiles();
      if (val === "history") { loadReportsData(); loadDashboard(); }
      if (val === "dashboard") loadDashboard();
    });

    const marked = window.marked;

    return {
      user, authChecked, page, theme, toggleTheme,
      sidebarOpen, toggleSidebar, sidebarCollapsed, toggleSidebarCollapse, toasts,
      loginEmail, loginPassword, loginMode, loginLoading, emailSignIn, emailRegister,
      onboardName, onboardAvatarColor, onboardDone, completeOnboarding,
      profileName, profileAvatarColor, keys, keysStatus, sessionOnlyKeys, saveLocalKeys, validateKey,
      debates, sessions, agentStats, loadingDebates, historySearch,
      topic, mode, goal, persona, rounds, selectedAgents, toggleAgent,
      jobStatus, jobMsg, currentJobId, arenaActive, configOpen, reportSaved, currentRound, totalRounds,
      speakingAgent, transcript, agentScores, warnings, summary, resultMode, humanTurn, humanInput, interjecting,
      runDebate, saveReport, submitHuman, submitInterject, downloadReport,
      inputFiles, draftContent, deleteInputFileObj, clearAllInputs, uploadFile, cloneUrl, cloneRepo,
      reports, filteredReports, selectedReport, reportContent, reportHtml, loadReport, deleteReport,
      chatMessages, chatInput, chatLoading, sendChat,
      goToArena, goToHistory,
      AGENT_META, formatBytes, timeAgo, marked
    };
  },
  template: `
<div class="toast-container">
  <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">
    <div class="toast-title">{{ t.title }}</div>
    <div class="toast-msg">{{ t.msg }}</div>
    <div class="toast-progress"></div>
  </div>
</div>

<div v-if="!authChecked" class="login-page">
  <div style="text-align:center;color:var(--ink2)">Loading...</div>
</div>

<div v-else-if="page === 'login'" class="login-page">
  <div class="login-bg"></div>
  <div class="login-card">
    <div class="login-card-left">
      <div class="mark" style="margin-bottom:24px;width:48px;height:48px;font-size:20px">DL</div>
      <h1 style="font-size:32px;font-weight:800;margin-bottom:12px">Debate Lab</h1>
      <p style="color:var(--ink2);line-height:1.6">Drop in any work. Get multiple AI analysts tearing it apart.</p>
    </div>
    <div class="login-card-right">
      <a href="/auth/login" class="btn btn-secondary btn-full" style="background:var(--ink);color:var(--bg)">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33c.85 0 1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>
        Sign in with GitHub
      </a>
      <div style="display:flex;align-items:center;gap:12px;margin:8px 0">
        <div style="flex:1;height:1px;background:var(--glass-border)"></div>
        <span style="font-size:12px;color:var(--ink2)">OR</span>
        <div style="flex:1;height:1px;background:var(--glass-border)"></div>
      </div>
      <div class="field" style="margin-bottom:8px">
        <input v-model="loginEmail" type="email" placeholder="Email address">
      </div>
      <div class="field" style="margin-bottom:16px">
        <input v-model="loginPassword" type="password" placeholder="Password">
      </div>
      <button class="btn btn-primary btn-full" @click="emailSignIn" :disabled="loginLoading">Sign In</button>
      <button class="btn btn-ghost btn-full" @click="emailRegister" :disabled="loginLoading">Create Account</button>
    </div>
  </div>
</div>

<div v-else-if="page === 'onboarding'" class="onboarding-page">
  <div class="login-bg"></div>
  <div class="login-card" style="grid-template-columns:1fr;max-width:600px;gap:32px">
    <div style="text-align:center">
      <h1 style="font-size:24px;font-weight:800;margin-bottom:8px">Welcome to Debate Lab</h1>
      <p style="color:var(--ink2)">Let's set up your profile.</p>
    </div>
    <div class="field">
      <label>Display Name</label>
      <input v-model="onboardName" type="text" :placeholder="user?.github_username || 'Your name'">
    </div>
    <div class="field">
      <label>Your Personal Avatar</label>
      <div style="display:flex;justify-content:center;margin-bottom:16px">
        <div class="user-avatar" style="width:80px;height:80px;border-width:3px">
          <img :src="'https://api.dicebear.com/9.x/glass/svg?seed=' + (onboardName || user?.github_username || 'Researcher')" alt="Avatar">
        </div>
      </div>
      <p class="muted" style="text-align:center;font-size:12px">Avatar is dynamically generated based on your name.</p>
    </div>
    <button class="btn btn-primary btn-full" @click="completeOnboarding">Complete Setup</button>
  </div>
</div>

<div v-else class="app-shell">
  <div class="overlay" :class="{show: sidebarOpen}" @click="sidebarOpen=false"></div>
  <aside class="sidebar" :class="{open: sidebarOpen, collapsed: sidebarCollapsed}">
    <div class="sidebar-brand">
      <div class="mark">DL</div>
      <div v-if="!sidebarCollapsed"><h1>Debate Lab</h1><p>Multi-model analysis</p></div>
    </div>
    <nav class="sidebar-nav">
      <button class="btn btn-ghost nav-item" :class="{active: page==='dashboard'}" @click="page='dashboard'; sidebarOpen=false">
        <svg><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">Dashboard</span>
      </button>
      <button class="btn btn-ghost nav-item" :class="{active: page==='arena'}" @click="goToArena">
        <svg><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">New Debate</span>
      </button>
      <button class="btn btn-ghost nav-item" :class="{active: page==='history'}" @click="page='history'; sidebarOpen=false">
        <svg><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">History</span>
      </button>
      <div style="height:1px;background:var(--glass-border);margin:8px 12px"></div>
      <div v-if="!sidebarCollapsed" class="nav-label muted" style="padding:0 12px;font-size:11px;font-weight:700;margin-top:8px">RECENT</div>
      <div v-for="s in sessions.slice(0,5)" :key="s.id" @click="goToHistory(s)"
           class="btn btn-ghost nav-item" style="font-size:12px;padding:8px 12px;font-weight:400" :title="s.topic">
        <svg v-if="sidebarCollapsed"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <span v-if="!sidebarCollapsed" class="nav-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.topic || 'Untitled' }}</span>
      </button>
      <div style="flex:1"></div>
      <button class="btn btn-ghost nav-item" :class="{active: page==='settings'}" @click="page='settings'; sidebarOpen=false">
        <svg><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">Settings</span>
      </button>
      <button class="btn btn-ghost nav-item" @click="toggleTheme">
        <svg v-if="theme==='dark'"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        <svg v-else><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">Theme</span>
      </button>
      <button class="btn btn-ghost nav-item" :class="{active: page==='help'}" @click="page='help'; sidebarOpen=false">
        <svg><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">Resources</span>
      </button>
      <button class="btn btn-ghost nav-item" @click="toggleSidebarCollapse" style="margin-top:8px">
        <svg v-if="!sidebarCollapsed"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
        <svg v-else><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">Collapse</span>
      </button>
    </nav>
    <div class="sidebar-user">
      <div class="user-avatar" :style="{borderColor: profileAvatarColor}">
        <img :src="'https://api.dicebear.com/9.x/glass/svg?seed=' + (profileName || user?.github_username || 'Researcher')" alt="User">
      </div>
      <span v-if="!sidebarCollapsed" class="user-name">{{ profileName || user?.github_username }}</span>
    </div>
  </aside>

  <main class="main-content">
    <button class="btn btn-ghost btn-icon hamburger" style="position:absolute;top:12px;left:12px;z-index:100" @click="toggleSidebar" v-if="page !== 'arena'">
      <svg><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
    </button>

    <div v-if="page === 'dashboard'" class="page">
      <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">Dashboard</h1>
      <p style="color:var(--ink2);margin-bottom:32px">Welcome back. Here's how your agents are performing.</p>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{{ debates.length }}</div>
          <div class="stat-label">Total Debates</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ sessions.filter(s=>s.mode==='review').length }}</div>
          <div class="stat-label">Reviews</div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:24px">
        <div class="panel-head"><h2>Agent Performance (RL)</h2></div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Agent</th><th>Debates</th><th>Avg Score</th><th>Win Rate</th></tr></thead>
            <tbody>
              <tr v-for="stat in agentStats" :key="stat.agent">
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="chip-dot" :style="{background: AGENT_META[stat.agent]?.color}"></div>
                    {{ stat.name }}
                  </div>
                </td>
                <td>{{ stat.total_debates }}</td>
                <td><span class="pill">{{ stat.avg_score }}/100</span></td>
                <td>{{ stat.win_rate }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      
      <div class="panel">
        <div class="panel-head">
          <h2>Recent Sessions</h2>
          <button class="btn btn-primary btn-sm" @click="goToArena">New Debate</button>
        </div>
        <div class="recent-debates">
          <div v-for="d in sessions.slice(0,5)" :key="d.id" class="debate-card" @click="goToHistory(d)">
            <div class="debate-card-icon"><svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>
            <div class="debate-card-body">
              <div class="debate-card-topic">{{ d.topic || 'Untitled' }}</div>
              <div class="debate-card-meta">{{ d.mode }} · {{ timeAgo(d.created_at) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="page === 'arena'" class="arena-layout">
      <button class="btn btn-ghost btn-icon hamburger" style="position:absolute;top:12px;left:12px;z-index:100" @click="toggleSidebar">
        <svg><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
      
      <div class="chat-feed-container">
        <header class="chat-header" style="padding-left: 56px">
          <h1>{{ topic || 'New Analysis' }}</h1>
          <div style="display:flex;gap:12px;align-items:center">
            <button v-if="jobStatus === 'running'" class="btn btn-secondary btn-sm" @click="interjecting = true">Interject</button>
            <button v-if="jobStatus === 'completed' && !reportSaved" class="btn btn-primary btn-sm" @click="saveReport">Save Report</button>
            <span v-if="reportSaved" class="pill" style="color:var(--success);border-color:var(--success)">Saved</span>
            <button class="btn btn-secondary btn-sm" @click="configOpen = !configOpen">
              <svg><path d="M4 21v-7"></path><path d="M4 10V3"></path><path d="M12 21v-9"></path><path d="M12 8V3"></path><path d="M20 21v-5"></path><path d="M20 12V3"></path><path d="M1 14h6"></path><path d="M9 8h6"></path><path d="M17 16h6"></path></svg>
            </button>
          </div>
        </header>

        <div class="chat-scroll">
          <div v-if="!transcript.length" class="muted" style="text-align:center;padding:60px 20px;max-width:400px;margin:0 auto">
            <svg style="width:48px;height:48px;margin-bottom:16px;opacity:0.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
            <h3 style="color:var(--ink);margin-bottom:8px">Ready to debate</h3>
            <p>Configure agents and input files on the right, then start the analysis.</p>
          </div>

          <div v-for="(entry, i) in transcript" :key="i" class="chat-bubble-row" :class="{human: entry.agent === 'human'}">
            <div class="chat-avatar" :style="{background: AGENT_META[entry.agent]?.color}" v-html="AGENT_META[entry.agent]?.icon || AGENT_META[entry.agent]?.initials">
            </div>
            <div class="chat-bubble-content">
              <div class="chat-agent-name">{{ entry.name }}</div>
              <div class="chat-bubble" :class="entry.agent" v-html="marked.parse(entry.text)"></div>
            </div>
          </div>

          <div v-if="interjecting" class="chat-bubble-row human">
            <div class="chat-avatar" :style="{background: AGENT_META.human.color}" v-html="AGENT_META.human.icon || AGENT_META.human.initials"></div>
            <div class="chat-bubble-content">
              <div class="chat-agent-name">Your Turn</div>
              <div class="chat-bubble human" style="width:100%;max-width:500px">
                <div style="font-weight:600;margin-bottom:8px">Interject an argument to the next agent:</div>
                <textarea v-model="humanInput" placeholder="Type here..." rows="3"></textarea>
                <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
                  <button class="btn btn-ghost btn-sm" @click="interjecting=false">Cancel</button>
                  <button class="btn btn-primary btn-sm" @click="submitInterject">Submit</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="speakingAgent && jobStatus === 'running' && !interjecting" class="chat-bubble-row">
            <div class="chat-avatar" :style="{background: AGENT_META[speakingAgent]?.color}" v-html="AGENT_META[speakingAgent]?.icon || AGENT_META[speakingAgent]?.initials">
            </div>
            <div class="chat-bubble-content">
              <div class="chat-agent-name">{{ AGENT_META[speakingAgent]?.name }}</div>
              <div class="thinking-bubble">
                <div class="dot"></div><div class="dot"></div><div class="dot"></div>
              </div>
            </div>
          </div>

          <div v-if="humanTurn && !interjecting" class="chat-bubble-row human">
            <div class="chat-avatar" :style="{background: AGENT_META.human.color}" v-html="AGENT_META.human.icon || AGENT_META.human.initials"></div>
            <div class="chat-bubble-content">
              <div class="chat-agent-name">Your Turn</div>
              <div class="chat-bubble human" style="width:100%;max-width:500px">
                <div style="font-weight:600;margin-bottom:8px">Add your argument:</div>
                <textarea v-model="humanInput" placeholder="Type here..." rows="3"></textarea>
                <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
                  <button class="btn btn-ghost btn-sm" @click="humanTurn=false">Skip</button>
                  <button class="btn btn-primary btn-sm" @click="submitHuman">Submit</button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="summary" class="chat-bubble-row" style="max-width:100%">
            <div class="panel" style="width:100%;border-color:var(--accent)">
              <div class="panel-head">
                <h2 style="color:var(--accent);display:flex;align-items:center;gap:8px">
                  <svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  Moderator Summary
                </h2>
                <button class="btn btn-secondary btn-sm" @click="downloadReport(topic || 'Report', reportContent)">
                  <svg><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Export MD
                </button>
              </div>
              <div v-html="marked.parse(summary)" style="font-size:14px;line-height:1.6"></div>
            </div>
          </div>
        </div>

        <footer class="arena-footer">
          <div class="arena-input-wrap">
            <input v-model="chatInput" type="text" placeholder="Ask a follow-up question about the report..." 
                   @keydown.enter="sendChat" :disabled="chatLoading || jobStatus === 'running' || !reportContent">
            <button class="btn btn-primary btn-icon" @click="sendChat" :disabled="chatLoading || !reportContent || jobStatus === 'running'">
               <svg><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </div>
        </footer>
      </div>

      <aside class="arena-config" :class="{open: configOpen}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <h2 style="font-size:16px;font-weight:700">Configuration</h2>
          <button class="btn btn-ghost btn-icon btn-sm" @click="configOpen=false" style="display:none" id="mobile-close-config">✕</button>
        </div>
        
        <div class="field">
          <label>Topic / Instructions</label>
          <input v-model="topic" type="text" placeholder="e.g. Find security flaws">
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="field">
            <label>Mode</label>
            <select v-model="mode">
              <option value="review">Review</option>
              <option value="debate">Debate</option>
              <option value="business">Business</option>
              <option value="creative">Creative</option>
              <option value="technical">Technical</option>
            </select>
          </div>
          <div class="field">
            <label>Goal</label>
            <select v-model="goal">
              <option value="rounds">Fixed Rounds</option>
              <option value="consensus">Consensus</option>
              <option value="flaws">Identify Flaws</option>
              <option value="brainstorm">Brainstorm</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 80px;gap:12px">
          <div class="field">
            <label>Stance/Persona</label>
            <select v-model="persona">
              <option value="balanced">Balanced</option>
              <option value="skeptic">Skeptic</option>
              <option value="optimist">Optimist</option>
              <option value="compliance">Compliance</option>
            </select>
          </div>
          <div class="field">
            <label>Rounds</label>
            <input v-model.number="rounds" type="number" min="1" max="5">
          </div>
        </div>

        <div class="field">
          <label>Agents</label>
          <div class="agent-chips">
            <div v-for="(meta, id) in AGENT_META" :key="id" 
                 class="agent-chip" :class="{active: selectedAgents.includes(id)}"
                 :style="{'--agent-color': meta.color}"
                 @click="toggleAgent(id)">
              <div class="chip-dot"></div>
              <div class="chip-name">{{ meta.name.split(' ')[0] }}</div>
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-full" @click="runDebate" :disabled="jobStatus==='running'">
          <svg v-if="jobStatus!=='running'"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          {{ jobStatus==='running' ? 'Running...' : 'Run Analysis' }}
        </button>

        <div style="height:1px;background:var(--glass-border);margin:8px 0"></div>

        <div class="field">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <label>Input Files</label>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="pill">{{ inputFiles.length }}</span>
              <button class="btn btn-danger btn-sm" @click="clearAllInputs" v-if="inputFiles.length">Clear All</button>
            </div>
          </div>
          <div class="file-list" style="margin-top:8px">
            <div v-for="f in inputFiles" :key="f.path" class="file-item">
              <svg style="width:14px;height:14px;color:var(--ink2)"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
              <span class="file-item-name" :title="f.path">{{ f.path.split('/').pop() }}</span>
              <button class="btn btn-ghost btn-icon btn-sm" @click="deleteInputFileObj(f.path)"><svg style="width:14px;height:14px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
          </div>
        </div>

        <label class="upload-zone">
          <svg style="margin:0 auto 8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <div>Click to upload files</div>
          <input type="file" multiple style="display:none" @change="uploadFile">
        </label>

        <div class="field" style="margin-top:-8px">
          <div style="display:flex;gap:8px">
            <input v-model="cloneUrl" type="url" placeholder="GitHub URL">
            <button class="btn btn-secondary" @click="cloneRepo">Clone</button>
          </div>
        </div>
        
        <div class="field">
          <label>Direct Draft</label>
          <textarea v-model="draftContent" placeholder="Paste text here..." style="min-height:80px;font-size:12px"></textarea>
        </div>
      </aside>
    </div>

    <div v-if="page === 'history'" class="page">
      <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">History</h1>
      <p style="color:var(--ink2);margin-bottom:32px">Review past debates and analyses.</p>

      <div v-if="selectedReport && reportContent" class="panel" style="margin-bottom:24px">
        <div class="panel-head">
          <div style="display:flex;align-items:center;gap:12px">
            <h2>{{ selectedReport }}</h2>
            <button class="btn btn-secondary btn-sm" @click="downloadReport(selectedReport, reportContent)">Export</button>
          </div>
          <button class="btn btn-ghost btn-sm" @click="selectedReport=null; reportContent=''">✕ Close</button>
        </div>
        <div class="report-view" v-html="reportHtml" style="font-size:14px;line-height:1.6;max-height:50vh;overflow-y:auto;padding-right:12px"></div>
        <div class="chat-panel" style="margin-top:20px;border-top:1px solid var(--glass-border);padding-top:20px">
          <h3 style="font-size:14px;margin-bottom:12px">Ask about this report</h3>
          <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:12px;max-height:200px;overflow-y:auto">
            <div v-for="(msg, i) in chatMessages" :key="i" style="padding:10px 14px;border-radius:12px;font-size:13px;max-width:85%" :style="msg.role==='user'?'align-self:flex-end;background:var(--accent-glow);border:1px solid var(--accent)':'align-self:flex-start;background:var(--glass-bg);border:1px solid var(--glass-border)'">
              {{ msg.text }}
            </div>
            <div v-if="chatLoading" style="align-self:flex-start;padding:10px 14px;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:12px;font-size:13px">Thinking...</div>
          </div>
          <div style="display:flex;gap:8px">
            <input v-model="chatInput" type="text" placeholder="Type question..." @keydown.enter="sendChat">
            <button class="btn btn-primary" @click="sendChat" :disabled="chatLoading">Send</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <input v-model="historySearch" type="text" placeholder="Search topics..." style="max-width:300px">
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Topic</th><th>Mode</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              <tr v-if="!filteredReports.length"><td colspan="4" style="text-align:center;padding:32px;color:var(--ink2)">No reports found.</td></tr>
              <tr v-for="r in filteredReports" :key="r.id">
                <td style="font-weight:600">{{ r.topic || r.name }}</td>
                <td><span class="pill">{{ r.mode }}</span></td>
                <td>{{ timeAgo(r.created_at || Date.now()) }}</td>
                <td>
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-secondary btn-sm" @click="loadReport(r.name)">View</button>
                    <button class="btn btn-danger btn-sm" @click="deleteReport(r.name)">Delete</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="page === 'settings'" class="page">
      <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">Settings</h1>
      <p style="color:var(--ink2);margin-bottom:32px">Manage your API keys and preferences.</p>

      <div class="settings-grid">
        <div class="panel">
          <div class="panel-head"><h2>Appearance</h2></div>
          <div class="field">
            <label>Theme</label>
            <button class="btn btn-secondary" @click="toggleTheme" style="width:fit-content">
              {{ theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode' }}
            </button>
          </div>
          <div class="field" style="margin-top:24px">
            <label>Display Name</label>
            <input v-model="profileName" type="text" @change="saveLocalKeys">
          </div>
          <div class="field">
            <label>Avatar Color</label>
            <div class="avatar-options">
              <div v-for="c in ['#3fb950','#da3633','#388bfd','#ff6b35','#4d9fff','#cc785c','#d4a017','#9b59b6']" :key="c"
                   class="avatar-option" :class="{selected: profileAvatarColor === c}"
                   :style="{background:c}" @click="profileAvatarColor = c; saveLocalKeys()">
                <img :src="'https://api.dicebear.com/9.x/glass/svg?seed=' + (profileName || user?.github_username || 'Researcher')" alt="Avatar" style="width:100%;border-radius:50%">
              </div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>API Key Security</h2></div>
          <div class="field">
             <label class="check-item" style="flex-direction:row-reverse;justify-content:flex-end;gap:12px">
                <span>Only keep keys for this session (more secure)</span>
                <input type="checkbox" v-model="sessionOnlyKeys" @change="saveLocalKeys">
             </label>
             <p class="muted" style="font-size:12px;margin-top:8px">If enabled, keys will be deleted as soon as you close your browser tab.</p>
          </div>
          
          <div style="height:1px;background:var(--glass-border);margin:20px 0"></div>

          <div class="panel-head"><h2>API Keys</h2></div>
          <div v-for="provider in ['groq', 'google', 'kimi', 'deepseek', 'claude']" :key="provider" class="field" style="padding-bottom:16px;border-bottom:1px solid var(--glass-border)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <label style="text-transform:capitalize">{{ provider }} API Key</label>
              <span v-if="keysStatus[provider]" class="pill" :style="keysStatus[provider]==='valid'?'color:var(--success)':keysStatus[provider]==='testing'?'color:var(--accent)':'color:var(--danger)'">
                {{ keysStatus[provider] }}
              </span>
            </div>
            <div style="display:flex;gap:8px">
              <input v-model="keys[provider]" type="password" placeholder="Paste key here..." @change="saveLocalKeys">
              <button class="btn btn-secondary" @click="validateKey(provider)" :disabled="!keys[provider] || keysStatus[provider]==='testing'">Test</button>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>Account</h2></div>
          <div style="display:flex;align-items:center;gap:16px">
            <div class="user-avatar" :style="{borderColor: profileAvatarColor, width:'64px', height:'64px'}">
               <img :src="'https://api.dicebear.com/9.x/glass/svg?seed=' + (profileName || user?.github_username || 'Researcher')" alt="User">
            </div>
            <div>
              <div style="font-weight:700;font-size:16px">{{ user?.github_username }}</div>
              <div style="font-size:13px;color:var(--ink2)">Authenticated via {{ user?.github_username ? 'GitHub' : 'Email' }}</div>
            </div>
            <a href="/auth/logout" class="btn btn-secondary" style="margin-left:auto">Sign Out</a>
          </div>
        </div>
      </div>
    </div>
    
    <div v-if="page === 'help'" class="page">
      <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">Resources & Documentation</h1>
      <p style="color:var(--ink2);margin-bottom:32px">Master the art of multi-model analysis.</p>
      
      <div class="settings-grid">
        <div class="panel">
          <h2>Getting Started</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:20px;margin-top:20px">
            <div class="stat-card" style="padding:20px">
                <div class="stat-value" style="font-size:20px">01.</div>
                <div class="stat-label">Add your API keys in Settings. You need at least one (Groq/Gemini/Copilot) to run a debate.</div>
            </div>
            <div class="stat-card" style="padding:20px">
                <div class="stat-value" style="font-size:20px">02.</div>
                <div class="stat-label">Upload your input files or clone a repo in the Arena. This provides the context for analysis.</div>
            </div>
            <div class="stat-card" style="padding:20px">
                <div class="stat-value" style="font-size:20px">03.</div>
                <div class="stat-label">Configure the Goal and Personas, click Run, and watch the agents tear your work apart.</div>
            </div>
          </div>
        </div>
        
        <div class="panel">
          <h2>Prompt Library (Topic Examples)</h2>
          <div style="display:grid;gap:12px;margin-top:16px">
            <div class="debate-card" style="cursor:default" @click="topic='Review the security and scalability of this codebase. Find at least 3 critical vulnerabilities.'">
                <div class="debate-card-body">
                    <div class="debate-card-topic">🛡️ Security Auditor</div>
                    <div class="debate-card-meta">'Review the security and scalability of this codebase. Find at least 3 critical vulnerabilities.'</div>
                </div>
            </div>
            <div class="debate-card" style="cursor:default" @click="topic='Critique this business plan from a VC perspective. Be harsh about the unit economics and market fit.'">
                <div class="debate-card-body">
                    <div class="debate-card-topic">💰 VC Pitch Roaster</div>
                    <div class="debate-card-meta">'Critique this business plan from a VC perspective. Be harsh about the unit economics and market fit.'</div>
                </div>
            </div>
            <div class="debate-card" style="cursor:default" @click="topic='Summarize the key findings of this paper and identify any data that contradicts the authors conclusion.'">
                <div class="debate-card-body">
                    <div class="debate-card-topic">🔬 Academic Peer Review</div>
                    <div class="debate-card-meta">'Summarize the key findings of this paper and identify any data that contradicts the authors conclusion.'</div>
                </div>
            </div>
          </div>
        </div>

        <div class="panel">
          <h2>System Architecture</h2>
          <div style="margin-top:20px;background:rgba(0,0,0,0.2);padding:20px;border-radius:12px;font-family:monospace;font-size:12px;white-space:pre;overflow-x:auto">
[Your Browser] --- (Encrypted Keys) ---&gt; [FastAPI Server]
      |                                     |
      | (Polling)                           | (Orchestration)
      v                                     v
[UI Progress] &lt;--- (Job Stats) --- [Agents Loop (RL Sorted)]
                                            |
                                  +---------+---------+
                                  |         |         |
                               [GPT]    [Claude]   [Llama]
          </div>
          <p style="margin-top:16px;font-size:14px;line-height:1.6;color:var(--ink2)">
            Debate Lab uses a Reinforcement Learning (RL) engine to track which models produce the most logically sound and specific arguments. Over time, the best models are automatically moved to the "Rebuttal" phase of the debate to provide the highest quality counters.
          </p>
        </div>
      </div>
    </div>

  </main>
</div>
  `
}).mount("#app");
