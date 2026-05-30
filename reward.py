# reward.py
# Q-learning reward system for the multi-model debate system.
# Tracks argument quality over time and learns which models argue best.

# IMPORTS
import json
import random
import re
from pathlib import Path
from debate_config import (
    LEARNING_RATE,
    DISCOUNT_FACTOR,
    EPSILON,
    Q_TABLE_FILE,
    SCORING_CRITERIA,
    AGENTS,
)


# Q-TABLE MANAGER

class QTableManager:
    """
    Manages the Q-table for the debate system.
    State: which round we are in and what has been said so far.
    Action: which agent argues next and what strategy they use.
    Reward: the score the argument receives on the scoring criteria.
    """

    def __init__(self):
        self.q_table = {}
        self._load()

    def _load(self):
        if Path(Q_TABLE_FILE).exists():
            with open(Q_TABLE_FILE, "r") as f:
                self.q_table = json.load(f)
            print(f"Q-table loaded from {Q_TABLE_FILE}")
        else:
            print("No existing Q-table found, starting fresh.")

    def save(self):
        with open(Q_TABLE_FILE, "w") as f:
            json.dump(self.q_table, f, indent=2)
        print(f"Q-table saved to {Q_TABLE_FILE}")

    def get_q_value(self, state: str, action: str) -> float:
        return self.q_table.get(state, {}).get(action, 0.0)

    def update(self, state: str, action: str, reward: float, next_state: str):
        current_q = self.get_q_value(state, action)
        next_q_values = self.q_table.get(next_state, {})
        max_next_q = max(next_q_values.values()) if next_q_values else 0.0
        new_q = current_q + LEARNING_RATE * (
            reward + DISCOUNT_FACTOR * max_next_q - current_q
        )
        if state not in self.q_table:
            self.q_table[state] = {}
        self.q_table[state][action] = new_q

    def choose_action(self, state: str, possible_actions: list) -> str:
        if random.random() < EPSILON:
            return random.choice(possible_actions)
        q_values = {
            action: self.get_q_value(state, action)
            for action in possible_actions
        }
        return max(q_values, key=q_values.get)

    def rank_actions(self, state: str, possible_actions: list) -> list:
        """
        Return actions ordered by learned Q-value, with light exploration.
        """
        remaining = list(possible_actions)
        ranked = []
        while remaining:
            action = self.choose_action(state, remaining)
            ranked.append(action)
            remaining.remove(action)
        return ranked


# ARGUMENT SCORER

class ArgumentScorer:
    """
    Scores arguments on the defined criteria using Groq as the judge.
    The scores become the reward signal for the Q-learner.
    """

    def __init__(self):
        self.criteria = SCORING_CRITERIA

    def score(self, argument: str, context: str) -> dict:
        from debate_config import GROQ_API_KEY, GROQ_MODEL, TIME_LIMIT

        # If no key available return zeros
        if not GROQ_API_KEY:
            scores = self.heuristic_score(argument, context)
            return {
                "scores": scores,
                "average": self.compute_average(scores),
                "argument": argument,
                "warning": "GROQ_API_KEY is not set. Used heuristic scoring.",
            }

        prompt = f"""Score this argument on each criterion from 0.0 to 1.0.

Argument:
{argument}

Context (what is being discussed):
{context[:2000]}

Criteria to score:
{', '.join(self.criteria)}

Respond ONLY with valid JSON like this:
{{"specificity": 0.7, "responsiveness": 0.8, "evidence": 0.6, "new_information": 0.5, "logical_soundness": 0.9, "persuasiveness": 0.7}}

No explanation, just the JSON."""

        try:
            from groq import Groq
            client = Groq(api_key=GROQ_API_KEY, timeout=TIME_LIMIT, max_retries=0)
            response = client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
            )
            scores_raw = json.loads(response.choices[0].message.content.strip())
        except Exception:
            scores = self.heuristic_score(argument, context)
            return {
                "scores": scores,
                "average": self.compute_average(scores),
                "argument": argument,
                "warning": "Groq scoring request failed. Used heuristic scoring.",
            }

        scores = {c: float(scores_raw.get(c, 0.5)) for c in self.criteria}
        return {
            "scores": scores,
            "average": self.compute_average(scores),
            "argument": argument,
        }

    def compute_average(self, scores: dict) -> float:
        if not scores:
            return 0.0
        return sum(scores.values()) / len(scores)

    def heuristic_score(self, argument: str, context: str) -> dict:
        """
        Local fallback scorer. It is intentionally simple, but better than all-zero
        scores when the model judge is unavailable.
        """
        words = re.findall(r"\w+", argument.lower())
        unique_words = set(words)
        context_terms = set(re.findall(r"\w+", context.lower()))
        length = len(words)

        evidence_markers = ["file", "section", "proposal", "method", "abstract", "research", "because"]
        response_markers = ["agree", "disagree", "however", "but", "respond", "missed", "others"]
        logic_markers = ["therefore", "because", "however", "if", "then", "conclusion", "limitation"]

        overlap = len(unique_words & context_terms) / max(len(unique_words), 1)
        evidence = min(1.0, overlap * 2 + sum(marker in argument.lower() for marker in evidence_markers) * 0.08)
        responsiveness = min(1.0, sum(marker in argument.lower() for marker in response_markers) * 0.18 + 0.35)
        specificity = min(1.0, length / 500 + evidence * 0.35)
        new_information = min(1.0, len(unique_words) / max(length, 1) + 0.15)
        logical_soundness = min(1.0, 0.45 + sum(marker in argument.lower() for marker in logic_markers) * 0.1)
        persuasiveness = min(1.0, (specificity + evidence + logical_soundness) / 3 + 0.1)

        return {
            "specificity": specificity,
            "responsiveness": responsiveness,
            "evidence": evidence,
            "new_information": new_information,
            "logical_soundness": logical_soundness,
            "persuasiveness": persuasiveness,
        }


# MODULE LEVEL INSTANCES

q_manager = QTableManager()
scorer = ArgumentScorer()
