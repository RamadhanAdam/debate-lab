import pytest
from debate import run_round, build_state, compute_agent_averages
from agents import BaseAgent

class MockAgent(BaseAgent):
    def __init__(self, name):
        super().__init__(name)
    async def argue(self, topic, context, round_num, mode, other_arguments):
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
    assert avgs["gpt"] == 0.85
    assert avgs["groq"] == 0.6
