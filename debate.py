# debate.py
# Main orchestrator for the multi-model debate system.
# Loads input files, runs debates across all three models,
# manages rounds, handles human participation, scores arguments,
# and saves everything as artifacts.

import os
os.environ["GRPC_VERBOSITY"] = "ERROR"
os.environ["GLOG_minloglevel"] = "2"

# IMPORTS
import asyncio
import json
import re
import subprocess
import tempfile
import zipfile
from xml.etree import ElementTree as ET
from datetime import datetime
from pathlib import Path

from debate_config import (
    INPUT_DIR,
    DEBATES_DIR,
    ROUNDS,
    DEFAULT_MODE,
    AGENTS,
    MODES,
    GROQ_API_KEY,
    GROQ_MODEL,
    TIME_LIMIT,
)

from agents import get_agent
from reward import q_manager, scorer


TEXT_INPUT_EXTENSIONS = {
    ".txt", ".md", ".py", ".ts", ".js", ".json", ".csv", ".html", ".css",
    ".yaml", ".yml", ".sql", ".sh", ".toml", ".xml", ".rss", ".go",
    ".c", ".cpp", ".h", ".java", ".rb", ".php", ".rs", ".swift", ".kt",
    ".tsx", ".jsx", ".mdx", ".log",
}
TEXT_INPUT_NAMES = {
    "dockerfile", "license", "makefile", "procfile", "gemfile", "readme",
}
OOXML_INPUT_EXTENSIONS = {
    ".docx", ".pptx", ".xlsx", ".xlsm", ".pptm", ".docm",
}
SENSITIVE_INPUT_NAMES = {
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".env.test",
    "credentials.json",
    "service-account.json",
}
SENSITIVE_INPUT_EXTENSIONS = {
    ".key",
    ".pem",
    ".p12",
    ".pfx",
    ".crt",
    ".cer",
}
SENSITIVE_INPUT_PATTERN = re.compile(
    r"(secret|token|credential|private[_-]?key|api[_-]?key)",
    re.IGNORECASE,
)


def is_sensitive_input(path: Path) -> bool:
    relative = str(path).replace("\\", "/")
    name = path.name.lower()
    if name in SENSITIVE_INPUT_NAMES:
        return True
    if path.suffix.lower() in SENSITIVE_INPUT_EXTENSIONS:
        return True
    return bool(SENSITIVE_INPUT_PATTERN.search(relative))


def is_analyzable_input(path: Path) -> bool:
    if is_sensitive_input(path):
        return False
    name = path.name.lower()
    return bool(
        path.suffix.lower() in TEXT_INPUT_EXTENSIONS
        or path.suffix.lower() in OOXML_INPUT_EXTENSIONS
        or name in TEXT_INPUT_NAMES
        or not path.suffix
        or path.suffix.lower() == ".pdf"
    )


def _zip_xml_texts(archive: zipfile.ZipFile, members: list[str], namespaces: dict[str, str], text_tags: tuple[str, ...]) -> str:
    texts: list[str] = []
    for member in members:
        if member not in archive.namelist():
            continue
        try:
            root = ET.fromstring(archive.read(member))
        except Exception:
            continue
        for tag in text_tags:
            for node in root.findall(f".//{tag}", namespaces):
                value = "".join(node.itertext()).strip()
                if value:
                    texts.append(value)
    return "\n".join(texts).strip()


