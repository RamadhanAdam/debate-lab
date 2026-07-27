# agents.py
# All three debater agents in one file.
# BaseAgent defines the shared behavior.
# GPTAgent, GroqAgent, GeminiAgent each override only the API call.

# IMPORTS
import os
import asyncio
import subprocess
from abc import ABC, abstractmethod
from groq import Groq
from google import genai
import anthropic
from openai import OpenAI
from copilot import CopilotClient, SubprocessConfig
from copilot.session import PermissionHandler
from debate_config import (
    GPT_MODEL,
    GROQ_MODEL,
    GEMINI_MODEL,
    KIMI_MODEL,
    DEEPSEEK_MODEL,
    CLAUDE_MODEL,
    GROQ_API_KEY,
    GOOGLE_API_KEY,
    KIMI_API_KEY,
    DEEPSEEK_API_KEY,
    ANTHROPIC_API_KEY,
    AGENTS,
    SCORING_CRITERIA,
    TIME_LIMIT,
)


# BASE AGENT


class BaseAgent(ABC):
    """
    Abstract base class for all debater agents.
    Cannot be used directly, only through subclasses.
    """

    def __init__(self, name: str):
        self.name = name
        self.display_name = AGENTS.get(name, name)
        self.history = []

    def reset(self):
        self.history = []

    def add_to_history(self, argument: str):
        self.history.append(argument)

    def build_prompt(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list, goal: str = None, persona: str = None) -> str:
        context_limit = 12000
        if len(context) > context_limit:
            head = context[:5000]
            tail = context[-5000:]
            context = (
                head
                + "\n\n...[truncated]...\n\n"
                + tail
            )

        persona_instr = persona if persona else "You are a rigorous analyst."
        goal_instr = f"Debate goal: {goal}" if goal else "Debate goal: review the material thoroughly."
        fix_instr = (
            "When you identify a problem, name the file, folder, route, or component if it is visible in the context. "
            "Then say exactly what should change, why it matters, and what to verify after the change."
        )
        previous = self.history[-3:] if self.history else []
        previous_block = "\n\n".join(previous) if previous else "None yet."
        other_block = "\n\n".join([f"--- {name} ---\n{arg}" for name, arg in other_arguments[-6:]]) if other_arguments else "None yet."

        if round_num == 1:
            instruction = (
                f"{persona_instr}\n"
                f"{goal_instr}\n"
                "Round 1: give an independent first read.\n"
                "Use clear markdown with these sections:\n"
                "## Deep Findings\n"
                "## Evidence From The Files\n"
                "## Problems Or Risks\n"
                "## Concrete Changes\n"
                "## What To Verify Next\n"
                "## Files To Inspect Next\n"
                "Be specific, cite filenames or headings when you can, and quote short snippets when the context makes them visible. Focus on depth, not summary."
            )
        elif round_num == 2:
            others = "\n\n".join([f"{name}:\n{arg}" for name, arg in other_arguments[-6:]])
            instruction = (
                f"{persona_instr}\n"
                f"{goal_instr}\n"
                "Round 2: directly respond to each other agent.\n"
                "Use markdown with these sections:\n"
                "## Where I Agree\n"
                "## Where I Disagree\n"
                "## Evidence That Matters Most\n"
                "## Revised Recommendation\n"
                "## Concrete Fixes\n"
                "## What Would Change My Mind\n"
                "Name the other agents and react to their strongest points. Push toward concrete edits rather than generic agreement."
            )
        else:
            instruction = (
                f"{persona_instr}\n"
                f"{goal_instr}\n"
                "Final round: synthesize the entire debate into a practical conclusion with implementation detail.\n"
                "Use markdown with these sections:\n"
                "## Executive Judgment\n"
                "## Biggest Remaining Gaps\n"
                "## What To Do First\n"
                "## Final Recommendation\n"
                "## Suggested Follow-Up Questions\n"
                "## Suggested Patch Outline\n"
                "Provide the 3 most important actionable recommendations, state what to do first, and be direct and concrete. Do not summarize the debate loosely; turn it into a work plan."
            )

        prompt = f"""
{instruction}
{fix_instr}

TOPIC
{topic}

FILES
{context}

OTHER REVIEWERS SO FAR
{others if round_num == 2 else other_block}

YOUR LAST FEW ARGUMENTS
{previous_block}

Return only the debate answer. Do not restate the prompt.
""".strip()

        return prompt

    @abstractmethod
    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list, goal: str = None, persona: str = None) -> str:
        pass


# GPT AGENT

