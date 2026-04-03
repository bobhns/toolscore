# toolscore Design Philosophy

## What toolscore IS

A CLI that benchmarks LLM tool-calling reliability against any OpenAI-compatible endpoint. Fast, deterministic, developer-facing.

**The core promise:** `npx toolscore --model ollama/llama3.1:8b` → meaningful result in < 2 minutes.

---

## What toolscore IS NOT

### Not a judge model

toolscore uses **deterministic scoring only**. No LLM evaluates responses. Scores are computed by code, not by asking another AI if the answer was "good enough."

This is the fundamental design constraint. It means:
- Results are reproducible across runs
- Scores can't be gamed by prompt engineering around an evaluator
- CI integration is trustworthy (no nondeterminism)

### Not a replacement for BFCL

[Berkeley Function Calling Leaderboard](https://gorilla.cs.berkeley.edu/) is the academic gold standard. We don't compete — we complement.

BFCL is for researchers and model builders running exhaustive evaluations.  
toolscore is for app developers asking "is this endpoint reliable enough for my agent?"

### Not a general LLM benchmark

We test exactly one thing: tool calling. Reasoning, coding, math, creativity — not our job. A model can be brilliant at everything else and still fail at tool calling in ways that break production agents.

### Not opinionated about which model is "best"

We report scores. We don't make recommendations. A model scoring 60% on parallel calls might be perfectly fine if your agent never needs parallel execution.

---

## Design Decisions

### JSON test cases, not YAML or JS objects

- Zero parsing ambiguity
- Copy-paste compatible with OpenAI tool schemas
- Serializable = diffable, shareable, version-controllable

### 5 dimensions, not one accuracy number

A single accuracy score hides too much information. A model that scores 95% on selection but 20% on parallel calls behaves very differently from one that scores 75% across the board. The dimension breakdown tells you *which* failure modes to expect.

### Partial credit for args

Arg accuracy uses partial credit rather than binary pass/fail. A model that gets 3/4 args correct is meaningfully better than one that gets 0/4 correct. This is especially important for comparing similar models.

### Fail open on API errors

If an API call fails (timeout, 429, 500), mark it as `error: true` and exclude it from scoring rather than counting it as a failure. Network blips shouldn't tank a model's score.

### Concurrency: default 3

Local models (Ollama) can't handle high concurrency well. Default to 3 concurrent requests, let users tune up/down. Don't burn your endpoint by defaulting to 10.

### Recovery is unique to toolscore

The recovery dimension — testing whether a model correctly retries after receiving a tool error response — is not measured by BFCL or other mainstream benchmarks. It's critical for production agents where tool calls regularly fail with transient errors.

---

## Versioning

Test cases are versioned. A model's score on `toolscore@0.1.0` is comparable to another model's score on `toolscore@0.1.0`. Test case changes increment the minor version.

**Never change test cases in a patch release.** This would break score comparability without warning.

---

## What Comes Next (v0.2+)

- `--baseline` flag: compare to a saved baseline to detect regressions
- `--pack ./my-tools.json`: benchmark with custom tool schemas
- `toolscore compare model-a model-b`: side-by-side output
- SQLite history: `toolscore history`
- Format sensitivity mode: same model, different tool injection patterns

These are intentionally post-v0.1. Shipping fast beats shipping everything.
