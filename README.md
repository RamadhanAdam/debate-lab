# Debate Lab

**Drop in any work. Get multiple AI analysts tearing it apart.**

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-Vue.js-green)
![License](https://img.shields.io/badge/License-Commercial-red)

Debate Lab is a multi-agent debate system where top-tier AI models argue about the same material from different angles. It includes a beautiful Glass UI and a Q-learning reward system that tracks argument quality over time and learns which model argues best.

---

## 🚀 What It Does

You provide context (research papers, codebases, business plans, or raw data) by dropping files into the UI or pasting a GitHub repository URL. The models read it and debate in three rounds:

1. **Independent Assessment**: Each model provides a rigorous, simultaneous peer review.
2. **Rebuttal**: Models read each other's assessments, quoting specific points to agree or push back.
3. **Synthesis**: Models provide final, actionable recommendations.

You can also participate as a "Human" agent, injecting your own arguments into the debate in real-time using the **Interject** feature!

---

## 🤖 Supported Models

Debate Lab natively supports 6 leading LLMs via their respective APIs. You only need API keys for the ones you want to use.

| Agent | Model | Provider | Required API Key |
|-------|-------|----------|-------------------|
| GPT | GPT-4.1 | GitHub Copilot SDK | *(Copilot Auth)* |
| Llama | Llama-3.3-70b | Groq | `GROQ_API_KEY` |
| Gemini | Gemini 2.0 Flash Lite | Google AI | `GOOGLE_API_KEY` |
| Claude | Claude 3.5 Haiku | Anthropic | `ANTHROPIC_API_KEY` |
| DeepSeek | DeepSeek Chat | DeepSeek | `DEEPSEEK_API_KEY` |
| Kimi | Moonshot-v1-8k | Moonshot AI | `KIMI_API_KEY` |

*Note: API keys are stored securely in your browser's local storage and only sent to the server when a debate is run.*

---

## 💻 Installation & Quick Start

**1. Clone and Install**
\`\`\`bash
git clone https://github.com/RamadhanAdam/copilot-sdk-agents
cd copilot-sdk-agents
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
\`\`\`

**2. Environment Variables**
Copy `.env.example` to `.env` and fill in your Supabase credentials (required for user authentication and history saving), and your GitHub OAuth credentials.

**3. Run the Web Server**
\`\`\`bash
uvicorn web_app:app --host 127.0.0.1 --port 8765 --reload
\`\`\`
Open `http://127.0.0.1:8765` in your browser.

---

## 🏗️ System Architecture

Debate Lab uses a modular architecture:
- **Frontend (`web/`)**: A modular Vue 3 application using native ES imports (`assets/js/app.js`, `api.js`, etc.) and a custom Glass UI CSS framework.
- **Backend (`web_app.py`)**: A FastAPI server handling GitHub OAuth, Supabase database connections, file management, and long-running job threads.
- **Orchestrator (`debate.py`)**: Manages the round-robin logic, context windows, and real-time human interjections.
- **Agents (`agents.py`)**: Abstracted wrappers around the official SDKs (OpenAI, Anthropic, Google, Groq).
- **RL Engine (`reward.py`)**: Uses a Q-learning matrix to score arguments via a judge LLM, actively sorting the best-performing agents to speak last in future rounds.

---

## 🔌 Adding New Agents

Debate Lab is highly extensible. To add a new model:

1. Add your API key to `.env` and load it in `debate_config.py`.
2. Add the agent to the `AGENTS` mapping in `debate_config.py`.
3. In `agents.py`, create a class inheriting from `BaseAgent` and implement the `argue()` method using your provider's SDK.
4. Add the new class to the `get_agent()` factory function in `agents.py`.
5. Finally, update `AGENT_META` in `web/assets/js/constants.js` with initials and a custom color for the frontend UI.

---

## 🐳 Docker Deployment

To deploy to a cloud provider like HuggingFace Spaces or AWS:

\`\`\`bash
docker build -t debate-lab .
docker run -p 7860:7860 --env-file .env debate-lab
\`\`\`

*Note: Ensure you mount volumes for `/app/input`, `/app/debates`, and `/app/q_table.json` if you want local artifacts to persist across container restarts.*

---

## 📝 License

This software is provided under a Commercial/Proprietary license. See `LICENSE` for more details.
