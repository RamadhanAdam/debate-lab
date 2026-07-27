import { AGENT_META, AVATAR_STYLES, GENDER_OPTIONS, PRONOUN_OPTIONS, formatBytes, timeAgo, avatarUrl } from "./constants.js?v=20260606";
import { 
  checkAuthReq, emailSignInReq, emailRegisterReq, emailResetPasswordReq
} from "./auth.js?v=20260606";
import { 
  api, fetchStatus, fetchInputs, saveInput, deleteInput, deleteAllInputsReq,
  createFolderReq, fetchDocsReq, fetchDocReq, fetchReports, fetchReport, deleteReportReq, cloneRepoReq, sendChatReq,
  validateKeyReq, fetchAgentStats, fetchSessions, fetchSupport, submitSupportReq
} from "./api.js?v=20260606";
import { useArena } from "./arena.js?v=20260606";
const { createApp, ref, computed, onMounted, onBeforeUnmount, watch } = window.Vue;

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
    const accountMenuOpen = ref(false);
    function toggleAccountMenu() { accountMenuOpen.value = !accountMenuOpen.value; }
    function closeAccountMenu() { accountMenuOpen.value = false; }

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
    const authEmail = ref("");
    const loginPassword = ref("");
    const loginMode = ref("signin");
    const loginPasswordVisible = ref(false);
    const registerPassword = ref("");
    const registerConfirmPassword = ref("");
    const loginLoading = ref(false);
    const resetNotice = ref("");
    const resetCooldown = ref(0);
    let resetTimer = null;
    
    const onboardName = ref("");
    const onboardAvatarColor = ref("#3fb950");
    const onboardGender = ref("unspecified");
    const onboardPronouns = ref("they/them");
    const onboardAvatarStyle = ref("classic");
    const onboardUseGithubAvatar = ref(false);
    const onboardDone = ref(false);

    const profileName = ref("");
    const profileAvatarColor = ref("#3fb950");
    const profileGender = ref("unspecified");
    const profilePronouns = ref("they/them");
    const profileAvatarStyle = ref("classic");
    const profileUseGithubAvatar = ref(false);

    // Keys
    const keys = ref({ groq: "", google: "", kimi: "", deepseek: "", claude: "" });
    const keysStatus = ref({ groq: null, google: null, kimi: null, deepseek: null, claude: null });
    const modelHeadroom = ref({ groq: 100, google: 100, kimi: 100, deepseek: 100, claude: 100 });
    const sessionOnlyKeys = ref(localStorage.getItem("dl_session_only") !== "false");

    // Dashboard & History
    const debates = ref([]);
    const sessions = ref([]);
    const agentStats = ref([]);
    const loadingDebates = ref(false);
    const historySearch = ref("");
    const selectedReports = ref([]);

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
    const newFolderName = ref("");
    const uploadStatus = ref("");

    // Report / Chat
    const reports = ref([]);
    const selectedReport = ref(null);
    const reportContent = ref("");
    const reportHtml = computed(() => reportContent.value ? renderMarkdownSafe(reportContent.value) : "");
    const followupQuestions = ref([]);
    const chatMessages = ref([]);
    const chatInput = ref("");
    const chatLoading = ref(false);
    const chatAssistantLabel = computed(() => keys.value.groq ? "Assistant" : "Local Assistant");
    const docs = ref([]);
    const selectedDoc = ref("");
    const docTitle = ref("");
    const docContent = ref("");
    const docLoading = ref(false);
    const supportItems = ref([]);
    const supportCategory = ref("feedback");
    const supportSubject = ref("");
    const supportMessage = ref("");
    const supportContact = ref("");
    const supportSubmitting = ref(false);
    function escapeHtml(value) {
      return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
    function renderMarkdownSafe(value) {
      return marked.parse(escapeHtml(value || ""));
    }
    const docHtml = computed(() => docContent.value ? renderMarkdownSafe(docContent.value) : "");
    function reportChatKey(scope) {
      return `dl_report_chat_${String(scope || "conversation").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
    }
    function loadSavedChat(scope) {
      try {
        const raw = localStorage.getItem(reportChatKey(scope));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    function saveSavedChat(scope, messages) {
      try {
        localStorage.setItem(reportChatKey(scope), JSON.stringify(messages.slice(-50)));
      } catch {}
    }
    function currentChatScope() {
      return selectedReport.value || String(currentJobId.value || topic.value || "conversation");
    }
    const conversationName = computed(() => {
      const source = selectedReport.value || topic.value || "conversation";
      return String(source)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "conversation";
    });

    function extractFollowupQuestions(markdown) {
      if (!markdown) return [];
      const lines = String(markdown).split(/\r?\n/);
      const questions = [];
      let inSection = false;
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (/^##+\s+suggested follow[- ]up questions/i.test(line)) {
          inSection = true;
          continue;
        }
        if (inSection && /^##+\s+/.test(line)) break;
        if (!inSection) continue;
        const match = line.match(/^[*-]\s+(.*)$/);
        if (match && match[1].trim()) questions.push(match[1].trim());
      }
      return questions;
    }

    function resetRecoveryState() {
      resetNotice.value = "";
      resetCooldown.value = 0;
      if (resetTimer) {
        clearInterval(resetTimer);
        resetTimer = null;
      }
    }

    function startResetCooldown(seconds = 30) {
      if (resetTimer) clearInterval(resetTimer);
      resetCooldown.value = seconds;
      resetTimer = setInterval(() => {
        if (resetCooldown.value <= 1) {
          resetCooldown.value = 0;
          clearInterval(resetTimer);
          resetTimer = null;
          return;
        }
        resetCooldown.value -= 1;
      }, 1000);
    }

    // Functions

    async function emailSignIn() {
      const email = authEmail.value.trim();
      loginLoading.value = true;
      try {
        await emailSignInReq(email, loginPassword.value);
        window.location.href = "/";
      } catch (e) {
        addToast("Sign In Failed", e.message, "error");
      } finally { loginLoading.value = false; }
    }

    async function emailRegister() {
      if (!registerPassword.value || registerPassword.value !== registerConfirmPassword.value) {
        addToast("Password Mismatch", "Make sure both passwords match.", "error");
        return;
      }
      const email = authEmail.value.trim();
      loginLoading.value = true;
      try {
        await emailRegisterReq(email, registerPassword.value);
        addToast("Success", "Check your email to confirm", "success");
        loginMode.value = "signin";
      } catch (e) {
        addToast("Registration Failed", e.message, "error");
      } finally { loginLoading.value = false; }
    }

    async function forgotPassword() {
      const email = authEmail.value.trim();
      if (!email) {
        addToast("Email Required", "Enter the account email to reset the password.", "info");
        return;
      }
      loginLoading.value = true;
      try {
        await emailResetPasswordReq(email);
        resetNotice.value = "If an account exists for that address, we've sent a recovery email. Check inbox, spam, and promotions.";
        startResetCooldown(30);
        addToast("Reset Sent", "Check your email for a recovery link.", "success");
      } catch (e) {
        resetNotice.value = "";
        addToast("Reset Failed", e.message, "error");
      } finally { loginLoading.value = false; }
    }

    function loadLocalKeys() {
      const storage = sessionOnlyKeys.value ? sessionStorage : localStorage;
      keys.value.groq = storage.getItem("dl_key_groq") || "";
      keys.value.google = storage.getItem("dl_key_google") || "";
      keys.value.kimi = storage.getItem("dl_key_kimi") || "";
      keys.value.deepseek = storage.getItem("dl_key_deepseek") || "";
      keys.value.claude = storage.getItem("dl_key_claude") || "";
      if (sessionOnlyKeys.value) {
        for (const key of ["dl_key_groq", "dl_key_google", "dl_key_kimi", "dl_key_deepseek", "dl_key_claude"]) {
          localStorage.removeItem(key);
        }
      }
      
      profileName.value = localStorage.getItem("dl_name") || "";
      profileAvatarColor.value = localStorage.getItem("dl_color") || "#3fb950";
      profileGender.value = localStorage.getItem("dl_gender") || "unspecified";
      profilePronouns.value = localStorage.getItem("dl_pronouns") || "they/them";
      profileAvatarStyle.value = localStorage.getItem("dl_avatar_style") || "classic";
      profileUseGithubAvatar.value = localStorage.getItem("dl_use_github_avatar") === "true";
      onboardDone.value = !!localStorage.getItem("dl_onboard_done");
    }

    function setHeadroom(provider, value) {
      modelHeadroom.value[provider] = Math.max(0, Math.min(100, value));
    }

    function getHeadroom(provider) {
      const status = keysStatus.value[provider];
      if (!keys.value[provider]) return 0;
      if (status === "valid") return modelHeadroom.value[provider] ?? 100;
      if (status === "testing") return 50;
      if (status === "limited") return 10;
      if (status === "invalid") return 0;
      return modelHeadroom.value[provider] ?? 60;
    }

    function saveLocalKeys() {
      const storage = sessionOnlyKeys.value ? sessionStorage : localStorage;
      localStorage.setItem("dl_session_only", sessionOnlyKeys.value);
      if (sessionOnlyKeys.value) {
        localStorage.removeItem("dl_key_groq");
        localStorage.removeItem("dl_key_google");
        localStorage.removeItem("dl_key_kimi");
        localStorage.removeItem("dl_key_deepseek");
        localStorage.removeItem("dl_key_claude");
      }
      storage.setItem("dl_key_groq", keys.value.groq);
      storage.setItem("dl_key_google", keys.value.google);
      storage.setItem("dl_key_kimi", keys.value.kimi);
      storage.setItem("dl_key_deepseek", keys.value.deepseek);
      storage.setItem("dl_key_claude", keys.value.claude);
      
      localStorage.setItem("dl_name", profileName.value);
      localStorage.setItem("dl_color", profileAvatarColor.value);
      localStorage.setItem("dl_gender", profileGender.value);
      localStorage.setItem("dl_pronouns", profilePronouns.value);
      localStorage.setItem("dl_avatar_style", profileAvatarStyle.value);
      localStorage.setItem("dl_use_github_avatar", profileUseGithubAvatar.value);
      addToast("Settings Saved", "Your preferences have been stored.", "success");
    }

    function clearSavedKeys() {
      for (const key of ["dl_key_groq", "dl_key_google", "dl_key_kimi", "dl_key_deepseek", "dl_key_claude"]) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      }
      keys.value = { groq: "", google: "", kimi: "", deepseek: "", claude: "" };
      addToast("Cleared", "Saved API keys were removed from this browser.", "info");
    }

    function signOut() {
      clearSavedKeys();
      window.location.href = "/auth/logout";
    }

    function openAccountSettings() {
      page.value = "settings";
      sidebarOpen.value = false;
      accountMenuOpen.value = false;
    }

    function openMyProfile() {
      page.value = "settings";
      sidebarOpen.value = false;
      accountMenuOpen.value = false;
    }

    function setTheme(mode) {
      theme.value = mode;
      localStorage.setItem("dl_theme", theme.value);
      document.documentElement.setAttribute("data-theme", theme.value);
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
          setHeadroom(provider, 100);
          addToast("Key Valid", `${provider} API key is working.`, "success");
        } else {
          const err = String(res.error || "Invalid key");
          keysStatus.value[provider] = /rate limit|quota/i.test(err) ? "limited" : "invalid";
          setHeadroom(provider, /rate limit|quota/i.test(err) ? 10 : 0);
          addToast("Key Invalid", err, "error");
        }
      } catch (e) {
        const err = String(e.message || e);
        keysStatus.value[provider] = /rate limit|quota/i.test(err) ? "limited" : "invalid";
        setHeadroom(provider, /rate limit|quota/i.test(err) ? 10 : 0);
        addToast("Error", e.message, "error");
      }
    }

    function completeOnboarding() {
      profileName.value = onboardName.value || user.value?.github_username || "Researcher";
      profileAvatarColor.value = onboardAvatarColor.value;
      profileGender.value = onboardGender.value;
      profilePronouns.value = onboardPronouns.value;
      profileAvatarStyle.value = onboardAvatarStyle.value;
      profileUseGithubAvatar.value = onboardUseGithubAvatar.value;
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
      if (!draftContent.value.trim()) return;
      try {
        await saveInput("web_brief.md", draftContent.value);
        await loadInputFiles();
        addToast("Draft Saved", "Content added as web_brief.md", "success");
      } catch (e) {
        addToast("Save Failed", e.message, "error");
      }
    }

    async function createFolder() {
      const name = newFolderName.value.trim();
      if (!name) return;
      try {
        await createFolderReq(name);
        newFolderName.value = "";
        await loadInputFiles();
        addToast("Created", `Folder ${name} added`, "success");
      } catch (e) {
        addToast("Error", e.message, "error");
      }
    }

    async function deleteInputFileObj(name) {
      try {
        await deleteInput(name);
        await loadInputFiles();
      } catch (e) {
        addToast("Error", "Failed to delete file", "error");
      }
    }

    async function clearAllInputs() {
      if (!confirm("Are you sure you want to delete all input files?")) return;
      try {
        await deleteAllInputsReq();
        await loadInputFiles();
        uploadStatus.value = "All input files were deleted.";
        addToast("Cleared", "All input files have been deleted.", "info");
      } catch (e) {
        addToast("Error", "Failed to clear inputs", "error");
      }
    }

    function bytesToBase64(bytes) {
      let binary = "";
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    }

    async function uploadFile(event) {
      const files = event.target.files;
      if (!files || !files.length) return;

      let uploaded = 0;
      let failed = 0;
      let lastFileName = "";
      
      addToast("Uploading", `Preparing to upload ${files.length} file(s)...`, "info");
      
      try {
        for (const file of files) {
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            await saveInput(file.name, bytesToBase64(bytes), "base64");
            uploaded += 1;
            lastFileName = file.name;
          } catch (fileError) {
            failed += 1;
            console.warn(`Skipping failed upload for ${file.name}:`, fileError);
          }
        }
        await loadInputFiles();
        
        if (uploaded > 0) {
          const msg = uploaded === 1 ? `Uploaded ${lastFileName}` : `Uploaded ${uploaded} document(s)`;
          uploadStatus.value = msg;
          addToast("Success", msg, "success");
        }
        if (failed > 0) {
          const msg = uploaded > 0
            ? `${uploaded} file(s) uploaded, ${failed} file(s) failed.`
            : `${failed} file(s) failed to upload.`;
          uploadStatus.value = msg;
          addToast("Upload Issue", msg, "warning");
        }
      } catch (e) {
        console.error("Upload error:", e);
        addToast("Upload Failed", e.message || "Could not save files", "error");
        uploadStatus.value = "Upload failed.";
      } finally {
        if (event.target) event.target.value = "";
      }
    }

    async function cloneRepo() {
      if (!cloneUrl.value) return;
      addToast("Cloning", "Repository cloning started...", "info");
      try {
        const res = await cloneRepoReq(cloneUrl.value);
        await loadInputFiles();
        cloneUrl.value = "";
        uploadStatus.value = `Cloned ${res.files_copied} file(s) from the repository.`;
        addToast("Success", `Cloned ${res.files_copied} files`, "success");
      } catch (e) {
        uploadStatus.value = "Repository clone failed.";
        addToast("Clone Failed", e.message, "error");
      }
    }

    // Arena Setup
    const arenaState = {
      selectedAgents, jobMsg, jobStatus, saveDraft, arenaActive, reportSaved,
      transcript, agentScores, warnings, summary, reportContent, followupQuestions, currentRound,
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
      followupQuestions.value = [];
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

    async function loadDocs() {
      try {
        const data = await fetchDocsReq();
        docs.value = data.docs || [];
      } catch (e) {}
    }

    async function loadSupport() {
      try {
        const data = await fetchSupport();
        supportItems.value = data.items || [];
      } catch (e) {}
    }

    function openDoc(slug) {
      window.location.href = slug === "readme" ? "/docs" : `/docs/${slug}`;
    }

    async function submitSupport() {
      const message = supportMessage.value.trim();
      if (!message) {
        addToast("Message Required", "Please write a short note for support.", "info");
        return;
      }
      supportSubmitting.value = true;
      try {
        await submitSupportReq({
          category: supportCategory.value,
          subject: supportSubject.value.trim() || "Support request",
          message,
          contact: supportContact.value.trim(),
          page: page.value,
        });
        supportMessage.value = "";
        supportSubject.value = "";
        await loadSupport();
        addToast("Submitted", "Your note was added to the support inbox.", "success");
      } catch (e) {
        addToast("Support Error", e.message || "Could not send message", "error");
      } finally {
        supportSubmitting.value = false;
      }
    }

    async function loadReport(name) {
      selectedReport.value = name;
      try {
        const data = await fetchReport(name);
        reportContent.value = data.content;
        followupQuestions.value = extractFollowupQuestions(data.content);
        chatMessages.value = loadSavedChat(name);
      } catch (e) { addToast("Error", "Failed to load report", "error"); }
    }

    function closeReport() {
      saveSavedChat(currentChatScope(), chatMessages.value);
      selectedReport.value = null;
      reportContent.value = "";
      followupQuestions.value = [];
      chatMessages.value = [];
    }

    async function deleteReport(name) {
      if (!confirm(`Delete ${name}?`)) return;
      await deleteReportReq(name);
      await loadReportsData();
      await loadDashboard();
      addToast("Deleted", "Report removed", "info");
    }

    async function deleteSelectedReports() {
      if (!selectedReports.value.length) return;
      if (!confirm(`Delete ${selectedReports.value.length} reports?`)) return;
      for (const name of selectedReports.value) {
        await deleteReportReq(name);
      }
      selectedReports.value = [];
      await loadReportsData();
      await loadDashboard();
      addToast("Deleted", "Selected reports removed", "info");
    }

    function toggleSelectAll() {
      if (selectedReports.value.length === filteredReports.value.length) {
        selectedReports.value = [];
      } else {
        selectedReports.value = filteredReports.value.map(r => r.name);
      }
    }

    async function deleteAccount() {
      if (!confirm("PERMANENTLY DELETE ACCOUNT? This cannot be undone.")) return;
      try {
        await api("/auth/delete-account", { method: "DELETE" });
        window.location.href = "/auth/logout";
      } catch (e) {
        addToast("Error", "Failed to delete account", "error");
      }
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
        chatMessages.value.push({ role: "assistant", text: data.reply, source: data.mode || (keys.value.groq ? "groq" : "local") });
        saveSavedChat(currentChatScope(), chatMessages.value);
      } catch (e) {
        addToast("Chat Error", e.message, "error");
      } finally { chatLoading.value = false; }
    }

    async function saveConversation() {
      const lines = [];
      lines.push(`# Conversation: ${selectedReport.value || topic.value || "Untitled"}`);
      lines.push("");
      lines.push(`- Date: ${new Date().toISOString()}`);
      if (selectedReport.value) lines.push(`- Report: ${selectedReport.value}`);
      if (topic.value) lines.push(`- Topic: ${topic.value}`);
      lines.push("");
      lines.push("## Messages");
      lines.push("");
      for (const msg of chatMessages.value) {
        lines.push(`### ${msg.role === "user" ? "You" : "Assistant"}`);
        lines.push(msg.text);
        lines.push("");
      }
      if (!chatMessages.value.length) {
        addToast("No Chat", "There is no conversation to save yet.", "info");
        return;
      }
      saveSavedChat(currentChatScope(), chatMessages.value);
      await saveInput(`conversations/${conversationName.value}.md`, lines.join("\n"));
      await loadInputFiles();
      addToast("Saved", `Conversation stored in conversations/${conversationName.value}.md`, "success");
    }

    onMounted(() => {
      checkAuth();
      setInterval(() => {
        if (user.value) checkAuth();
      }, 5 * 60 * 1000);
    });

    onBeforeUnmount(() => {
      if (resetTimer) clearInterval(resetTimer);
    });

    watch(page, (val) => {
      if (val === "arena" || val === "files") loadInputFiles();
      if (val === "history") { loadReportsData(); loadDashboard(); }
      if (val === "help") loadDocs();
      if (val === "support") loadSupport();
      if (val === "dashboard") loadDashboard();
    });

    watch(loginMode, (mode) => {
      if (mode !== "forgot") resetRecoveryState();
      if (mode !== "register") {
        registerPassword.value = "";
        registerConfirmPassword.value = "";
      }
      if (mode !== "signin") {
        loginPassword.value = "";
      }
      loginPasswordVisible.value = false;
    });

    watch(warnings, (value) => {
      const warningsText = Array.isArray(value) ? value.join(" ").toLowerCase() : String(value || "").toLowerCase();
      const lowRate = /rate limit|quota|429/.test(warningsText);
      if (!lowRate) return;
      for (const provider of ["groq", "google", "kimi", "deepseek", "claude"]) {
        const meta = provider === "google" ? "gemini" : provider;
        const agentName = AGENT_META[provider]?.name?.toLowerCase() || "";
        if (warningsText.includes(meta) || (agentName && warningsText.includes(agentName))) {
          keysStatus.value[provider] = "limited";
          setHeadroom(provider, 10);
        }
      }
    }, { deep: true });

    const marked = window.marked;
    const userAvatarSrc = computed(() => {
      const name = profileName.value || user.value?.github_username || "Researcher";
      if (profileUseGithubAvatar.value && user.value?.github_avatar) {
        return user.value.github_avatar;
      }
      return avatarUrl(name, {
        gender: profileGender.value,
        style: profileAvatarStyle.value,
        accent: profileAvatarColor.value,
      });
    });
    const onboardAvatarSrc = computed(() => avatarUrl(
      onboardName.value || user.value?.github_username || "Researcher",
      {
        gender: onboardGender.value,
        style: onboardAvatarStyle.value,
        accent: onboardAvatarColor.value,
      }
    ));

    return {
      user, authChecked, page, theme, toggleTheme,
      sidebarOpen, toggleSidebar, sidebarCollapsed, toggleSidebarCollapse, toasts, accountMenuOpen, toggleAccountMenu, closeAccountMenu,
      authEmail, loginPassword, loginPasswordVisible, loginMode, loginLoading, emailSignIn, emailRegister, registerPassword, registerConfirmPassword, forgotPassword, resetNotice, resetCooldown,
      onboardName, onboardAvatarColor, onboardGender, onboardPronouns, onboardAvatarStyle, onboardUseGithubAvatar, onboardAvatarSrc, onboardDone, completeOnboarding,
      profileName, profileAvatarColor, profileGender, profilePronouns, profileAvatarStyle, profileUseGithubAvatar, keys, keysStatus, sessionOnlyKeys, saveLocalKeys, clearSavedKeys, signOut, validateKey, deleteAccount, openAccountSettings, openMyProfile, setTheme,
      debates, sessions, agentStats, loadingDebates, historySearch, selectedReports,
      topic, mode, goal, persona, rounds, selectedAgents, toggleAgent,
      jobStatus, jobMsg, currentJobId, arenaActive, configOpen, reportSaved, currentRound, totalRounds,
      speakingAgent, transcript, agentScores, warnings, summary, resultMode, humanTurn, humanInput, interjecting,
      runDebate, saveReport, submitHuman, submitInterject, downloadReport,
      inputFiles, draftContent, deleteInputFileObj, clearAllInputs, uploadFile, cloneUrl, cloneRepo, newFolderName, createFolder, uploadStatus,
      reports, filteredReports, selectedReport, reportContent, reportHtml, followupQuestions, loadReport, closeReport, deleteReport, deleteSelectedReports, toggleSelectAll,
      chatMessages, chatInput, chatLoading, chatAssistantLabel, sendChat, saveConversation,
      goToArena, goToHistory,
      docs, selectedDoc, docTitle, docContent, docHtml, docLoading, openDoc,
      supportItems, supportCategory, supportSubject, supportMessage, supportContact, supportSubmitting, submitSupport, loadSupport,
      AGENT_META, AVATAR_STYLES, GENDER_OPTIONS, PRONOUN_OPTIONS, formatBytes, timeAgo, marked, avatarUrl, userAvatarSrc, getHeadroom, renderMarkdownSafe
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
        <p style="color:var(--ink2);line-height:1.6;max-width:32ch">Review files, track debates, and keep the conversation moving without losing the thread.</p>
        <div style="display:grid;gap:10px;margin-top:24px">
          <div style="display:flex;gap:10px;align-items:center">
            <svg style="color:var(--accent);flex-shrink:0"><path d="M4 6h16M4 12h10M4 18h16"/></svg>
            <span class="muted" style="font-size:13px">Clean review runs with saved history</span>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <svg style="color:var(--success);flex-shrink:0"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/></svg>
            <span class="muted" style="font-size:13px">Private uploads, folders, and repo clones</span>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <svg style="color:var(--warning);flex-shrink:0"><path d="M12 2v6"/><path d="M12 14v8"/><circle cx="12" cy="12" r="10"/></svg>
            <span class="muted" style="font-size:13px">Follow-up chat after the rounds finish</span>
          </div>
        </div>
      </div>
      <div class="login-card-right">
        <a href="/auth/login" class="btn btn-secondary btn-full" style="background:var(--ink);color:var(--bg)">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33c.85 0 1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2Z"/></svg>
        Continue with GitHub
        </a>
      <div class="auth-tabs">
        <button class="auth-tab" :class="{active: loginMode==='signin'}" @click="loginMode='signin'">Sign In</button>
        <button class="auth-tab" :class="{active: loginMode==='register'}" @click="loginMode='register'">Create Account</button>
        <button class="auth-tab" :class="{active: loginMode==='forgot'}" @click="loginMode='forgot'">Forgot Password</button>
      </div>
      <div class="field" style="margin-bottom:8px">
        <input v-model="authEmail" type="email" placeholder="Email address" autocomplete="email" inputmode="email">
      </div>
      <template v-if="loginMode==='signin'">
        <div class="field" style="margin-bottom:16px">
          <div style="display:flex;gap:8px;align-items:center">
            <input v-model="loginPassword" :type="loginPasswordVisible ? 'text' : 'password'" placeholder="Password" autocomplete="current-password">
            <button class="btn btn-secondary btn-sm" type="button" @click="loginPasswordVisible = !loginPasswordVisible" style="white-space:nowrap">
              {{ loginPasswordVisible ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>
        <button class="btn btn-primary btn-full" @click="emailSignIn" :disabled="loginLoading">Sign In</button>
        <button class="btn btn-ghost btn-full" @click="loginMode='forgot'">Forgot password?</button>
      </template>
      <template v-else-if="loginMode==='register'">
        <div class="field" style="margin-bottom:8px">
          <div style="display:flex;gap:8px;align-items:center">
            <input v-model="registerPassword" :type="loginPasswordVisible ? 'text' : 'password'" placeholder="Create password" autocomplete="new-password">
            <button class="btn btn-secondary btn-sm" type="button" @click="loginPasswordVisible = !loginPasswordVisible" style="white-space:nowrap">
              {{ loginPasswordVisible ? 'Hide' : 'Show' }}
            </button>
          </div>
        </div>
        <div class="field" style="margin-bottom:16px">
          <input v-model="registerConfirmPassword" :type="loginPasswordVisible ? 'text' : 'password'" placeholder="Confirm password" autocomplete="new-password">
        </div>
        <button class="btn btn-primary btn-full" @click="emailRegister" :disabled="loginLoading">Create Account</button>
        <button class="btn btn-ghost btn-full" @click="loginMode='signin'">Back to sign in</button>
      </template>
      <template v-else>
        <p class="muted" style="margin:0 0 12px;font-size:12px;line-height:1.5">
          We will send a recovery email to this address. Check inbox, spam, and promotions.
        </p>
        <div v-if="resetNotice" class="status completed" style="margin-bottom:12px">{{ resetNotice }}</div>
        <button class="btn btn-primary btn-full" @click="forgotPassword" :disabled="loginLoading || resetCooldown > 0">
          {{ resetCooldown > 0 ? ('Resend in ' + resetCooldown + 's') : (resetNotice ? 'Resend reset link' : 'Send reset link') }}
        </button>
        <button class="btn btn-ghost btn-full" @click="loginMode='signin'">Back to sign in</button>
      </template>
      
      <div class="login-features" style="margin-top:24px;border-top:1px solid var(--glass-border);padding-top:24px">
        <div style="display:grid;gap:12px">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <svg style="color:var(--accent);flex-shrink:0"><path d="M12 2l3.2 6.8L22 12l-6.8 3.2L12 22l-3.2-6.8L2 12l6.8-3.2z"/></svg>
            <div style="font-size:12px"><strong>Structured output</strong><br><span class="muted">Clear findings, concrete fixes, and follow-up questions.</span></div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start">
            <svg style="color:var(--success);flex-shrink:0"><path d="M4 12h5l3-8 3 16 3-8h5"/></svg>
            <div style="font-size:12px"><strong>Private workspace</strong><br><span class="muted">Uploads, folders, and notes stay in your own session.</span></div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start">
            <svg style="color:var(--warning);flex-shrink:0"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h8"/><path d="M8 14h5"/></svg>
            <div style="font-size:12px"><strong>Follow-up chat</strong><br><span class="muted">Continue the conversation after the report is complete.</span></div>
          </div>
        </div>
      </div>
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
          <img :src="onboardAvatarSrc" alt="Avatar">
        </div>
      </div>
      <p class="muted" style="text-align:center;font-size:12px">Avatar is dynamically generated from your profile settings.</p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:12px">
      <div class="field">
        <label>Gender</label>
        <select v-model="onboardGender">
          <option v-for="option in GENDER_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
      <div class="field">
        <label>Pronouns</label>
        <select v-model="onboardPronouns">
          <option v-for="option in PRONOUN_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:12px">
      <div class="field">
        <label>Avatar Style</label>
        <select v-model="onboardAvatarStyle">
          <option v-for="option in AVATAR_STYLES" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </div>
      <div class="field">
        <label>Use GitHub Avatar</label>
        <label class="check-item" style="flex-direction:row-reverse;justify-content:flex-end;gap:12px;padding-top:10px">
          <span>Prefer the GitHub profile image when available</span>
          <input type="checkbox" v-model="onboardUseGithubAvatar">
        </label>
      </div>
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
      <button class="btn btn-ghost btn-icon btn-sm sidebar-collapse-btn" @click="toggleSidebarCollapse" :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'">
        <svg v-if="!sidebarCollapsed"><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
        <svg v-else><line x1="5" y1="6" x2="19" y2="6"></line><line x1="5" y1="12" x2="19" y2="12"></line><line x1="5" y1="18" x2="19" y2="18"></line></svg>
      </button>
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
      
      <div v-if="!sidebarCollapsed" class="sidebar-project-folder" style="padding:12px">
        <div class="nav-label muted" style="font-size:11px;font-weight:700;margin-bottom:8px">NEW PROJECT FOLDER</div>
        <div style="display:flex;gap:6px">
          <input v-model="newFolderName" type="text" placeholder="Folder name..." style="font-size:12px;padding:6px 10px;height:32px">
          <button class="btn btn-secondary btn-sm" @click="createFolder" style="height:32px;padding:0 10px">
            <svg style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      </div>

      <div style="height:1px;background:var(--glass-border);margin:8px 12px"></div>
      <div v-if="!sidebarCollapsed" class="nav-label muted" style="padding:0 12px;font-size:11px;font-weight:700;margin-top:8px">RECENT</div>
      <div v-for="s in sessions.slice(0,8)" :key="s.id" @click="goToHistory(s)"
           class="btn btn-ghost nav-item" style="font-size:12px;padding:8px 12px;font-weight:400" :title="s.topic">
        <svg v-if="sidebarCollapsed"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <span v-if="!sidebarCollapsed" class="nav-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.topic || 'Untitled' }}</span>
      </div>
      <div style="flex:1"></div>
      <button class="btn btn-ghost nav-item" :class="{active: page==='settings'}" @click="page='settings'; sidebarOpen=false">
        <svg><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">Settings</span>
      </button>
      <button class="btn btn-ghost nav-item" :class="{active: page==='files'}" @click="page='files'; sidebarOpen=false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">Files</span>
      </button>
      <button class="btn btn-ghost nav-item" :class="{active: page==='help'}" @click="page='help'; sidebarOpen=false">
        <svg><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">Documentation</span>
      </button>
      <button class="btn btn-ghost nav-item" :class="{active: page==='support'}" @click="page='support'; sidebarOpen=false">
        <svg><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M8 10h8"></path><path d="M8 14h5"></path></svg>
        <span v-if="!sidebarCollapsed" class="nav-label">Support</span>
      </button>
    </nav>
  </aside>

  <main class="main-content">
    <header class="app-topbar">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        <button class="btn btn-ghost btn-icon hamburger" @click="toggleSidebar" v-if="page !== 'arena'">
          <svg><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
        <div style="min-width:0">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink2)">
            {{ page === 'dashboard' ? 'Overview' : page === 'arena' ? 'New Analysis' : page === 'history' ? 'History' : page === 'files' ? 'Files' : page === 'help' ? 'Documentation' : page === 'support' ? 'Support' : 'Settings' }}
          </div>
          <div style="font-size:18px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            Debate Lab
          </div>
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;position:relative">
        <button class="btn btn-secondary btn-sm" @click="toggleTheme">
          <svg v-if="theme==='dark'"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          <svg v-else><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          <span class="nav-label">{{ theme === 'dark' ? 'Dark' : 'Light' }}</span>
        </button>
        <button class="account-button" @click="toggleAccountMenu" :aria-expanded="accountMenuOpen" aria-label="Open account menu">
          <span class="account-button-meta">
            <span class="account-button-name">{{ profileName || user?.github_username || 'Profile' }}</span>
          </span>
          <span class="user-avatar" :style="{borderColor: profileAvatarColor, width:'34px', height:'34px'}">
            <img :src="userAvatarSrc" alt="User avatar">
          </span>
          <svg style="width:14px;height:14px;color:var(--ink2)"><path d="M6 9l6 6 6-6"></path></svg>
        </button>

        <div v-if="accountMenuOpen" class="account-menu-backdrop" @click="closeAccountMenu"></div>
        <div v-if="accountMenuOpen" class="account-menu">
          <div class="account-menu-header">
            <div class="user-avatar" :style="{borderColor: profileAvatarColor, width:'44px', height:'44px'}">
              <img :src="userAvatarSrc" alt="User avatar">
            </div>
            <div style="min-width:0">
              <div class="account-menu-name">{{ profileName || user?.github_username || 'Profile' }}</div>
              <div class="account-menu-email">{{ user?.github_username ? user.github_username : 'Local profile' }}</div>
            </div>
          </div>
          <button class="account-menu-item" @click="openMyProfile">
            <svg><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
            Profile settings
          </button>
          <button class="account-menu-item" @click="openAccountSettings">
            <svg><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Account preferences
          </button>
          <div class="account-menu-divider"></div>
          <button class="account-menu-item danger" @click="signOut">
            <svg><path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M21 3v18"></path></svg>
            Log out
          </button>
        </div>
      </div>
    </header>

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
      <div class="chat-feed-container">
        <header class="chat-header">
          <div style="display:flex;flex-direction:column">
            <h1 style="margin-bottom:2px">{{ topic || 'New Analysis' }}</h1>
            <div v-if="jobStatus !== 'idle'" style="font-size:12px;color:var(--ink2);display:flex;align-items:center;gap:6px">
              <div v-if="jobStatus === 'running'" class="dot-pulse"></div>
              {{ jobMsg }}
            </div>
          </div>
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
              <div class="chat-bubble" :class="entry.agent" v-html="renderMarkdownSafe(entry.text)"></div>
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
              <div v-html="renderMarkdownSafe(summary)" style="font-size:14px;line-height:1.6"></div>
            </div>
          </div>

          <div v-for="(msg, i) in chatMessages" :key="'chat-'+i" class="chat-bubble-row" :class="{human: msg.role === 'user'}">
            <div class="chat-avatar" :style="{background: msg.role === 'user' ? AGENT_META.human.color : 'var(--accent)'}">
              <span v-if="msg.role === 'user'" v-html="AGENT_META.human.icon || AGENT_META.human.initials"></span>
              <span v-else>AI</span>
            </div>
            <div class="chat-bubble-content">
              <div class="chat-agent-name">{{ msg.role === 'user' ? (profileName || 'You') : (msg.source === 'local' ? 'Local Assistant' : 'Assistant') }}</div>
              <div class="chat-bubble" :class="msg.role === 'user' ? 'human' : 'assistant'" v-html="renderMarkdownSafe(msg.text)"></div>
            </div>
          </div>
          
          <div v-if="chatLoading" class="chat-bubble-row">
            <div class="chat-avatar" style="background:var(--accent)">AI</div>
            <div class="chat-bubble-content">
              <div class="chat-agent-name">{{ chatAssistantLabel }}</div>
              <div style="font-size:12px;color:var(--ink2);margin-bottom:8px">{{ chatAssistantLabel }} is typing...</div>
              <div class="thinking-bubble">
                <div class="dot"></div><div class="dot"></div><div class="dot"></div>
              </div>
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
              <div class="chip-avatar" v-html="meta.icon || meta.initials"></div>
              <div class="chip-name">{{ meta.name }}</div>
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-full" @click="runDebate" :disabled="jobStatus==='running'">
          <svg v-if="jobStatus!=='running'"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          {{ jobStatus==='running' ? 'Running...' : 'Run Analysis' }}
        </button>

        <div style="height:1px;background:var(--glass-border);margin:8px 0"></div>

        <div class="field">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <label>Input Files</label>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            <span class="pill">{{ inputFiles.length }}</span>
            <button class="btn btn-secondary btn-sm" @click="createFolder" :disabled="!newFolderName.trim()" title="Create folder">
              <svg style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Folder
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" @click="loadInputFiles" title="Refresh file list">
              <svg style="width:14px;height:14px"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
            </button>
            <button class="btn btn-danger btn-sm" @click="clearAllInputs" v-if="inputFiles.length">Clear All</button>
          </div>
        </div>
          <div class="file-list" style="margin-top:8px">
            <div v-for="f in inputFiles" :key="f.path" class="file-item">
              <svg v-if="f.type === 'folder'" style="width:14px;height:14px;color:var(--ink2)"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
              <svg v-else style="width:14px;height:14px;color:var(--ink2)"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
              <span class="file-item-name" :title="f.path">{{ f.path.split('/').pop() }}</span>
              <span v-if="f.type === 'file'" class="pill" :style="f.analyzable === false ? 'color:var(--warning)' : 'color:var(--success)'">
                {{ f.analyzable === false ? 'Stored only' : 'Analyzed' }}
              </span>
              <button class="btn btn-ghost btn-icon btn-sm" @click="deleteInputFileObj(f.path)"><svg style="width:14px;height:14px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
          </div>
          <div v-if="uploadStatus" class="status" style="margin-top:12px">{{ uploadStatus }}</div>
          <p class="muted" style="font-size:12px;margin-top:10px">Text files and PDFs with readable text are analyzed by the debate engine. Other files stay in the workspace and are still visible here.</p>
        </div>

        <label class="upload-zone" for="upload-input">
          <svg style="margin:0 auto 8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
          <div>Click to upload files</div>
        </label>
        <input id="upload-input" type="file" multiple class="sr-file-input" @change="uploadFile" aria-label="Upload files" accept="*/*">

        <div class="field" style="margin-top:12px">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input v-model="cloneUrl" type="url" placeholder="GitHub URL">
            <button class="btn btn-secondary" @click="cloneRepo">Clone</button>
          </div>
        </div>
        
        <div class="field">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <label>Direct Draft</label>
          <button class="btn btn-secondary btn-sm" @click="saveDraft" :disabled="!draftContent.trim()">Save Draft</button>
          </div>
          <textarea v-model="draftContent" placeholder="Paste text here..." style="min-height:80px;font-size:12px"></textarea>
          <p class="muted" style="font-size:11px">Saves content as web_brief.md</p>
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
          <button class="btn btn-ghost btn-sm" @click="closeReport">✕ Close</button>
        </div>
        <div class="report-view" v-html="reportHtml" style="font-size:14px;line-height:1.6;max-height:50vh;overflow-y:auto;padding-right:12px"></div>
        <div v-if="followupQuestions.length" style="margin-top:18px">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink2);margin-bottom:10px">Suggested Follow-Up Questions</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px">
            <button
              v-for="q in followupQuestions"
              :key="q"
              class="btn btn-secondary btn-sm"
              style="text-align:left"
              @click="chatInput = q"
            >
              {{ q }}
            </button>
          </div>
        </div>
        <div class="chat-panel" style="margin-top:20px;border-top:1px solid var(--glass-border);padding-top:20px">
          <h3 style="font-size:14px;margin-bottom:12px">Ask about this report</h3>
          <div class="history-chat-list">
            <div v-for="(msg, i) in chatMessages" :key="i" class="history-chat-row" :class="{human: msg.role === 'user'}">
              <div class="history-chat-avatar">
                <span v-if="msg.role === 'user'" v-html="AGENT_META.human.icon || AGENT_META.human.initials"></span>
                <span v-else>AI</span>
              </div>
              <div class="history-chat-bubble-wrap">
                <div class="chat-agent-name">{{ msg.role === 'user' ? (profileName || 'You') : (msg.source === 'local' ? 'Local Assistant' : 'Assistant') }}</div>
                <div class="chat-bubble" :class="msg.role === 'user' ? 'human' : 'assistant'" v-html="renderMarkdownSafe(msg.text)"></div>
              </div>
            </div>
            <div v-if="chatLoading" class="history-chat-row">
              <div class="history-chat-avatar">AI</div>
              <div class="history-chat-bubble-wrap">
                <div class="chat-agent-name">{{ chatAssistantLabel }}</div>
                <div style="font-size:12px;color:var(--ink2);margin-bottom:8px">{{ chatAssistantLabel }} is typing...</div>
                <div class="thinking-bubble"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
              </div>
            </div>
          </div>
          <div class="history-chat-controls">
            <input v-model="chatInput" type="text" placeholder="Type question..." @keydown.enter="sendChat">
            <button class="btn btn-primary" @click="sendChat" :disabled="chatLoading">Send</button>
            <button class="btn btn-secondary" @click="saveConversation" :disabled="!chatMessages.length">Save Chat</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div style="display:flex;gap:12px;align-items:center;flex:1">
            <input v-model="historySearch" type="text" placeholder="Search topics..." style="max-width:300px">
            <button class="btn btn-danger btn-sm" v-if="selectedReports.length" @click="deleteSelectedReports">
                Delete Selected ({{ selectedReports.length }})
            </button>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
                <tr>
                    <th style="width:40px"><input type="checkbox" @click="toggleSelectAll" :checked="selectedReports.length === filteredReports.length && filteredReports.length > 0"></th>
                    <th>Topic</th><th>Mode</th><th>Date</th><th>Actions</th>
                </tr>
            </thead>
            <tbody>
              <tr v-if="!filteredReports.length"><td colspan="5" style="text-align:center;padding:32px;color:var(--ink2)">No reports found.</td></tr>
              <tr v-for="r in filteredReports" :key="r.id">
                <td><input type="checkbox" v-model="selectedReports" :value="r.name"></td>
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
          <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:12px">
            <div class="field">
              <label>Gender</label>
              <select v-model="profileGender" @change="saveLocalKeys">
                <option v-for="option in GENDER_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>
            <div class="field">
              <label>Pronouns</label>
              <select v-model="profilePronouns" @change="saveLocalKeys">
                <option v-for="option in PRONOUN_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label>Avatar Style</label>
            <select v-model="profileAvatarStyle" @change="saveLocalKeys">
              <option v-for="option in AVATAR_STYLES" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </div>
          <div class="field">
            <label>Use GitHub Avatar</label>
            <label class="check-item" style="flex-direction:row-reverse;justify-content:flex-end;gap:12px">
              <span>Prefer the GitHub profile image when available</span>
              <input type="checkbox" v-model="profileUseGithubAvatar" @change="saveLocalKeys">
            </label>
          </div>
          <div class="field">
            <label>Token Storage</label>
            <label class="check-item" style="flex-direction:row-reverse;justify-content:flex-end;gap:12px">
              <span>Store API keys only for this session</span>
              <input type="checkbox" v-model="sessionOnlyKeys" @change="saveLocalKeys">
            </label>
            <p class="muted" style="font-size:12px">Recommended. This keeps provider keys out of persistent browser storage.</p>
          </div>
          <div class="field">
            <button class="btn btn-secondary btn-sm" @click="clearSavedKeys">Clear Saved Keys</button>
          </div>
          <div class="field">
            <label>Avatar Accent</label>
            <div class="avatar-options">
              <div v-for="c in ['#3fb950','#da3633','#388bfd','#ff6b35','#4d9fff','#cc785c','#d4a017','#9b59b6']" :key="c"
                   class="avatar-option" :class="{selected: profileAvatarColor === c}"
                   :style="{background:c}" @click="profileAvatarColor = c; saveLocalKeys()">
                <img :src="avatarUrl(profileName || user?.github_username || 'Researcher', { gender: profileGender, style: profileAvatarStyle, accent: c })" alt="Avatar" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block">
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
              <span v-if="keysStatus[provider]" class="pill" :style="keysStatus[provider]==='valid'?'color:var(--success)':keysStatus[provider]==='testing'?'color:var(--accent)':keysStatus[provider]==='limited'?'color:var(--warning)':'color:var(--danger)'">
                {{ keysStatus[provider] }}
              </span>
            </div>
            <div style="display:flex;gap:8px">
              <input v-model="keys[provider]" type="password" placeholder="Paste key here..." @change="saveLocalKeys">
              <button class="btn btn-secondary" @click="validateKey(provider)" :disabled="!keys[provider] || keysStatus[provider]==='testing'">Test</button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:var(--ink2)">
              <span>Estimated rate headroom</span>
              <span class="pill">{{ getHeadroom(provider) }}%</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>Account</h2></div>
          <div style="display:flex;align-items:center;gap:16px">
            <div class="user-avatar" :style="{borderColor: profileAvatarColor, width:'64px', height:'64px'}">
               <img :src="userAvatarSrc" alt="User avatar">
            </div>
            <div>
              <div style="font-weight:700;font-size:16px">{{ user?.github_username }}</div>
              <div style="font-size:13px;color:var(--ink2)">Gender: {{ profileGender }}</div>
              <div style="font-size:13px;color:var(--ink2)">Pronouns: {{ profilePronouns }}</div>
              <div style="font-size:13px;color:var(--ink2)">Authenticated via {{ user?.github_username ? 'GitHub' : 'Email' }}</div>
            </div>
            <button class="btn btn-secondary" style="margin-left:auto" @click="signOut">Sign Out</button>
          </div>
        </div>

        <div class="panel" style="border-color:rgba(218,54,51,0.3)">
          <div class="panel-head"><h2 style="color:var(--danger)">Danger Zone</h2></div>
          <p class="muted" style="font-size:13px;margin-bottom:20px">Deleting your account will permanently remove all your debate history and saved API keys.</p>
          <button class="btn btn-danger" @click="deleteAccount">Delete Account Permanently</button>
        </div>
      </div>
    </div>
    
    <div v-if="page === 'files'" class="page">
      <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">Resources</h1>
      <p style="color:var(--ink2);margin-bottom:32px">Manage your uploaded documents and reference materials.</p>

      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-value">{{ inputFiles.length }}</div>
          <div class="stat-label">Total Files</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatBytes(inputFiles.reduce((acc, f) => acc + (f.size || 0), 0)) }}</div>
          <div class="stat-label">Storage Used</div>
        </div>
      </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Your Files</h2>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
              <button class="btn btn-secondary btn-sm" @click="createFolder" :disabled="!newFolderName.trim()" title="Create folder">
                <svg style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Folder
              </button>
              <button class="btn btn-danger btn-sm" @click="clearAllInputs" v-if="inputFiles.length">Delete All</button>
              <label class="btn btn-primary btn-sm" for="files-page-upload" style="cursor:pointer">
                <svg style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                Upload
                <input id="files-page-upload" type="file" multiple class="sr-only" @change="uploadFile" style="display:none" accept="*/*">
              </label>
            </div>
          </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th style="text-align:right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!inputFiles.length">
                <td colspan="4" style="text-align:center;padding:48px;color:var(--ink2)">
                  <svg style="width:48px;height:48px;margin-bottom:16px;opacity:0.2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                  <p>No files uploaded yet.</p>
                </td>
              </tr>
              <tr v-for="f in inputFiles" :key="f.path">
                <td style="font-weight:600">
                  <div style="display:flex;align-items:center;gap:10px">
                    <svg v-if="f.type === 'folder'" style="width:16px;height:16px;color:var(--accent)"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
                    <svg v-else style="width:16px;height:16px;color:var(--ink2)"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                    {{ f.path.split('/').pop() }}
                  </div>
                </td>
                <td>
                  <span v-if="f.type === 'folder'" class="pill">Folder</span>
                  <span v-else class="pill" :style="f.analyzable === false ? 'color:var(--warning)' : 'color:var(--success)'">
                    {{ f.analyzable === false ? 'Stored only' : 'Analyzed' }}
                  </span>
                </td>
                <td>{{ formatBytes(f.size || 0) }}</td>
                <td style="text-align:right">
                  <button class="btn btn-ghost btn-sm text-danger" @click="deleteInputFileObj(f.path)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="uploadStatus" class="status" style="margin-top:16px">{{ uploadStatus }}</div>
      </div>

      <div class="panel" style="margin-top:24px">
          <div class="panel-head"><h2>Clone Repository</h2></div>
          <p class="muted" style="margin-bottom:16px;font-size:13px">Import documents directly from a GitHub repository.</p>
          <div style="display:flex;gap:12px">
            <input v-model="cloneUrl" type="url" placeholder="https://github.com/user/repo" style="flex:1">
            <button class="btn btn-secondary" @click="cloneRepo">Clone Repo</button>
          </div>
      </div>
    </div>
    
    <div v-if="page === 'help'" class="page">
      <div class="panel" style="margin-bottom:24px;overflow:hidden">
        <div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,0.75fr);gap:24px;align-items:center">
          <div>
            <div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--accent);margin-bottom:10px">Documentation Hub</div>
            <h1 style="font-size:34px;font-weight:900;line-height:1.05;margin-bottom:12px">Documentation that helps people move quickly.</h1>
            <p style="color:var(--ink2);max-width:62ch;line-height:1.7;margin-bottom:20px">
              Open a guide to see clear steps, practical notes, and a clean path through the workspace. The launcher below is just the doorway.
            </p>
            <div style="display:flex;flex-wrap:wrap;gap:10px">
              <a class="btn btn-primary" href="/docs">Open Docs Site</a>
              <button class="btn btn-secondary" @click="openDoc('workspace')">Workspace Guide</button>
              <button class="btn btn-secondary" @click="openDoc('getting-started')">Getting Started</button>
            </div>
          </div>
        </div>
      </div>

      <div class="docs-launch-grid">
        <button v-for="doc in docs" :key="doc.slug" class="docs-launch-card" @click="openDoc(doc.slug)">
          <div class="docs-launch-copy">
            <div class="docs-launch-title">{{ doc.title }}</div>
            <div class="docs-launch-summary">{{ doc.summary || 'Open the full guide page.' }}</div>
          </div>
          <div class="docs-launch-arrow">↗</div>
        </button>
      </div>

      <div class="docs-launch-panels">
        <div class="panel">
          <div class="panel-head"><h2>Workflow</h2></div>
          <div style="display:grid;gap:14px">
            <p class="muted" style="font-size:13px;line-height:1.7;margin:0">Add material, choose a few agents, run the review, and save what matters. The app is built to keep that flow short and obvious.</p>
            <p class="muted" style="font-size:13px;line-height:1.7;margin:0">When you want more detail, open the dedicated guides and keep the browser open while you work.</p>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>FAQ</h2></div>
          <div class="help-faq">
            <div class="help-faq-item">
              <strong>Do I need every provider?</strong>
              <div class="muted" style="font-size:13px;line-height:1.65">No. Start with one provider and add more only if you need them.</div>
            </div>
            <div class="help-faq-item">
              <strong>Can I use the app without understanding the internals?</strong>
              <div class="muted" style="font-size:13px;line-height:1.65">Yes. The docs are written so people can use the workspace without learning the implementation details.</div>
            </div>
            <div class="help-faq-item">
              <strong>What should I test first?</strong>
              <div class="muted" style="font-size:13px;line-height:1.65">Upload one file, run one round, and save the report once it finishes.</div>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>Contact</h2></div>
          <div class="help-contact">
            <div style="display:grid;gap:10px">
              <a class="btn btn-primary" href="mailto:ramadhanzome@gmail.com">Email Ramadhan</a>
              <button class="btn btn-secondary" @click="page='support'; loadSupport()">Open Support Inbox</button>
              <p class="muted" style="font-size:13px;line-height:1.7;margin:0">A contact chatbot can be added later, but the email and support inbox are the clean defaults for a private repo.</p>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>Good first reads</h2></div>
          <div style="display:grid;gap:12px">
            <button class="debate-card" style="text-align:left" @click="openDoc('workspace')">
              <div class="debate-card-body">
                <div class="debate-card-topic">Workspace Guide</div>
                <div class="debate-card-meta">Upload examples, folder structure, repo cloning, and saved chats.</div>
              </div>
            </button>
            <button class="debate-card" style="text-align:left" @click="openDoc('web-ui')">
              <div class="debate-card-body">
                <div class="debate-card-topic">Web UI Guide</div>
                <div class="debate-card-meta">What the sidebar, arena, and history screens do.</div>
              </div>
            </button>
            <button class="debate-card" style="text-align:left" @click="openDoc('profiles')">
              <div class="debate-card-body">
                <div class="debate-card-topic">Profile Guide</div>
                <div class="debate-card-meta">How to set identity, avatars, and personalization.</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="page === 'support'" class="page">
      <h1 style="font-size:28px;font-weight:800;margin-bottom:8px">Support</h1>
      <p style="color:var(--ink2);margin-bottom:32px">Send feedback, report a bug, or leave a product idea for the inbox.</p>

      <div class="settings-grid">
        <div class="panel">
          <div class="panel-head"><h2>New Note</h2></div>
          <div class="field">
            <label>Category</label>
            <select v-model="supportCategory">
              <option value="feedback">Feedback</option>
              <option value="bug">Bug Report</option>
              <option value="idea">Idea</option>
              <option value="question">Question</option>
              <option value="security">Security</option>
            </select>
          </div>
          <div class="field">
            <label>Subject</label>
            <input v-model="supportSubject" type="text" placeholder="Short summary">
          </div>
          <div class="field">
            <label>Contact</label>
            <input v-model="supportContact" type="text" placeholder="Email or GitHub handle">
          </div>
          <div class="field">
            <label>Message</label>
            <textarea v-model="supportMessage" rows="6" placeholder="What should improve? What broke? What would make this easier?"></textarea>
          </div>
          <button class="btn btn-primary" @click="submitSupport" :disabled="supportSubmitting || !supportMessage.trim()">
            {{ supportSubmitting ? 'Sending...' : 'Send to Inbox' }}
          </button>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Inbox</h2>
            <button class="btn btn-secondary btn-sm" @click="loadSupport">Refresh</button>
          </div>
          <div v-if="!supportItems.length" class="muted" style="font-size:13px;line-height:1.7">No support notes yet. Once people start sending ideas, they will show up here.</div>
          <div v-else style="display:grid;gap:12px">
            <div v-for="item in supportItems" :key="item.id" class="debate-card" style="text-align:left;padding:16px 18px">
              <div class="debate-card-body" style="gap:8px">
                <div class="debate-card-topic" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <span class="pill">{{ item.category || 'feedback' }}</span>
                  {{ item.subject || 'Support note' }}
                </div>
                <div class="debate-card-meta">
                  {{ item.github_username || item.contact || 'Anonymous' }} · {{ timeAgo(item.created_at) }}
                </div>
                <div style="color:var(--ink2);font-size:13px;line-height:1.65;white-space:pre-wrap">{{ item.message }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </main>
</div>
  `
}).mount("#app");
