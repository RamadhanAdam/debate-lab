# Multi-Model Debate System

A multi-agent debate system where GPT, Llama (via Groq), and Gemini argue about
the same material from different angles. Includes a Q-learning reward system that
tracks argument quality over time and learns which model argues best.

## How it works

You drop files into the `input/` folder. The three models read them and debate
in three rounds:

- **Round 1:** Each model gives an independent assessment simultaneously
- **Round 2:** Each model reads what the others said and responds directly
- **Round 3:** Each model gives a final synthesized argument

You can participate as a fourth voice in any round, or watch and let the models
argue on their own.

After every debate, a scored markdown artifact is saved to the `debates/` folder.
The Q-learner updates after each argument and saves its state to `q_table.json`
so learning persists across runs.

## Models

| Agent | Model | API |
|-------|-------|-----|
| GPT | GPT-4.1 | GitHub Copilot SDK |
| Llama | Llama-3.3-70b | Groq |
| Gemini | Gemini 2.0 Flash Lite | Google AI |

## Setup

**1. Clone the repo and create the environment**
```bash
git clone https://github.com/RamadhanAdam/copilot-sdk-agents
cd copilot-sdk-agents
conda create -n debate-agents python=3.11
conda activate debate-agents
pip install -r requirements.txt
```

**2. Install and authenticate the GitHub Copilot CLI**
```bash
npm install -g @github/copilot
gh auth login
copilot
```
Inside the Copilot CLI, type `/login` and authenticate in the browser.
You need a GitHub Copilot subscription for GPT to work.

**3. Get API keys**

- Groq (free, no card needed): console.groq.com → API Keys → Create
- Google Gemini (free): aistudio.google.com → Get API Key → Create

**4. Add keys to `.env`**
```
GROQ_API_KEY=gsk_...
GOOGLE_API_KEY=AIza...
```

**5. Add files to review**

Drop any `.txt`, `.md`, `.py`, `.ts`, `.js`, `.json`, or `.csv` files into
the `input/` folder. The loader scans recursively, so nested folders and cloned
repositories work too.

## What to put in the input folder

The agents read everything in `input/` as context before arguing. The more
relevant content you give them, the better the debate. It can be anything:

**A research paper or draft:**
Drop your `.md` or `.txt` draft in. The agents will peer review it, challenge
your methodology, argue about your conclusions, and suggest improvements.

**A codebase:**
```bash
git clone https://github.com/username/your-project input/your-project
```
The agents will debate the correctness, architecture, and design choices.

**A business plan, proposal, or report:**
Drop any `.txt` or `.md` document in. The agents will argue about whether
your reasoning is sound, what is missing, and what could go wrong.

**A dataset or results file:**
Drop a `.csv` or `.json` in with your results. The agents will debate what
the numbers actually show and whether your conclusions hold.

**A specific claim or idea:**
Create a `input/brief.txt` and just write what you want debated:

**Clone an entire repository into input:**
```bash
git clone https://github.com/username/your-project input/your-project
```
The agents will read all supported file types recursively. Good for reviewing
a full codebase or research project.

**Copy specific files:**
```bash
cp my_paper.md input/
cp model.py input/
cp results.csv input/
```

**Write a brief directly:**
Just create a `input/brief.txt` and describe what you want debated. For example:
```
My approach uses a transformer encoder trained on raw bytes to detect malware.
The model achieves 94% accuracy on seen families but drops to 71% on unseen ones.
I claim this generalizes well to open-world settings.
```
The agents will debate whether your claims are valid.

**For research papers:**
Drop your draft `.md` or `.txt` into input. The agents will peer review it,
argue about the methodology, challenge your conclusions, and suggest improvements.

**For code:**
Drop your `.py`, `.ts`, or `.js` files in. The agents will debate the
correctness, design choices, and potential issues.

## Running a debate

**Web UI:**
```bash
python3 web_app.py
```

