# Debate Lab

Debate Lab is a multi-agent debate and review workspace. It loads files from disk, lets you clone GitHub repositories into a project folder, runs several models against the same material, and saves a structured markdown report with a transcript, scores, warnings, and a moderator summary.

The project has two primary entry points:

- `debate.py` for command-line runs
- `web_app.py` for the browser UI

Both use the same debate engine and the same `input/` and `debates/` directories.

## What It Does

The workflow is simple:

1. Add source material to `input/` or create a folder through the web UI.
2. Choose one or more agents.
3. Run a review or debate across several rounds.
4. Review the transcript, warnings, and scores.
5. Save the result as a markdown artifact in `debates/`.

The app is useful for:

- research critique
- code review
- proposal review
- product reasoning
- security analysis
- structured brainstorming

The web UI also supports human interjection during a live run, so you can steer the conversation while it is still in progress.

## Repository Layout

```text
README.md
agents.py               Provider wrappers for the models
debate.py               Debate orchestration and artifact generation
debate_config.py        Central settings, model names, directories, and scoring config
reward.py               Argument scoring and Q-table persistence
web_app.py              Browser app server and route handlers
web/
  index.html
  assets/
    js/                 Vue application, API helpers, arena logic
    css/                Layout, component, and arena styles
input/                  Shared input files and per-user folders
debates/                Saved markdown reports
q_table.json            Persistent learning state for the scorer
```

## Supported Agents

The exact model strings live in `debate_config.py`, but the project currently supports these agent types:

| Agent | Provider | Notes |
|---|---|---|
| GPT | GitHub Copilot SDK | Uses GitHub-based auth |
| Groq | Groq | Used heavily for debate and moderation |
| Gemini | Google | Optional and quota-dependent |
| Claude | Anthropic | Optional |
| DeepSeek | DeepSeek | Optional |
| Kimi | Moonshot | Optional |
| Human | Local user | Optional live participation |

You can run only the providers you have configured. For example, `--agents groq` is a valid low-cost smoke test.

## Requirements

You will need:

- Python 3.11 or newer
- Git
- a modern browser
- a Supabase project
- GitHub OAuth credentials
- API keys for any providers you want to use

## Installation

```bash
git clone https://github.com/RamadhanAdam/debate-lab
cd debate-lab
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Environment Variables

Create a `.env` file in the project root.

### Required for the web app

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=...
```

### Optional provider keys

```bash
GROQ_API_KEY=...
GOOGLE_API_KEY=...
KIMI_API_KEY=...
DEEPSEEK_API_KEY=...
ANTHROPIC_API_KEY=...
```

The app reads these through `debate_config.py` and `web_app.py`. If a required variable is missing, the server now fails fast with a clear startup error.

## Running the Web App

Start the server:

```bash
uvicorn web_app:app --host 127.0.0.1 --port 8765 --reload
```

Then open:

```text
http://127.0.0.1:8765
```

Web features:

- GitHub OAuth login
- email sign-in, account creation, and password recovery
- per-user input folders
- file upload
- folder creation
- GitHub repository cloning
- live debate runs
- human interjection
- report export
- report history
- report chat with either a Groq-backed assistant or a local report-grounded fallback when no chat key is configured
- save chat conversations into your workspace's conversations area
- top-right account menu for profile settings, theme, and logout
- account deletion
- configurable profile name, gender, pronouns, avatar style, and avatar accent

Email login uses one shared email field with separate modes for sign-in, account creation, and password recovery. Recovery sends a reset email and shows resend status in the UI. The GitHub button still goes through the OAuth flow.

The UI stores avatar and profile details in the authenticated user profile and falls back to a generated avatar when a GitHub image is not available.

## Running the CLI

The CLI is the easiest way to test the debate engine itself.

```bash
python3 -u debate.py --no-human
```

Helpful examples:

```bash
python3 -u debate.py --rounds 1 --agents groq --no-human
python3 -u debate.py --rounds 2 --agents gpt,groq --no-human
python3 -u debate.py --mode debate --topic "Should AI debate before acting?" --rounds 3
```

CLI flags:

- `--topic`: custom prompt or topic
- `--mode`: `review`, `debate`, `business`, `creative`, or `technical`
- `--no-human`: disable the human turn
- `--agents`: comma-separated agent list
- `--rounds`: number of rounds

## Input Files

Supported file types:

- `.txt`
- `.md`
- `.py`
- `.ts`
- `.js`
- `.json`
- `.csv`
- `.docx`
- `.pptx`
- `.xlsx`

The app reads files recursively from the current user folder:

