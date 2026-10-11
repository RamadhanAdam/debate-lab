import pytest
from agents import get_agent, BaseAgent


def test_get_agent_factory():
    for name in ["gpt", "groq", "gemini", "kimi", "deepseek", "claude"]:
        # We catch ValueError because API keys might not be in the environment during test
        try:
            agent = get_agent(name)
            assert isinstance(agent, BaseAgent)
            assert agent.name == name
        except ValueError:
            pass


def test_build_prompt_truncation():
    # Use a dummy subclass since BaseAgent is abstract
    class DummyAgent(BaseAgent):
        async def argue(self, *args, **kwargs):
            pass

    agent = DummyAgent("dummy")
    long_context = "A" * 15000
    prompt = agent.build_prompt("Test Topic", long_context, 1, "review", [])

    # 6000 + 6000 + truncation string length + prompt instructions length < 15000
    assert len(prompt) < 14000
    assert "...[truncated]..." in prompt


def test_build_prompt_rounds():
    class DummyAgent(BaseAgent):
        async def argue(self, *args, **kwargs):
            pass

    agent = DummyAgent("dummy")

    # Round 1
    p1 = agent.build_prompt("Topic", "Context", 1, "review", [])
    assert "rigorous analyst" in p1

    # Round 2
    p2 = agent.build_prompt("Topic", "Context", 2, "review", [("groq", "I disagree")])
    assert "directly respond to each other" in p2
    assert "groq:\nI disagree" in p2

    # Round 3
    p3 = agent.build_prompt("Topic", "Context", 3, "review", [])
    assert "3 most important actionable recommendations" in p3
