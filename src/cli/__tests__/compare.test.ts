import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildCompareResult, getBiggestGap, toCompareJSON, toCompareMarkdown } from '../compare.js'
import type { ToolscoreResult } from '../../types/index.js'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeResult(
  model: string,
  scores: Record<string, { score: number; pass: number; total: number }>,
  overallScore: number
): ToolscoreResult {
  const dimensions: ToolscoreResult['dimensions'] = {} as ToolscoreResult['dimensions']
  for (const [dim, d] of Object.entries(scores)) {
    dimensions[dim as keyof typeof dimensions] = {
      score: d.score,
      pass: d.pass,
      total: d.total,
      weight: 1,
    }
  }

  const passed = Object.values(scores).reduce((s, d) => s + d.pass, 0)
  const total = Object.values(scores).reduce((s, d) => s + d.total, 0)

  return {
    runId: `run_${model}`,
    model,
    modelResolved: model,
    endpoint: model.startsWith('openai/') ? 'OpenAI' : 'Ollama',
    timestamp: new Date().toISOString(),
    durationMs: 1000,
    score: overallScore,
    grade: overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'F',
    dimensions,
    cases: [],
    stats: { total, passed, failed: total - passed, errors: 0 },
  }
}

const resultA = makeResult('ollama/llama3.1:8b', {
  selection: { score: 90, pass: 9, total: 10 },
  args: { score: 70, pass: 7, total: 10 },
  parallel: { score: 80, pass: 4, total: 5 },
  refusal: { score: 75, pass: 6, total: 8 },
  recovery: { score: 38, pass: 3, total: 8 },
}, 71)

const resultB = makeResult('openai/gpt-4o-mini', {
  selection: { score: 100, pass: 10, total: 10 },
  args: { score: 90, pass: 9, total: 10 },
  parallel: { score: 100, pass: 5, total: 5 },
  refusal: { score: 100, pass: 8, total: 8 },
  recovery: { score: 88, pass: 7, total: 8 },
}, 95)

// Tie results
const resultTieA = makeResult('openai/gpt-4o', {
  selection: { score: 90, pass: 9, total: 10 },
  args: { score: 90, pass: 9, total: 10 },
}, 90)

const resultTieB = makeResult('openai/gpt-4o-mini', {
  selection: { score: 90, pass: 9, total: 10 },
  args: { score: 90, pass: 9, total: 10 },
}, 90)

// A wins results
const resultAWins = makeResult('openai/gpt-4o', {
  selection: { score: 100, pass: 10, total: 10 },
  args: { score: 95, pass: 19, total: 20 },
}, 98)

const resultBLoses = makeResult('openai/gpt-4o-mini', {
  selection: { score: 70, pass: 7, total: 10 },
  args: { score: 60, pass: 12, total: 20 },
}, 65)

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('buildCompareResult', () => {
  it('detects modelB as winner', () => {
    const result = buildCompareResult(resultA, resultB)
    expect(result.winner).toBe('modelB')
  })

  it('detects modelA as winner', () => {
    const result = buildCompareResult(resultAWins, resultBLoses)
    expect(result.winner).toBe('modelA')
  })

  it('detects tie', () => {
    const result = buildCompareResult(resultTieA, resultTieB)
    expect(result.winner).toBe('tie')
    expect(result.totalDiff).toBe(0)
  })

  it('calculates correct totalDiff', () => {
    const result = buildCompareResult(resultA, resultB)
    expect(result.totalDiff).toBe(24) // 95 - 71
  })

  it('counts dimension wins for modelB', () => {
    const result = buildCompareResult(resultA, resultB)
    expect(result.dimensionWins.modelB).toBe(5)
    expect(result.dimensionWins.modelA).toBe(0)
  })

  it('counts dimension wins for modelA', () => {
    const result = buildCompareResult(resultAWins, resultBLoses)
    expect(result.dimensionWins.modelA).toBe(2)
    expect(result.dimensionWins.modelB).toBe(0)
  })

  it('counts tie dimensions as 0 wins', () => {
    const result = buildCompareResult(resultTieA, resultTieB)
    expect(result.dimensionWins.modelA).toBe(0)
    expect(result.dimensionWins.modelB).toBe(0)
  })

  it('includes full model results', () => {
    const result = buildCompareResult(resultA, resultB)
    expect(result.modelA.model).toBe('ollama/llama3.1:8b')
    expect(result.modelB.model).toBe('openai/gpt-4o-mini')
  })
})