- web app runs use each signed-in user's private workspace
- CLI runs without a user use the shared workspace folder

You can create nested project folders such as:

```text
input/
  sample_proposal.md
  research-notes/
    round-1.md
    draft-context.md
```

Those folders are shown in the UI and can be created directly from the sidebar.

## Output Artifacts

Each run saves a markdown report in `debates/`. Reports now include:

- executive summary
- round-by-round transcript
- run warnings
- argument scores
- agent averages

The web app also stores report metadata in Supabase so history can be queried later.

## Web UI Workflow

The main screen is split into three parts:

- left sidebar for navigation and profile
- center arena for the transcript and summary
- right panel for configuration and input management

Common actions:

- switch between dashboard, arena, history, and settings
- collapse the sidebar from the top-left control
- open the top-right account menu for profile settings and logout
- select agents with provider icons
- create a project folder
- upload files or clone a GitHub repository
- run the debate
- save the report
- chat with the saved report later

## Documentation

The detailed guides live in the `docs/` folder and are also exposed in the app's Resources page and standalone docs site at `/docs`.

- [Getting Started](/docs/getting-started)
- [Web UI Guide](/docs/web-ui)
- [Workspace Guide](/docs/workspace)
- [CLI Reference](/docs/cli)
- [Agent Guide](/docs/agents)
- [Profile and Avatar Guide](/docs/profiles)
- [Security Notes](/docs/security)

## Security Notes

The project includes several protections:

- path input is sanitized before files or folders are created
- deletions stay inside the current user folder
- GitHub clone URLs are restricted to GitHub hosts
- job polling no longer serializes internal lock objects
- environment variables are validated at startup
- account deletion clears user content and profile metadata
- API keys default to session-only browser storage, and sign-out clears saved keys
- auth, chat, and repository clone routes are rate-limited server-side
- report and chat markdown is escaped before rendering so user content cannot inject HTML
- GitHub OAuth uses state verification, HTTP-only session cookies, and an explicit callback route
- the web app sends a Content Security Policy and can mark cookies Secure behind HTTPS with `SESSION_COOKIE_SECURE=true`

Treat API keys, OAuth secrets, and Supabase credentials as sensitive. Do not commit them to source control.

## Extending the Project

To add a new model:

1. Add the provider settings in `debate_config.py`.
2. Implement the provider wrapper in `agents.py`.
3. Add the model metadata and icon in `web/assets/js/constants.js`.
4. Update validation or scoring if the provider needs special handling.

To change debate behavior:

1. Update `debate.py` for orchestration changes.
2. Update `reward.py` if the scoring logic changes.
3. Surface any new controls in `web/assets/js/app.js` and the related CSS files.

## Troubleshooting

If the server does not start:

- confirm the required environment variables are present
- verify Supabase credentials
- verify GitHub OAuth credentials
- make sure the Python environment has the dependencies installed

If the debate fails:

- try one provider first, such as `--agents groq`
- reduce the number of rounds to `--rounds 1`
- confirm the provider API key works
- check quota or rate limits for the model provider

If the UI loads but no files appear:

- confirm you are signed in
- create a folder or upload a file from the sidebar
- verify the file extension is supported

If a report is blank or partial:

- open the saved file in `debates/`
- inspect the `Run Warnings` section
- check the server logs for provider failures

## Development Commands

```bash
python3 -m py_compile web_app.py debate.py reward.py agents.py
python3 -u debate.py --rounds 1 --agents groq --no-human
uvicorn web_app:app --host 127.0.0.1 --port 8765 --reload
```

The scorer persists a `q_table.json` file between runs. Remove it if you want to reset the learned ordering and scoring history.

## Deployment

The best free hosting fit for the current app is Hugging Face Spaces with Docker support.

Suggested Space name:

```text
debate-lab
```

That would give you a public Space URL in the form:

```text
https://ramadhanzome-debate-lab.hf.space
```

Why Spaces fits this project well:

- it supports the Python backend and the browser UI together
- the Dockerfile already listens on port `7860`
- the app can keep persistent storage for uploads, reports, support notes, and the Q-table
- you can keep all secrets in Space variables instead of source control

Before publishing, set these Space variables:

```bash
APP_DATA_DIR=/data
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=...
```

Attach persistent storage for the app data directory so uploads and reports survive restarts. The app will use `APP_DATA_DIR` automatically when it is present.

## Contact

If you need help using the project:

- Email: ramadhanzome@gmail.com
- Use the in-app Support page for feedback and bug reports.

## License

This project is provided under a commercial/proprietary license. See `LICENSE` for details.
