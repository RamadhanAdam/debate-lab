# Debate Lab

**Drop in any work. Get multiple AI analysts tearing it apart.**

![Python](https://img.shields.io/badge/Python-3.11+-blue)
![JavaScript](https://img.shields.io/badge/JavaScript-Vue.js-green)
![License](https://img.shields.io/badge/License-Commercial-red)

Debate Lab is a multi-agent debate system where top-tier AI models argue about the same material from different angles. It includes a beautiful Glass UI and a Q-learning reward system that tracks argument quality over time and learns which model argues best.

## What It Does

You provide context (research papers, codebases, business plans, or raw data) by dropping files into the `input/` folder or pasting a GitHub repository URL. The models read it and debate in three rounds:

1. **Independent Assessment**: Each model provides a rigorous, simultaneous peer review.
2. **Rebuttal**: Models read each other's assessments, quoting specific points to agree or push back.
3. **Synthesis**: Models provide final, actionable recommendations.

You can also participate as a "Human" agent, injecting your own arguments into the debate in real-time.

## Supported Models

Debate Lab supports 6 leading LLMs via their respective APIs.

| Agent | Model | Provider |
|-------|-------|----------|
| GPT | GPT-4.1 | GitHub Copilot SDK |
| Llama | Llama-3.3-70b | Groq |
| Gemini | Gemini 2.0 Flash Lite | Google AI |
| Claude | Claude 3.5 Haiku | Anthropic |
| DeepSeek | DeepSeek Chat | DeepSeek |
| Kimi | Moonshot-v1-8k | Moonshot AI |

*Note: API keys are stored securely in your browser's local storage and only sent to the server when a debate is run.*

## Quick Start

**1. Clone and Install**
\`\`\`bash
git clone https://github.com/RamadhanAdam/copilot-sdk-agents
cd copilot-sdk-agents
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
\`\`\`

**2. Authentication**
For GPT to work, authenticate via GitHub Copilot CLI:
\`\`\`bash
npm install -g @github/copilot
gh auth login
copilot
\`\`\`

**3. Run the Web UI**
\`\`\`bash
uvicorn web_app:app --host 127.0.0.1 --port 8765
\`\`\`
Open `http://127.0.0.1:8765` in your browser.

## Documentation

For advanced setup and development, see the `docs/` directory:
- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Adding New Agents](docs/AGENTS.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## Contributing

Pull requests are welcome. To add a new agent, please follow the steps in `docs/AGENTS.md`. For UI changes, note that the frontend uses Vue 3 via CDN with ES Modules located in `web/assets/js/`.
