# REST API Documentation

Debate Lab provides a FastAPI backend for orchestrating debates.

## Auth Endpoints

### GET `/auth/me`
Check if the user is authenticated.
**Response:** `{"authenticated": true, "user_id": "...", "github_username": "..."}`

## Core Endpoints

### GET `/api/status`
Get server configuration and available agents.

### GET `/api/inputs`
List all files available in the `input/` directory.

### POST `/api/input`
Write a new file to the `input/` directory.
**Payload:** `{"name": "test.txt", "content": "Hello world"}`

### POST `/api/repo/clone`
Clone a git repository into the `input/` directory.
**Payload:** `{"url": "https://github.com/user/repo"}`

## Debate Endpoints

### POST `/api/run`
Start a new debate.
**Payload:**
\`\`\`json
{
  "topic": "Review the methodology",
  "mode": "review",
  "rounds": 3,
  "agents": ["gpt", "groq", "gemini"]
}
\`\`\`
**Response:** `{"job_id": "uuid"}`

### GET `/api/jobs/{job_id}`
Poll the status of a running debate.
**Response:** `{"status": "running", "transcript": [...]}`

### POST `/api/jobs/{job_id}/human-input`
Submit a human argument during a debate round.
**Payload:** `{"text": "My argument..."}`

### POST `/api/save_report/{job_id}`
Persist a completed debate to Supabase.

### GET `/api/sessions`
Get the user's past 20 debate sessions from Supabase.

### GET `/api/agent-stats`
Get RL performance statistics for all agents.

### POST `/api/validate-key`
Test an API key.
**Payload:** `{"provider": "groq", "key": "..."}`
