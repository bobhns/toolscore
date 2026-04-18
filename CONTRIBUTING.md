# Contributing to toolscore

## Adding Your Results to the Leaderboard

The community leaderboard in the README is maintained by the community — anyone can submit results.

### Steps

1. **Run toolscore against your model:**

   ```bash
   npx toolscore --model <provider/model-name>
   ```

   For local models via Ollama:
   ```bash
   npx toolscore --model ollama/llama3.1:8b
   ```

   For cloud models:
   ```bash
   npx toolscore --model openai/gpt-4o-mini
   ```

2. **Get your table row:**

   ```bash
   npx toolscore --model <your-model> --format table-row
   ```

   This outputs a copy-paste ready Markdown table row.

3. **Open a PR:**
   - Fork this repo
   - Add your row to the **Community Results** table in `README.md`
   - Submit a PR titled: `results: <model-name> — score X`

### Table Format

```
| Model | Score | Grade | Selection | Args | Parallel | Refusal | Recovery | Version |
```

- **Model** — model name with provider (e.g. `ollama/llama3.1:8b`, `openai/gpt-4o`)
- **Score** — overall score (0–100)
- **Grade** — A/B/C/D/F
- **Selection** — function selection accuracy score
- **Args** — argument accuracy score
- **Parallel** — parallel tool call score
- **Refusal** — appropriate refusal score
- **Recovery** — error recovery score
- **Version** — toolscore version used (run `npx toolscore --version`)

### Rules

- Run toolscore with default settings (no custom configs that change test cases)
- One row per model per hardware config — if results differ significantly across machines, note it in the PR
- Don't submit results for models you haven't actually run

### Reporting Issues

If you find a test case that seems wrong, or a model parsing issue, [open an issue](https://github.com/bobhns/toolscore/issues).

---

Made by [bobhns](https://github.com/bobhns). Built on [verdict](https://github.com/hnshah/verdict).
