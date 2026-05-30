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
from copilot import CopilotClient, SubprocessConfig
from copilot.session import PermissionHandler
from debate_config import (
    GPT_MODEL,
    GROQ_MODEL,
    GEMINI_MODEL,
    GROQ_API_KEY,
    GOOGLE_API_KEY,
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
        self.display_name = AGENTS[name]
        self.history = []

    def reset(self):
        self.history = []

    def add_to_history(self, argument: str):
        self.history.append(argument)

    def build_prompt(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list) -> str:
        if round_num == 1:
            if mode == "review":
                instruction = (
                    "You are an expert peer reviewer. "
                    "Read the provided files carefully and give your independent critical assessment. "
                    "Be specific, cite evidence from the files, and be honest about weaknesses."
                )
            else:
                instruction = (
                    "You are a debater. "
                    "Take a strong position on the topic and argue it clearly. "
                    "Be specific and use evidence from the provided files."
                )

        elif round_num == 2:
            others = "\n\n".join([f"{name}:\n{arg}" for name, arg in other_arguments])
            instruction = (
                f"You have read the files and made your initial assessment. "
                f"Now read what the other reviewers said and respond directly to their points.\n\n"
                f"Other reviewers said:\n{others}\n\n"
                f"Respond specifically to their arguments. Agree where they are right, "
                f"push back where you disagree, and add anything important they missed."
            )

        else:
            instruction = (
                "This is your final argument. "
                "Synthesize everything that has been said across all rounds. "
                "State your final position clearly and summarize the most important points."
            )

        prompt = f"""
{instruction}

TOPIC: {topic}

FILES PROVIDED:
{context}

YOUR PREVIOUS ARGUMENTS IN THIS DEBATE:
{chr(10).join(self.history) if self.history else "None yet."}

Now give your argument for round {round_num}.
""".strip()

        return prompt

    @abstractmethod
    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list) -> str:
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
        raise RuntimeError(
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

    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments)
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

    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments)
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: self.client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=2048,
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

    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments)
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
    }
    if name not in agents:
        raise ValueError(f"Unknown agent: {name}. Choose from {list(agents.keys())}")
    return agents[name]()