def get_github_cli_token() -> str:
    """
    Return the OAuth-style token from GitHub CLI.
    Ignore GITHUB_TOKEN/GH_TOKEN because PATs are rejected by Copilot sessions.
    """
    env = {**os.environ}
    env.pop("GITHUB_TOKEN", None)
    env.pop("GH_TOKEN", None)

    try:
        return subprocess.check_output(
            ["gh", "auth", "token"],
            env=env,
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        raise ValueError(
            "GitHub CLI is not authenticated. Run: gh auth login -h github.com"
        ) from exc


class GPTAgent(BaseAgent):
    """
    GPT debater using the GitHub Copilot Python SDK.
    """

    def __init__(self):
        super().__init__("gpt")
        self.github_token = get_github_cli_token()
        self.client = CopilotClient(SubprocessConfig(github_token=self.github_token))

    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list, goal: str = None, persona: str = None) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments, goal=goal, persona=persona)
        session = None
        try:
            await self.client.start()
            session = await self.client.create_session(
                model=GPT_MODEL,
                on_permission_request=PermissionHandler.approve_all,
                github_token=self.github_token,
            )
            response = await session.send_and_wait(prompt, timeout=TIME_LIMIT)
            data = getattr(response, "data", None)
            argument = getattr(data, "content", None) or "No response received."
            self.add_to_history(argument)
            return argument
        finally:
            if session is not None:
                await session.disconnect()
            await self.client.stop()


# GROQ AGENT (Llama via Groq)

class GroqAgent(BaseAgent):
    """
    Llama-3.3 debater using the Groq API.
    """

    def __init__(self):
        super().__init__("groq")
        if not GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY is not set in your .env file.")
        self.client = Groq(api_key=GROQ_API_KEY, timeout=TIME_LIMIT, max_retries=0)

    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list, goal: str = None, persona: str = None) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments, goal=goal, persona=persona)
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: self.client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=4096,
                )
            ),
            timeout=TIME_LIMIT,
        )
        argument = response.choices[0].message.content
        self.add_to_history(argument)
        return argument


# GEMINI AGENT

class GeminiAgent(BaseAgent):
    """
    Gemini debater using the Google Generative AI Python SDK.
    """

    def __init__(self):
        super().__init__("gemini")
        if not GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY is not set in your .env file.")
        self.client = genai.Client(api_key=GOOGLE_API_KEY)

    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list, goal: str = None, persona: str = None) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments, goal=goal, persona=persona)
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: self.client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt,
                )
            ),
            timeout=TIME_LIMIT,
        )
        argument = response.text
        self.add_to_history(argument)
        return argument


# KIMI AGENT

class KimiAgent(BaseAgent):
    """
    Moonshot Kimi debater using OpenAI compatible endpoint.
    """

    def __init__(self):
        super().__init__("kimi")
        if not KIMI_API_KEY:
            raise ValueError("KIMI_API_KEY is not set in your .env file.")
        self.client = OpenAI(api_key=KIMI_API_KEY, base_url="https://api.moonshot.cn/v1", timeout=TIME_LIMIT, max_retries=0)

    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list, goal: str = None, persona: str = None) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments, goal=goal, persona=persona)
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: self.client.chat.completions.create(
                    model=KIMI_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=4096,
                )
            ),
            timeout=TIME_LIMIT,
        )
        argument = response.choices[0].message.content
        self.add_to_history(argument)
        return argument


# DEEPSEEK AGENT

class DeepSeekAgent(BaseAgent):
    """
    DeepSeek debater using OpenAI compatible endpoint.
    """

    def __init__(self):
        super().__init__("deepseek")
        if not DEEPSEEK_API_KEY:
            raise ValueError("DEEPSEEK_API_KEY is not set in your .env file.")
        self.client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com/v1", timeout=TIME_LIMIT, max_retries=0)

    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list, goal: str = None, persona: str = None) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments, goal=goal, persona=persona)
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: self.client.chat.completions.create(
                    model=DEEPSEEK_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=4096,
                )
            ),
            timeout=TIME_LIMIT,
        )
        argument = response.choices[0].message.content
        self.add_to_history(argument)
        return argument


# CLAUDE AGENT

class ClaudeAgent(BaseAgent):
    """
    Claude debater using Anthropic SDK.
    """

    def __init__(self):
        super().__init__("claude")
        if not ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY is not set in your .env file.")
        self.client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=TIME_LIMIT, max_retries=0)

    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list, goal: str = None, persona: str = None) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments, goal=goal, persona=persona)
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: self.client.messages.create(
                    model=CLAUDE_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=4096,
                )
            ),
            timeout=TIME_LIMIT,
        )
        argument = response.content[0].text
        self.add_to_history(argument)
        return argument


# FACTORY FUNCTION

def get_agent(name: str) -> BaseAgent:
    """
    Returns the right agent for a given name.
    Usage: agent = get_agent("groq")
    """
    agents = {
        "gpt": GPTAgent,
        "groq": GroqAgent,
        "gemini": GeminiAgent,
        "kimi": KimiAgent,
        "deepseek": DeepSeekAgent,
        "claude": ClaudeAgent,
    }
    if name not in agents:
        raise ValueError(f"Unknown agent: {name}. Choose from {list(agents.keys())}")
    return agents[name]()
