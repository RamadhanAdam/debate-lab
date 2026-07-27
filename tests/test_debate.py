import pytest
from debate import run_round, build_state, compute_agent_averages, load_input_files, list_input_files, build_followup_questions
from agents import BaseAgent

class MockAgent(BaseAgent):
    def __init__(self, name):
        super().__init__(name)
    async def argue(self, topic, context, round_num, mode, other_arguments, goal=None, persona=None):
        return f"Argument from {self.name}"

@pytest.mark.asyncio
async def test_run_round():
    agents = [MockAgent("gpt"), MockAgent("groq")]
    
    # Round 1
    args1 = await run_round(agents, "Topic", "Context", 1, "review", [], False)
    assert len(args1) == 2
    assert args1[0][0] in ["GPT-4.1", "Llama-3.3 (Groq)"]
    
    # Round 2
    args2 = await run_round(agents, "Topic", "Context", 2, "review", args1, False)
    assert len(args2) == 2

def test_build_state():
    state = build_state(1, "review", [("GPT-4.1", "arg1"), ("Llama-3.3 (Groq)", "arg2")])
    assert "round=1" in state
    assert "mode=review" in state
    assert "GPT-4.1" in state

def test_compute_agent_averages():
    scores = [
        {"agent": "gpt", "average": 0.8},
        {"agent": "groq", "average": 0.6},
        {"agent": "gpt", "average": 0.9},
    ]
    avgs = compute_agent_averages(scores)
    assert avgs["gpt"] == pytest.approx(0.85)
    assert avgs["groq"] == 0.6


def test_input_listing_includes_all_files(tmp_path, monkeypatch):
    import debate

    user_dir = tmp_path / "user-1"
    user_dir.mkdir()
    (user_dir / "notes.md").write_text("# Notes\nHello world", encoding="utf-8")
    (user_dir / "diagram.png").write_bytes(b"\x89PNG\r\n\x1a\nbinary")

    monkeypatch.setattr(debate, "INPUT_DIR", tmp_path)

    files = list_input_files("user-1")
    paths = {item["path"]: item for item in files}

    assert "notes.md" in paths
    assert "diagram.png" in paths
    assert paths["notes.md"]["analyzable"] is True
    assert paths["diagram.png"]["analyzable"] is False


def test_load_input_files_marks_stored_only(tmp_path, monkeypatch):
    import debate

    user_dir = tmp_path / "user-2"
    user_dir.mkdir()
    (user_dir / "brief.md").write_text("Alpha beta", encoding="utf-8")
    (user_dir / "archive.zip").write_bytes(b"PK\x03\x04binary")

    monkeypatch.setattr(debate, "INPUT_DIR", tmp_path)

    content = load_input_files("user-2")

    assert "Alpha beta" in content
    assert "archive.zip" in content
    assert "Stored only: non-text file format" in content


def test_sensitive_inputs_are_not_model_readable(tmp_path, monkeypatch):
    import debate

    user_dir = tmp_path / "user-3"
    user_dir.mkdir()
    (user_dir / ".env").write_text("API_KEY=real-secret", encoding="utf-8")
    (user_dir / "notes.md").write_text("Public notes", encoding="utf-8")

    monkeypatch.setattr(debate, "INPUT_DIR", tmp_path)

    files = list_input_files("user-3")
    env_meta = next(item for item in files if item["path"] == ".env")
    content = load_input_files("user-3")

    assert env_meta["analyzable"] is False
    assert "real-secret" not in content
    assert "sensitive file excluded from model context" in content
    assert "Public notes" in content


def test_build_followup_questions_uses_files():
    context = """=== FILE: docs/README.md ===
hello

=== FILE: src/main.py ===
print('hi')
"""
    questions = build_followup_questions("Topic", context, [], [])

    assert len(questions) == 3
    assert "docs/README.md" in questions[0]
    assert "src/main.py" in questions[1] or "src/main.py" in questions[2]
