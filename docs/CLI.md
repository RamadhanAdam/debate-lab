# CLI Reference

The command-line runner is useful for debugging the debate engine without the browser UI.

It is also the quickest way to validate provider credentials and make sure the core orchestration still works after a code change.

## Basic Usage

```bash
python3 -u debate.py --no-human
```

## Flags

- `--topic`: custom topic or prompt
- `--mode`: one of `review`, `debate`, `business`, `creative`, or `technical`
- `--no-human`: disable the human turn
- `--agents`: comma-separated agents
- `--rounds`: number of rounds

Depending on the local build, the engine may also accept `--no-human` to skip the human turn during smoke tests.

## Examples

One fast provider:

```bash
python3 -u debate.py --rounds 1 --agents groq --no-human
```

Two providers:

```bash
python3 -u debate.py --rounds 2 --agents gpt,groq --no-human
```

Custom topic:

```bash
python3 -u debate.py --mode debate --topic "Should AI debate before acting?" --rounds 3
```

## What The CLI Produces

The CLI prints:

- the loaded input context
- per-round arguments
- scoring updates
- warnings when a provider fails
- the path to the saved markdown artifact

## Good smoke test sequence

```bash
python3 -m pip install -r requirements.txt
python3 -u debate.py --rounds 1 --agents groq --no-human
python3 -u debate.py --rounds 1 --agents gpt,groq --no-human
```

## When To Use It

Use the CLI when you want to:

- confirm dependencies are installed
- debug provider auth
- smoke test one agent at a time
- verify report generation without the browser
