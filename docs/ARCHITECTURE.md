# System Architecture

Debate Lab is a multi-model analysis tool built on a modular architecture separating the frontend client, backend server, orchestrator, and AI agents.

## System Diagram

\`\`\`text
                      +-------------------+
                      |   Web Browser     |
                      |   (Vue.js App)    |
                      +---------+---------+
                                | REST API
                                v
+-----------------------------------------------------------------+
|                       FastAPI Server                            |
|                        (web_app.py)                             |
|                                                                 |
|   +---------------+     +---------------+     +-------------+   |
|   | Auth/Sessions |     | File Manager  |     | Job Manager |   |
|   +-------+-------+     +-------+-------+     +------+------+   |
+-----------|---------------------|--------------------|----------+
            | Supabase            | Local Files        | Thread
            v                     v                    v
  +-------------------+    +--------------+    +------------------+
  | PostgreSQL DB     |    |   input/     |    |   debate.py      |
  | (debates, profiles|    |   debates/   |    | (Orchestrator)   |
  +-------------------+    +--------------+    +--------+---------+
                                                        |
                                                        | Async
            +-------------------------------------------+---------+
            |                                                     |
            v                                                     v
    +---------------+                                     +---------------+
    |  agents.py    |                                     |  reward.py    |
    | (GPT, Groq,   | <---- API Keys ----> External APIs  | (Q-Learner &  |
    |  Gemini, etc.)|                                     |  Scorer)      |
    +---------------+                                     +---------------+
\`\`\`

## Data Flow

1. **Input:** Users upload files or clone repositories into the `input/` directory via the UI.
2. **Configuration:** The user selects the topic, mode, rounds, and agents, triggering the `/api/run` endpoint.
3. **Orchestration:** `web_app.py` spins up a background thread calling `run_debate` in `debate.py`.
4. **Execution:** `debate.py` uses `reward.py`'s Q-Table to sort agents by historical performance, then triggers each agent asynchronously. 
5. **Scoring & Learning:** After each argument, `reward.py` uses Groq to score the argument across 6 dimensions, updating the Q-table.
6. **Artifact:** The final transcript, scores, and summary are saved to disk in `debates/` and stored in Supabase.
7. **Polling:** The frontend polls `/api/jobs/{job_id}` to update the UI in real-time.