def _read_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        members = [
            "word/document.xml",
            *sorted(name for name in archive.namelist() if name.startswith("word/header") and name.endswith(".xml")),
            *sorted(name for name in archive.namelist() if name.startswith("word/footer") and name.endswith(".xml")),
        ]
        text = _zip_xml_texts(
            archive,
            members,
            {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"},
            ("w:t", "w:instrText"),
        )
    return text or "[DOCX file contained no extractable text.]"


def _read_pptx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        members = sorted(name for name in archive.namelist() if name.startswith("ppt/slides/") and name.endswith(".xml"))
        text = _zip_xml_texts(
            archive,
            members,
            {
                "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
                "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
            },
            ("a:t",),
        )
    return text or "[PPTX slide deck contained no extractable text.]"


def _read_xlsx(path: Path) -> str:
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            try:
                root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                for si in root.findall(".//m:si", ns):
                    text = "".join(si.itertext()).strip()
                    if text:
                        shared_strings.append(text)
            except Exception:
                shared_strings = []

        sheets: list[str] = []
        for member in sorted(name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")):
            try:
                root = ET.fromstring(archive.read(member))
            except Exception:
                continue
            rows: list[str] = [f"--- {member.split('/')[-1]} ---"]
            for row in root.findall(".//m:row", ns):
                values: list[str] = []
                for cell in row.findall("m:c", ns):
                    cell_type = cell.attrib.get("t")
                    value = ""
                    if cell_type == "s":
                        value_node = cell.find("m:v", ns)
                        if value_node is not None and value_node.text and value_node.text.isdigit():
                            idx = int(value_node.text)
                            if 0 <= idx < len(shared_strings):
                                value = shared_strings[idx]
                    else:
                        value_node = cell.find("m:v", ns)
                        if value_node is not None and value_node.text:
                            value = value_node.text.strip()
                        else:
                            inline = cell.find("m:is", ns)
                            if inline is not None:
                                value = "".join(inline.itertext()).strip()
                    if value:
                        values.append(value)
                if values:
                    rows.append(" | ".join(values))
            if len(rows) > 1:
                sheets.append("\n".join(rows))
    return "\n\n".join(sheets).strip() or "[XLSX workbook contained no extractable text.]"


def read_input_text(path: Path) -> str:
    if is_sensitive_input(path):
        return "[Stored only: sensitive file excluded from model context.]"

    suffix = path.suffix.lower()
    name = path.name.lower()
    if suffix in OOXML_INPUT_EXTENSIONS:
        try:
            if suffix in {".docx", ".docm"}:
                return _read_docx(path)
            if suffix in {".pptx", ".pptm"}:
                return _read_pptx(path)
            if suffix in {".xlsx", ".xlsm"}:
                return _read_xlsx(path)
        except Exception as exc:
            return f"[{suffix.upper()} extraction failed: {exc}]"
    if suffix == ".pdf":
        try:
            result = subprocess.run(
                ["pdftotext", "-layout", str(path), "-"],
                capture_output=True,
                text=True,
                check=True,
            )
            text = result.stdout.strip()
            return text or "[PDF extracted successfully, but no text was found.]"
        except Exception as exc:
            return f"[PDF extraction failed: {exc}]"

    if suffix in TEXT_INPUT_EXTENSIONS or name in TEXT_INPUT_NAMES or not suffix:
        return path.read_text(encoding="utf-8", errors="replace")

    return "[Stored only: non-text file format. This file is visible in the workspace but not included in model context.]"


# FILE LOADER

def load_input_files(user_id: str = None) -> str:
    """
    Load user files from the input directory and return them as one string.
    Text files are included directly. Non-text files are surfaced with a
    short placeholder so the debate still knows they exist.
    """
    files = []
    
    target_dir = INPUT_DIR / user_id if user_id else INPUT_DIR

    if not target_dir.exists():
        return "No files found in the input directory. Add files to the input/ folder."

    for path in sorted(target_dir.rglob("*")):
        if path.is_file():
            relative_path = path.relative_to(target_dir)
            try:
                content = read_input_text(path)
                files.append(f"=== FILE: {relative_path} ===\n{content}")
            except Exception as e:
                files.append(f"=== FILE: {relative_path} === ERROR READING: {e}")

    if not files:
        return "No files found in the input directory. Add files to the input/ folder."

    return "\n\n".join(files)


def list_input_files(user_id: str = None) -> list:
    """
    Return all input files with basic metadata for the web UI.
    """
    files = []
    target_dir = INPUT_DIR / user_id if user_id else INPUT_DIR
    
    if not target_dir.exists():
        return []
        
    for path in sorted(target_dir.rglob("*")):
        if path.is_dir():
            files.append({
                "path": str(path.relative_to(target_dir)),
                "size": 0,
                "type": "folder",
            })
        elif path.is_file():
            files.append({
                "path": str(path.relative_to(target_dir)),
                "size": path.stat().st_size,
                "type": "file",
                "analyzable": is_analyzable_input(path),
            })
    return files


# HUMAN PARTICIPANT

async def get_human_input(round_num: int) -> str | None:
    """
    Ask the human if they want to participate in this round.
    Returns their argument as a string, or None if they skip.
    """
    print(f"\n{'─'*60}")
    print(f"ROUND {round_num} - YOUR TURN")
    print("Do you want to contribute to this round?")
    print("Type your argument and press Enter twice when done.")
    print("Or just press Enter to skip.")
    print(f"{'─'*60}\n")

    lines = []
    while True:
        line = await asyncio.get_event_loop().run_in_executor(None, input)
        if line == "":
            break
        lines.append(line)

    if not lines:
        return None

    return "\n".join(lines)


# DEBATE STATE

def build_state(round_num: int, mode: str, arguments_so_far: list) -> str:
    """
    Build a string representation of the current debate state.
    This is what the Q-learner uses as its state key.
    """
    agents_argued = sorted(set(name for name, _ in arguments_so_far))
    return f"round={round_num}|mode={mode}|agents={','.join(agents_argued)}"


def friendly_model_error(agent_name: str, error: Exception) -> str:
    text = str(error).strip()
    lowered = text.lower()
    if any(term in lowered for term in ["429", "quota", "rate limit", "resource_exhausted", "insufficient balance"]):
        return f"{agent_name} could not respond because the provider quota or rate limit was exhausted."
    if "timeout" in lowered:
        return f"{agent_name} could not respond because the request timed out."
    if any(term in lowered for term in ["api key", "authentication", "unauthorized", "forbidden"]):
        return f"{agent_name} could not respond because the API key or authentication failed."
    if text:
        short = text.replace("\n", " ")
        return f"{agent_name} could not respond: {short[:180]}"
    return f"{agent_name} could not respond due to an unknown error."


# ROUND RUNNER

async def run_round(
    agents: list,
    topic: str,
    context: str,
    round_num: int,
    mode: str,
    previous_arguments: list,
    include_human: bool,
    on_argument: callable = None,
    run_warnings: list = None,
    human_input_hook: callable = None,
    check_interject_hook: callable = None,
    goal: str = None,
    persona: str = None,
) -> list:
    """
    Run one round of the debate.
    In round 1, all agents argue concurrently.
    In rounds 2 and 3, each agent reads what others said.
    Returns a list of (agent_name, argument) tuples.
    """
    print(f"\n{'='*60}")
    print(f"ROUND {round_num}")
    print(f"{'='*60}\n")

    round_arguments = []
    
    # Sort agents by historical best order
    ordered_agents = [agent for agent_name in q_manager.get_best_agent_order([a.name for a in agents]) for agent in agents if agent.name == agent_name]

    if round_num == 1:
        # Round 1: all agents argue at the same time
        print("All agents arguing simultaneously...\n")
        tasks = [
            agent.argue(topic, context, round_num, mode, previous_arguments, goal=goal, persona=persona)
            for agent in ordered_agents
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for agent, result in zip(ordered_agents, results):
            if isinstance(result, Exception):
                warning = friendly_model_error(agent.display_name, result)
                if run_warnings is not None: run_warnings.append(warning)
                print(f"\n{agent.display_name}: skipped ({result})\n")
                continue

            argument = result
            round_arguments.append((agent.display_name, argument))
            if on_argument: 
                on_argument(agent.display_name, argument)
            print(f"\n{agent.display_name}:\n{argument}\n")

    else:
        # Rounds 2 and 3: agents argue one by one
        for agent in ordered_agents:
            # Check for human interjections before this agent speaks
            if check_interject_hook:
                interjections = check_interject_hook()
                if interjections:
                    for text in interjections:
                        round_arguments.append(("Human", text))
                        previous_arguments.append(("Human", text))
                        if on_argument:
                            on_argument("Human", text)
                        print(f"\nHuman Interjection:\n{text}\n")

            print(f"\n{agent.display_name} is arguing...\n")
            try:
                argument = await agent.argue(
                    topic, context, round_num, mode, previous_arguments, goal=goal, persona=persona
                )
            except Exception as e:
                warning = friendly_model_error(agent.display_name, e)
                if run_warnings is not None: run_warnings.append(warning)
                print(f"{agent.display_name}: skipped ({e})\n")
                continue
            round_arguments.append((agent.display_name, argument))
            if on_argument:
                on_argument(agent.display_name, argument)
            print(f"{agent.display_name}:\n{argument}\n")
            previous_arguments.append((agent.display_name, argument))

    # Human turn
    if include_human:
        if human_input_hook:
            if asyncio.iscoroutinefunction(human_input_hook):
                human_argument = await human_input_hook(round_num)
            else:
                loop = asyncio.get_event_loop()
                human_argument = await loop.run_in_executor(None, human_input_hook, round_num)
        else:
            human_argument = await get_human_input(round_num)
            
        if human_argument:
            round_arguments.append(("Human", human_argument))
            if on_argument:
                on_argument("Human", human_argument)
            print(f"\nHuman:\n{human_argument}\n")

    return round_arguments


# SUMMARY HELPERS

def compute_agent_averages(scores: list) -> dict:
    """
    Compute each agent's average score across all scored arguments.
    """
    totals = {}
    counts = {}
    for entry in scores:
        agent = entry["agent"]
        totals[agent] = totals.get(agent, 0.0) + entry["average"]
        counts[agent] = counts.get(agent, 0) + 1
    return {
        agent: totals[agent] / counts[agent]
        for agent in sorted(totals)
        if counts[agent]
    }


def build_fallback_summary(topic: str, all_rounds: list, scores: list, run_warnings: list) -> str:
    """
    Build a deterministic summary when the moderator model is unavailable.
    """
    agents_seen = sorted({agent for round_args in all_rounds for agent, _ in round_args})
    agent_averages = compute_agent_averages(scores)
    best_agent = max(agent_averages, key=agent_averages.get) if agent_averages else None

    lines = [
        f"The debate reviewed: {topic}",
        "",
        "Key consensus:",
        "- The participating agents reviewed the same input context and responded across rounds.",
        "- Points repeated by multiple agents should be treated as the strongest signals.",
        "",
        "Key disagreements:",
        "- Review the round-by-round arguments below for places where agents challenged each other.",
    ]

    if best_agent:
        lines.extend([
            "",
            "Strongest scored reviewer:",
            f"- {best_agent} with an average score of {agent_averages[best_agent]:.2f}.",
        ])

    if agents_seen:
        lines.extend([
            "",
            "Participating agents:",
            "- " + ", ".join(agents_seen),
        ])

    if run_warnings:
        lines.extend([
            "",
            "Run warnings:",
            f"- {len(run_warnings)} provider or scoring warning(s) occurred; see the warnings section.",
        ])

    lines.extend([
        "",
        "Suggested Follow-Up Questions:",
        "- Which file or component should we patch first to get the biggest improvement?",
        "- What exact change would make the weakest area more robust or easier to use?",
        "- What should we verify after applying the first fix?",
    ])

    return "\n".join(lines)


def _extract_context_files(context: str, limit: int = 4) -> list[str]:
    matches: list[str] = []
    for raw in re.findall(r"^=== FILE: (.+?) ===$", context, flags=re.MULTILINE):
        name = raw.strip()
        if name and name not in matches:
            matches.append(name)
        if len(matches) >= limit:
            break
    return matches


def build_followup_questions(topic: str, context: str, all_rounds: list, run_warnings: list) -> list[str]:
    files = _extract_context_files(context)
    questions: list[str] = []

    if files:
        questions.append(f"Which change should we make first in {files[0]}?")
    else:
        questions.append("Which file or component should we patch first?")

    if len(files) > 1:
        questions.append(f"Does {files[1]} need validation, cleanup, or a clearer workflow?")
    else:
        questions.append("What specific fix would improve correctness or usability the most?")

    if len(files) > 2:
        questions.append(f"Should {files[2]} be split, documented, or guarded with better error handling?")
    else:
        questions.append("What should we verify after the first fix lands?")

    if run_warnings:
        questions.append("Were any warnings or rate limits caused by a specific provider or path?")

    return questions[:3]


def build_moderator_summary(topic: str, mode: str, all_rounds: list, scores: list, run_warnings: list, followup_questions: list[str] | None = None) -> str:
    """
    Ask Groq to write a concise moderator summary. Fall back to a deterministic summary
    if Groq is unavailable.
    """
    if not GROQ_API_KEY:
        return build_fallback_summary(topic, all_rounds, scores, run_warnings)

    debate_text = []
    for round_num, round_arguments in enumerate(all_rounds, 1):
        debate_text.append(f"ROUND {round_num}")
        for agent_name, argument in round_arguments:
            debate_text.append(f"{agent_name}: {argument[:2000]}")

    prompt = f"""You are the moderator of a multi-model debate.

Topic: {topic}
Mode: {mode}

Debate transcript:
{chr(10).join(debate_text)}

Suggested follow-up questions to include if they fit the discussion:
{chr(10).join(f"- {question}" for question in (followup_questions or []))}

Write a concise markdown executive summary with these sections:
- Key consensus
- Key disagreements
- Most important suggested fixes
- Suggested Follow-Up Questions
- Final moderator judgment

When you mention a fix, make it concrete. Name the file, folder, route, screen, or component if the transcript makes it visible.
Do not mention provider errors unless they affected the debate."""

    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY, timeout=TIME_LIMIT, max_retries=0)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=900,
        )
        summary = response.choices[0].message.content.strip()
        lines = summary.splitlines()
        if lines and lines[0].strip().lstrip("#").strip().lower() == "executive summary":
            summary = "\n".join(lines[1:]).strip()
        return summary
    except Exception:
        return build_fallback_summary(topic, all_rounds, scores, run_warnings)


# ARTIFACT SAVER

def save_artifact(topic: str, mode: str, all_rounds: list, scores: list, run_warnings: list, moderator_summary: str):
    """
    Save the complete debate as a markdown artifact.
    Each debate gets its own timestamped file.
    """
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = DEBATES_DIR / f"debate_{timestamp}.md"

    lines = [
        f"# Debate: {topic}",
        f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Mode:** {mode}",
        f"**Rounds:** {len(all_rounds)}",
        "",
        "## Executive Summary",
        "",
        moderator_summary,
        "",
    ]

    if run_warnings:
        lines.append("## Run Warnings")
        lines.append("")
        for warning in run_warnings:
            lines.append(f"- {warning}")
        lines.append("")

    for round_num, round_arguments in enumerate(all_rounds, 1):
        lines.append(f"## Round {round_num}")
        lines.append("")
        for agent_name, argument in round_arguments:
            lines.append(f"### {agent_name}")
            lines.append(argument)
            lines.append("")

    if scores:
        lines.append("## Scores")
        lines.append("")
        agent_averages = compute_agent_averages(scores)
        if agent_averages:
            lines.append("### Agent Averages")
            lines.append("")
            for agent_name, average in agent_averages.items():
                lines.append(f"- **{agent_name}**: {average:.2f}")
            lines.append("")

        lines.append("### Argument Scores")
        lines.append("")
        for entry in scores:
            lines.append(f"**{entry['agent']}** — Average: {entry['average']:.2f}")
            for criterion, score in entry["scores"].items():
                lines.append(f"  - {criterion}: {score:.2f}")
            lines.append("")

    filename.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nDebate saved to {filename}")
    return filename


# MAIN DEBATE RUNNER

async def run_debate(
    topic: str = None,
    mode: str = DEFAULT_MODE,
    include_human: bool = True,
    selected_agents: list = None,
    rounds: int = None,
    on_argument: callable = None,
    human_input_hook: callable = None,
    user_id: str = None,
    check_interject_hook: callable = None,
    goal: str = None,
    persona: str = None,
):
    """
    Run a full debate.

    topic:         what to debate or review. If None, uses the input files as the topic.
    mode:          review or debate
    include_human: whether to ask the human to participate each round
    user_id:       id of the user running the debate (to load correct files)
    """
    if mode not in MODES:
        raise ValueError(f"Invalid mode: {mode}. Choose from {MODES}")

    print("\nLoading input files...")
    context = load_input_files(user_id)

    if not topic:
        topic = "Review and critique the work provided in the input files."

    available_input_files = list_input_files(user_id)
    print(f"\nTOPIC: {topic}")
    print(f"MODE: {mode}")
    print(f"ROUNDS: {rounds}")
    print(f"{'='*60}\n")

    selected_agents = selected_agents or ["gpt", "groq", "gemini"]
    # We no longer select agents randomly or rank them and exclude some. 
    # If the user selects them, we use them all. We just sort them later in run_round.
    agents = []
    for agent_name in selected_agents:
        if agent_name not in AGENTS or agent_name == "human":
            print(f"Skipping unknown agent: {agent_name}")
            continue
        try:
            agents.append(get_agent(agent_name))
        except Exception as e:
            print(f"Skipping {AGENTS[agent_name]}: {e}")

    if not agents:
        raise RuntimeError("No agents are available. Check your API keys and GitHub CLI login.")

    for agent in agents:
        agent.reset()

    all_rounds = []
    all_arguments = []
    all_scores = []
    run_warnings = []

    for round_num in range(1, rounds + 1):
        round_arguments = await run_round(
            agents=agents,
            topic=topic,
            context=context,
            round_num=round_num,
            mode=mode,
            previous_arguments=all_arguments.copy(),
            include_human=include_human,
            on_argument=on_argument,
            run_warnings=run_warnings,
            human_input_hook=human_input_hook,
            check_interject_hook=check_interject_hook,
            goal=goal,
            persona=persona,
        )

        all_rounds.append(round_arguments)

        for agent_name, argument in round_arguments:
            if agent_name != "Human":
                state = build_state(round_num, mode, all_arguments)
                score_result = scorer.score(argument, context)
                if score_result.get("warning"):
                    run_warnings.append(f"Scoring failed for {agent_name} in round {round_num}: {score_result['warning']}")
                all_scores.append({
                    "agent": agent_name,
                    "round": round_num,
                    "scores": score_result["scores"],
                    "average": score_result["average"],
                })

                next_state = build_state(round_num + 1, mode, all_arguments + [(agent_name, argument)])
                q_manager.update(state, agent_name, score_result["average"], next_state)

        all_arguments.extend(round_arguments)

    q_manager.save()

    followup_questions = build_followup_questions(topic, context, all_rounds, run_warnings)
    moderator_summary = build_moderator_summary(topic, mode, all_rounds, all_scores, run_warnings, followup_questions)
    if "Suggested Follow-Up Questions" not in moderator_summary:
        moderator_summary = "\n".join([
            moderator_summary.strip(),
            "",
            "Suggested Follow-Up Questions:",
            *(f"- {question}" for question in followup_questions),
        ]).strip()
    artifact_path = save_artifact(topic, mode, all_rounds, all_scores, run_warnings, moderator_summary)

    print(f"\nDebate complete. Artifact saved to {artifact_path}")
    return {
        "artifact_path": str(artifact_path),
        "topic": topic,
        "mode": mode,
        "rounds": rounds,
        "agents": [agent.display_name for agent in agents],
        "input_files": available_input_files,
        "warnings": run_warnings,
        "scores": all_scores,
        "agent_averages": compute_agent_averages(all_scores),
        "summary": moderator_summary,
        "followup_questions": followup_questions,
        "rounds_data": [[list(entry) for entry in round_args] for round_args in all_rounds],
    }


# ENTRY POINT

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run a multi-model debate.")
    parser.add_argument("--topic", type=str, default=None, help="Topic to debate. Defaults to reviewing input files.")
    parser.add_argument("--mode", type=str, default=DEFAULT_MODE, choices=MODES, help="Debate mode: review or debate.")
    parser.add_argument("--no-human", action="store_true", help="Skip human participation.")
    parser.add_argument("--agents", type=str, default="gpt,groq,gemini", help="Comma-separated agents to run: gpt, groq, gemini.")
    parser.add_argument("--rounds", type=int, default=ROUNDS, help="Number of debate rounds.")
    args = parser.parse_args()
    selected_agents = [agent.strip() for agent in args.agents.split(",") if agent.strip()]

    result = asyncio.run(run_debate(
        topic=args.topic,
        mode=args.mode,
        include_human=not args.no_human,
        selected_agents=selected_agents,
        rounds=args.rounds,
    ))
    print(f"Result: {result['artifact_path']}")
