# Deployment Guide

Debate Lab can be run locally or deployed via Docker to platforms like HuggingFace Spaces.

## Environment Variables

Create a `.env` file with the following keys:
- `GROQ_API_KEY`
- `GOOGLE_API_KEY`
- `KIMI_API_KEY`
- `DEEPSEEK_API_KEY`
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_ANON_KEY`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`

## Local Deployment

1. Install dependencies: `pip install -r requirements.txt`
2. Run the server: `uvicorn web_app:app --host 127.0.0.1 --port 8765 --reload`

## Docker Deployment

The provided `Dockerfile` builds a production-ready image running on port 7860 (HuggingFace Spaces default).

\`\`\`bash
docker build -t debate-lab .
docker run -p 7860:7860 --env-file .env debate-lab
\`\`\`

Ensure you mount a volume for `/app/debates`, `/app/input`, and `/app/q_table.json` if you want persistent local storage alongside Supabase.