describe('getBiggestGap', () => {
  it('returns the dimension with the largest score gap', () => {
    const gap = getBiggestGap(resultA, resultB)
    expect(gap).not.toBeNull()
    // recovery: |38 - 88| = 50
    expect(gap!.dim).toBe('recovery')
    expect(gap!.gap).toBe(50)
  })

  it('returns null when no dimensions have data', () => {
    const emptyA = makeResult('a', {}, 0)
    const emptyB = makeResult('b', {}, 0)
    expect(getBiggestGap(emptyA, emptyB)).toBeNull()
  })
})

describe('toCompareJSON', () => {
  it('produces valid JSON with required fields', () => {
    const compareResult = buildCompareResult(resultA, resultB)
    const json = toCompareJSON(compareResult)
    const parsed = JSON.parse(json)

    expect(parsed).toHaveProperty('modelA')
    expect(parsed).toHaveProperty('modelB')
    expect(parsed).toHaveProperty('winner')
    expect(parsed).toHaveProperty('totalDiff')
    expect(parsed).toHaveProperty('dimensionWins')
    expect(parsed.winner).toBe('modelB')
    expect(parsed.totalDiff).toBe(24)
    expect(parsed.dimensionWins.modelA).toBe(0)
    expect(parsed.dimensionWins.modelB).toBe(5)
  })

  it('includes full ToolscoreResult in modelA and modelB', () => {
    const compareResult = buildCompareResult(resultA, resultB)
    const json = toCompareJSON(compareResult)
    const parsed = JSON.parse(json)

    expect(parsed.modelA.model).toBe('ollama/llama3.1:8b')
    expect(parsed.modelB.model).toBe('openai/gpt-4o-mini')
    expect(parsed.modelA).toHaveProperty('dimensions')
    expect(parsed.modelA).toHaveProperty('score')
    expect(parsed.modelB).toHaveProperty('score')
  })
})

describe('toCompareMarkdown', () => {
  it('produces a markdown table with both models', () => {
    const compareResult = buildCompareResult(resultA, resultB)
    const md = toCompareMarkdown(compareResult)

    expect(md).toContain('# toolscore compare')
    expect(md).toContain('llama3.1:8b')
    expect(md).toContain('gpt-4o-mini')
  })

  it('includes all dimensions', () => {
    const compareResult = buildCompareResult(resultA, resultB)
    const md = toCompareMarkdown(compareResult)

    expect(md).toContain('| selection')
    expect(md).toContain('| args')
    expect(md).toContain('| parallel')
    expect(md).toContain('| refusal')
    expect(md).toContain('| recovery')
  })

  it('marks winner with ★', () => {
    const compareResult = buildCompareResult(resultA, resultB)
    const md = toCompareMarkdown(compareResult)
    expect(md).toContain('★')
  })

  it('shows winner summary', () => {
    const compareResult = buildCompareResult(resultA, resultB)
    const md = toCompareMarkdown(compareResult)
    expect(md).toContain('**Winner:**')
    expect(md).toContain('gpt-4o-mini')
    expect(md).toContain('+24 points')
  })

  it('shows biggest gap', () => {
    const compareResult = buildCompareResult(resultA, resultB)
    const md = toCompareMarkdown(compareResult)
    expect(md).toContain('**Biggest gap:**')
    expect(md).toContain('recovery')
  })

  it('handles tie correctly', () => {
    const compareResult = buildCompareResult(resultTieA, resultTieB)
    const md = toCompareMarkdown(compareResult)
    expect(md).not.toContain('**Winner:**')
    expect(md).toContain('**Result:** Tie')
  })

  it('includes TOTAL row', () => {
    const compareResult = buildCompareResult(resultA, resultB)
    const md = toCompareMarkdown(compareResult)
    expect(md).toContain('**TOTAL**')
  })
})
