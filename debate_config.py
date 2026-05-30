# debate_config.py
# Central configuration for the multi-model debate system
# Every other file imports from here so changes happen in one place

# Imports
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Path configuration
ROOT = Path(__file__).parent

# Directories for debates and input data
DEBATES_DIR = ROOT / "debates"
INPUT_DIR = ROOT / "input"

# Ensure directories exist
DEBATES_DIR.mkdir(exist_ok=True)
INPUT_DIR.mkdir(exist_ok=True)

# API keys 
GROQ_API_KEY = os.getenv("GROQ_API_KEY", None)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", None)
KIMI_API_KEY = os.getenv("KIMI_API_KEY", None)
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", None)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", None)

# Models

GPT_MODEL = "gpt-4.1"
GROQ_MODEL = "llama-3.3-70b-versatile"
GEMINI_MODEL = "gemini-2.0-flash-lite"
KIMI_MODEL = "moonshot-v1-8k"
DEEPSEEK_MODEL = "deepseek-chat"
CLAUDE_MODEL = "claude-3-5-haiku-20241022"

# Debate settings
ROUNDS = 3  # Number of debate rounds
MAX_TURNS = 5  # Max turns per round
TIME_LIMIT = 60  # Time limit per turn in seconds

MODES = ["review", "debate"]  # Available modes of operation
DEFAULT_MODE = "review"  


# Q-Learning settings
LEARNING_RATE = 0.1 # How fast the Q-values are updated after each debate
DISCOUNT_FACTOR = 0.9 # How much future rewards are valued compared to immediate rewards
EPSILON = 0.2 # Exploration rate for action selection (20% of the time, choose a random action, i.e system tries something different instead of what it knows works)
# This is how it discovers better strategies over time instead of getting stuck. The other 80% it exploits what it already learned.

Q_TABLE_FILE = ROOT / "q_table.json" # File to save the Q-table for learning across debates. Meaning learning persists between runs
# Every debate the system makes is slightly smarter about which arguments are best

# Scoring Criteria

"""
These are the six dimensions we score each argument on, each from 0 to 1. The Q-learner uses the average of these as its reward signal.
Together they capture what makes a good argument: it is specific, it responds to others, it uses evidence, it adds something new, and it
is logically sound."""

SCORING_CRITERIA = [
    "specificity",       # did the argument make specific concrete points
    "responsiveness",    # did it actually respond to what others said
    "evidence",          # did it cite evidence from the files
    "new_information",   # did it introduce something not said before
    "logical_soundness", # is the argument logically consistent
    "persuasiveness"     # how convincing is the argument overall
]


# AGENT NAMES
AGENTS = {
    "gpt": "GPT-4.1",
    "groq": "Llama-3.3 (Groq)",
    "gemini": "Gemini Flash",
    "kimi": "Moonshot Kimi",
    "deepseek": "DeepSeek",
    "claude": "Claude 3.5 Haiku",
    "human": "Human",
}
