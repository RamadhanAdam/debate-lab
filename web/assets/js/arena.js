import { runDebateReq, pollJobReq, saveReportReq, submitHumanInputReq, submitInterjectReq } from "./api.js";
import { AGENT_META } from "./constants.js";

export function useArena(state) {
  async function runDebate() {
    if (!state.selectedAgents.value.length) {
      state.jobMsg.value = "Select at least one agent";
      state.jobStatus.value = "failed";
      return;
    }

    if (state.saveDraft) await state.saveDraft();

    state.jobStatus.value = "running";
    state.jobMsg.value = "Starting analysis...";
    state.arenaActive.value = true;
    state.reportSaved.value = false;
    state.transcript.value = [];
    state.agentScores.value = {};
    state.warnings.value = [];
    state.summary.value = "";
    state.reportContent.value = "";
    state.currentRound.value = 0;
    state.totalRounds.value = state.rounds.value;
    state.page.value = "arena";
    state.humanTurn.value = false;
    state.interjecting.value = false;

    try {
      const data = await runDebateReq({
        topic: state.topic.value || null,
        mode: state.mode.value,
        rounds: state.rounds.value,
        agents: state.selectedAgents.value,
        goal: state.goal.value,
        persona: state.persona.value,
      });
      state.currentJobId.value = data.job_id;
      pollJob(data.job_id);
    } catch (e) {
      state.jobStatus.value = "failed";
      state.jobMsg.value = e.message;
      state.arenaActive.value = false;
    }
  }

  async function pollJob(jobId) {
    try {
      const job = await pollJobReq(jobId);

      if (job.status === "human_turn") {
        state.jobMsg.value = "Waiting for your input...";
        state.humanTurn.value = true;
        state.interjecting.value = false;
        
        if (job.transcript && job.transcript.length) {
            state.transcript.value = job.transcript.map(t => ({
              agent: Object.keys(AGENT_META).find(k => AGENT_META[k].name === t.agent) || "groq",
              name: t.agent,
              text: t.text,
              expanded: true,
            }));
            state.speakingAgent.value = null;
        }

        setTimeout(() => pollJob(jobId), 2000);
        return;
      }

      if (job.status === "running") {
        state.jobMsg.value = "Analysis in progress...";
        if (job.transcript && job.transcript.length) {
          state.transcript.value = job.transcript.map(t => ({
            agent: Object.keys(AGENT_META).find(k => AGENT_META[k].name === t.agent) || "groq",
            name: t.agent,
            text: t.text,
            expanded: true,
          }));
          state.speakingAgent.value = state.transcript.value[state.transcript.value.length - 1].agent;
        }
        setTimeout(() => pollJob(jobId), 1000);
        return;
      }

      if (job.status === "queued") {
        state.jobMsg.value = "Queued...";
        setTimeout(() => pollJob(jobId), 1000);
        return;
      }

      if (job.status === "failed") {
        state.jobStatus.value = "failed";
        state.jobMsg.value = job.error || "Debate failed";
        state.arenaActive.value = false;
        state.speakingAgent.value = null;
        state.humanTurn.value = false;
        state.interjecting.value = false;
        return;
      }

      state.jobStatus.value = "completed";
      state.jobMsg.value = "Analysis complete";
      state.arenaActive.value = false;
      state.speakingAgent.value = null;
      state.humanTurn.value = false;
      state.interjecting.value = false;

      if (job.result) {
        updateArenaFromResult(job.result);
      }
    } catch (e) {
      state.jobStatus.value = "failed";
      state.jobMsg.value = e.message;
    }
  }

  async function submitHuman() {
    if (!state.currentJobId.value) return;
    
    state.humanTurn.value = false;
    const text = state.humanInput.value.trim();
    if (text) {
        state.transcript.value.push({
            agent: "human",
            name: state.profileName.value || "You",
            text: text,
            expanded: true
        });
    }
    state.humanInput.value = "";

    try {
        await submitHumanInputReq(state.currentJobId.value, text);
    } catch (e) {
        console.error("Failed to submit human input:", e);
    }
  }

  async function submitInterject() {
    if (!state.currentJobId.value) return;
    
    state.interjecting.value = false;
    const text = state.humanInput.value.trim();
    if (text) {
        state.transcript.value.push({
            agent: "human",
            name: state.profileName.value || "You",
            text: text,
            expanded: true
        });
    }
    state.humanInput.value = "";

    try {
        await submitInterjectReq(state.currentJobId.value, text);
    } catch (e) {
        console.error("Failed to submit interjection:", e);
    }
  }

  async function saveReport() {
    if (!state.currentJobId.value || state.reportSaved.value) return;
    try {
      await saveReportReq(state.currentJobId.value);
      state.reportSaved.value = true;
      if (state.loadDashboard) await state.loadDashboard();
      if (state.loadReports) await state.loadReports();
    } catch (e) {
      alert("Failed to save report: " + e.message);
    }
  }

  function updateArenaFromResult(result) {
    state.summary.value = result.summary || "";
    state.resultMode.value = result.mode || "";
    state.warnings.value = result.warnings || [];
    state.agentScores.value = result.agent_averages || {};
    state.totalRounds.value = result.rounds || 1;
    state.currentRound.value = result.rounds || 1;

    if (result.rounds_data && result.rounds_data.length && state.transcript.value.length === 0) {
      for (const round of result.rounds_data) {
        for (const [agentName, argument] of round) {
          const agentKey = Object.keys(AGENT_META).find(
            k => AGENT_META[k].name === agentName
          ) || "groq";
          state.transcript.value.push({ agent: agentKey, name: agentName, text: argument, expanded: true });
        }
      }
    }
    
    state.reportContent.value = result.summary; 
  }

  return { runDebate, pollJob, saveReport, submitHuman, submitInterject, updateArenaFromResult };
}
