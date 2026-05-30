# Adding New Agents

Debate Lab's agent system is heavily modularized. To add a new AI model to the debate, follow these steps.

## Step 1: Add API Key to Environment

Add your provider's API key to `.env` and `.env.example`:
\`\`\`bash
MYMODEL_API_KEY=your_key_here
\`\`\`

Load it in `debate_config.py`:
\`\`\`python
MYMODEL_API_KEY = os.getenv("MYMODEL_API_KEY", None)
MYMODEL_MODEL = "mymodel-latest"
\`\`\`

Add it to the `AGENTS` mapping in `debate_config.py`:
\`\`\`python
AGENTS = {
    ...
    "mymodel": "My Model Display Name",
}
\`\`\`

## Step 2: Create the Agent Class

In `agents.py`, create a class inheriting from `BaseAgent`:

\`\`\`python
from debate_config import MYMODEL_API_KEY, MYMODEL_MODEL, TIME_LIMIT

class MyModelAgent(BaseAgent):
    def __init__(self):
        super().__init__("mymodel")
        if not MYMODEL_API_KEY:
            raise ValueError("MYMODEL_API_KEY is not set.")
        # Initialize your SDK client here
        
    async def argue(self, topic: str, context: str, round_num: int, mode: str, other_arguments: list) -> str:
        prompt = self.build_prompt(topic, context, round_num, mode, other_arguments)
        
        # Make async API call to your model
        # Return the generated text
        argument = "Generated text from MyModel"
        
        self.add_to_history(argument)
        return argument
\`\`\`

## Step 3: Register the Agent

Add your agent to the `get_agent` factory function in `agents.py`:

\`\`\`python
def get_agent(name: str) -> BaseAgent:
    agents = {
        ...
        "mymodel": MyModelAgent,
    }
    return agents[name]()
\`\`\`

## Step 4: Update the Web UI

In `web/assets/js/constants.js`, add your agent to `AGENT_META` so it renders correctly in the Arena:

\`\`\`javascript
export const AGENT_META = {
  ...
  mymodel: { initials: "MM", name: "My Model", cls: "mymodel", color: "#123456" },
};
\`\`\`

Update `web/assets/css/arena.css` to add the color class if you want custom styling for the chat bubbles.