Then open:
```text
http://127.0.0.1:8765
```

The web UI lets you write an input brief, choose agents, choose mode/rounds,
run a debate, inspect warnings and scores, and read saved reports.

**Review mode** (default, each model independently critiques then responds):
```bash
python3 debate.py
```

**Debate mode** (models take opposing positions and argue):
```bash
python3 debate.py --mode debate
```

**With a specific topic:**
```bash
python3 debate.py --topic "Is this methodology valid?"
```

**Without human participation:**
```bash
python3 debate.py --no-human
```

**Run only selected agents:**
```bash
python3 debate.py --agents gpt,groq --no-human
```

**Run fewer rounds for a cheaper smoke test:**
```bash
python3 debate.py --rounds 1 --agents groq --no-human
```

## Calling agents directly from your own code

You can import and use individual agents without running a full debate.
Useful if you want to integrate one model's review into your own pipeline:

```python
import asyncio
from agents import get_agent

async def main():
    # Get any agent by name: "gpt", "groq", or "gemini"
    agent = get_agent("groq")

    # Give it a topic, some context, and ask for round 1 in review mode
    argument = await agent.argue(
        topic="Is this approach sound?",
        context=open("input/my_paper.md").read(),
        round_num=1,
        mode="review",
        other_arguments=[],  # empty for round 1
    )

    print(argument)

asyncio.run(main())
```

You can also run all three and collect their responses yourself:

```python
import asyncio
from agents import get_agent

async def main():
    agents = [get_agent("gpt"), get_agent("groq"), get_agent("gemini")]
    context = open("input/my_paper.md").read()
    topic = "Review the methodology in this paper."

    # Run all three simultaneously
    results = await asyncio.gather(*[
        agent.argue(topic, context, round_num=1, mode="review", other_arguments=[])
        for agent in agents
    ])

    for agent, result in zip(agents, results):
        print(f"\n{agent.display_name}:\n{result}\n")

asyncio.run(main())
```

## Output

Each debate is saved as a timestamped markdown file in `debates/`:

```
debates/
  debate_2026-05-28_10-30-00.md
```

The file contains every argument from every round plus scores for each argument
across six criteria: specificity, responsiveness, evidence, new information,
logical soundness, and persuasiveness.

Each artifact also includes:

- An executive summary from a moderator step
- Run warnings for provider failures, quota issues, or scoring failures
- Per-agent average scores
- Per-argument scores by round

Provider errors are not treated as agent arguments. If Gemini hits a quota limit,
for example, the warning appears in `Run Warnings` while the rest of the debate
continues.

## Q-Learning

The system uses Q-learning to track which models produce the best arguments over
time. After each debate the Q-table updates and saves to `q_table.json`. The more
debates you run, the better the system understands each model's strengths.

The state is the current round and mode. The action is which model argues.
The reward is the average score across the six criteria, judged by Groq after
each argument. If Groq scoring fails, the run records a warning and uses a local
heuristic scorer instead of crashing. The Q-table also influences agent ordering
in later runs, so stronger historical performers are tried earlier.

## Project structure

```
copilot-sdk-agents/
├── debate.py          # Main orchestrator
├── agents.py          # GPT, Groq, and Gemini agent classes
├── reward.py          # Q-learning reward system
├── debate_config.py   # All configuration in one place
├── web_app.py         # Local web server
├── web/               # Browser UI
├── index.ts           # Original JS prototype (reference only)
├── input/             # Drop your files here
├── debates/           # Saved debate artifacts
├── reviews/           # Saved review artifacts from index.ts
├── q_table.json       # Persisted Q-table
├── .env               # API keys (never commit this)
├── requirements.txt   # Python dependencies
└── README.md
```

## Extending the system

To add a new model, add a new subclass in `agents.py` following the same pattern
as `GroqAgent`, add it to the factory function, add its config to
`debate_config.py`, and add it to the `agents` list in `debate.py`.
