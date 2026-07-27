# Agent Guide

This guide explains how the debate agents are wired together and how to add a new provider.

## Current Agent Flow

The app creates agent instances in `agents.py`, then `debate.py` runs them round by round. Each agent receives:

- the topic or prompt
- the loaded input context
- the current round number
- the debate mode
- the previous transcript
- optional goal and persona hints

Arguments are then scored by `reward.py` and the strongest agents are nudged earlier or later in future rounds by the learning layer.

The browser UI mirrors the same agent roster, so the names, colors, and icons stay consistent between the docs, the CLI, and the app.

## Built-In Agents

The current agent roster is defined in `debate_config.py` and surfaced in the UI through `web/assets/js/constants.js`.

Typical built-in agents include:

- GPT
- Groq
- Gemini
- Claude
- DeepSeek
- Kimi
- Human

You do not need all of them enabled. The UI and CLI both allow you to run a subset.

## Adding a New Agent

To add a provider:

1. Add its API key and model name in `debate_config.py`.
2. Implement an agent class in `agents.py` that inherits from the base agent type used in the project.
3. Register it in the `get_agent()` factory.
4. Add display metadata in `web/assets/js/constants.js` so the UI can render an icon and color.
5. Update any validation or key-testing paths in `web_app.py` if the provider needs special handling.

## Prompt Shape

The debate engine typically expects the agent to consider:

- the input files
- the current round
- previous arguments
- the selected mode
- the selected goal
- the persona

The exact prompt template lives in the provider wrappers and can be adjusted if you want sharper behavior or a more formal debate style.

## Output style

Good agent outputs in this project are usually:

- short enough to scan quickly
- structured with headings or bullets
- plain markdown rather than highly decorated prose
- focused on one idea per message

## Practical Tips

- Keep prompts short enough that the provider can answer within its context limits.
- Prefer structured instructions over vague role-play.
- Return plain markdown when possible so the report renderer can display the response cleanly.
- If a provider fails frequently, catch the exception and let the debate continue with the remaining agents.
- Keep the provider list short when testing the UI so the run finishes quickly.

## Related Files

- `agents.py`
- `debate.py`
- `debate_config.py`
- `reward.py`
- `web/assets/js/constants.js`
