<h1 align="center">toolscore</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/toolscore"><img src="https://img.shields.io/npm/v/toolscore.svg" alt="npm version"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License"></a>
</p>

<p align="center">
  Benchmark LLM tool-calling reliability in your terminal.
</p>

---

Not all models call tools the same way. `toolscore` runs 50 deterministic test cases across 5 dimensions — selection, arg accuracy, parallel calls, refusal, and recovery — and gives you a scored report. No vibes. No LLM-as-judge. Just pass/fail.

```bash
npx toolscore --model ollama/llama3.1:8b
```

## Quick Start

```bash
# Run against a local Ollama model
npx toolscore --model ollama/llama3.1:8b

# Run against OpenAI
OPENAI_API_KEY=sk-... npx toolscore --model openai/gpt-4o

# Run against OpenRouter
OPENROUTER_API_KEY=sk-or-... npx toolscore --model openrouter/anthropic/claude-3-haiku

# Preview what would run (no API calls)
npx toolscore --model openai/gpt-4o --dry-run

# Run only one dimension
npx toolscore --model ollama/llama3.1:8b --dimension parallel
```

## What It Tests

50 test cases across 5 dimensions:

| Dimension | Cases | Weight | Tests |
|-----------|-------|--------|-------|
| **Selection** | 12 | 25% | Did it call the right function? |
| **Arg Accuracy** | 16 | 30% | Correct values and types? |
| **Parallel** | 8 | 20% | Called both tools when needed? |
| **Refusal** | 6 | 10% | Correctly did NOT call a tool? |
| **Recovery** | 8 | 15% | Retried correctly after tool error? |

Every test case has a deterministic correct answer. No LLM evaluator involved.

## Score Output

```
  toolscore v0.1.0  •  llama3.1:8b @ localhost:11434

  Overall Score    74 / 100  ████████░░░░░░░░░░░░  [C]

  Selection         92%  ██████████████████░░  (11/12)
  Arg Accuracy      81%  ████████████████░░░░  (13/16)
  Parallel          60%  ████████████░░░░░░░░  (5/8)
  Refusal           83%  ████████████████░░░░  (5/6)
  Recovery          63%  ████████████░░░░░░░░  (5/8)

  Ran 50 cases in 1m 43s

  Badge: ![toolscore: 74](https://img.shields.io/badge/toolscore-74%2F100-yellow)
  Results: https://github.com/bobhns/toolscore#community-results
```

## Grades

| Score | Grade | Meaning |
|-------|-------|---------|
| 90–100 | **A** | Production ready |
| 75–89 | **B** | Good, minor issues |
| 60–74 | **C** | Usable with care |
| 45–59 | **D** | Significant gaps |
| 0–44 | **F** | Not reliable |

## Supported Models

Works with any OpenAI-compatible API endpoint.

**Local (via Ollama):**
```bash
toolscore --model ollama/llama3.1:8b
toolscore --model ollama/qwen2.5:7b
toolscore --model ollama/mistral-nemo
```

**Cloud:**
```bash
toolscore --model openai/gpt-4o
toolscore --model openai/gpt-4o-mini
toolscore --model openrouter/anthropic/claude-3-5-haiku
toolscore --model groq/llama-3.1-70b-versatile
```

**Custom endpoint:**
```bash
toolscore --model my-model --base-url http://localhost:8080/v1 --api-key mykey
```

## CLI Options

```
Options:
  -m, --model <model>        Model to benchmark (provider/model-name)
  -k, --api-key <key>        API key (overrides env var)
  -b, --base-url <url>       Custom API base URL
  -d, --dimension <dim>      Run one dimension only
  -n, --cases <number>       Number of test cases (default: all)
  -t, --timeout <seconds>    Timeout per case (default: 30)
  -c, --concurrency <number> Concurrent requests (default: 3)
  -f, --format <format>      Output: terminal, json, markdown, badge
  -o, --output <file>        Save results to file
  --dry-run                  Show what would run, no API calls
  --list-cases               Show test case counts per dimension
  --verbose                  Show per-case results
  --fail-below <score>       Exit 1 if score below threshold (for CI)
  -V, --version              Output version number
  -h, --help                 Show help
```

## CI Integration

```yaml
# .github/workflows/ci.yml
- name: Benchmark tool calling
  run: npx toolscore --model openai/gpt-4o --fail-below 80 --format json --output toolscore.json
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Programmatic Usage

```ts
import { runBenchmark } from 'toolscore'

const result = await runBenchmark({ 
  model: 'ollama/llama3.1:8b',
  concurrency: 3,
  timeout: 30,
})

console.log(result.score)  // 74
console.log(result.grade)  // 'C'
console.log(result.dimensions.parallel.score)  // 60
```

## Install

```bash
# No install needed (recommended)
npx toolscore --model ollama/llama3.1:8b

# Global install
npm install -g toolscore
```

Requires Node.js 18+.

## Why toolscore vs BFCL

[BFCL](https://gorilla.cs.berkeley.edu/leaderboard.html) is the academic standard. toolscore is for developers who need an answer in 2 minutes, not 2 hours:

| | BFCL | toolscore |
|--|------|-----------|
| Time to first result | 2–4 hours | < 2 minutes |
| Any OpenAI-compat endpoint | Limited | ✓ |
| No GPU required | ✗ (local models) | ✓ |
| npm install | ✗ | ✓ |
| CI integration | ✗ | ✓ |
| Recovery testing | ✗ | ✓ |

## Community Results

| Model | Score | Selection | Args | Parallel | Refusal | Recovery | Version |
|-------|-------|-----------|------|----------|---------|----------|---------|
| *Submit yours via PR* | — | — | — | — | — | — | — |

**Add your result:**
1. Run `npx toolscore --model <your-model> --format table-row`
2. Copy the table row from the output
3. Open a PR adding your row

The `--format table-row` output also generates a badge you can embed in your model's README.

## License

MIT
