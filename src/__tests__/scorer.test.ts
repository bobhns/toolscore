import { describe, it, expect } from 'vitest'
import { computeScore, scoreToGrade } from '../core/scorer.js'
import type { CaseResult, Dimension } from '../types/index.js'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeResult(dimension: Dimension, pass: boolean, score: number, id = 'test'): CaseResult {
  return {
    id,
    dimension,
    pass,
    score,
    durationMs: 100,
    actual: { toolCalls: null, content: null },
    expected: { calls: [] },
  }
}

const METADATA = {
  runId: 'run_test',
  model: 'ollama/llama3.1:8b',
  modelResolved: 'llama3.1:8b',
  endpoint: 'http://localhost:11434',
  timestamp: new Date().toISOString(),
  durationMs: 5000,
}

// ────────────────────────────────────────────────────────────────────────────
// scoreToGrade
// ────────────────────────────────────────────────────────────────────────────

describe('scoreToGrade', () => {
  it('returns A for 90+', () => expect(scoreToGrade(90)).toBe('A'))
  it('returns A for 100', () => expect(scoreToGrade(100)).toBe('A'))
  it('returns B for 75', () => expect(scoreToGrade(75)).toBe('B'))
  it('returns B for 89', () => expect(scoreToGrade(89)).toBe('B'))
  it('returns C for 60', () => expect(scoreToGrade(60)).toBe('C'))
  it('returns C for 74', () => expect(scoreToGrade(74)).toBe('C'))
  it('returns D for 45', () => expect(scoreToGrade(45)).toBe('D'))
  it('returns D for 59', () => expect(scoreToGrade(59)).toBe('D'))
  it('returns F for 44', () => expect(scoreToGrade(44)).toBe('F'))
  it('returns F for 0', () => expect(scoreToGrade(0)).toBe('F'))
})

// ────────────────────────────────────────────────────────────────────────────
// computeScore — basic
// ────────────────────────────────────────────────────────────────────────────

describe('computeScore — basic', () => {
  it('returns 0 for all-fail results', () => {
    const cases: CaseResult[] = [
      makeResult('selection', false, 0, 'sel_1'),
      makeResult('selection', false, 0, 'sel_2'),
    ]
    const result = computeScore(cases, METADATA)
    expect(result.score).toBe(0)
    expect(result.grade).toBe('F')
  })

  it('returns 100 for all-pass results across all dimensions', () => {
    const cases: CaseResult[] = [
      makeResult('selection', true, 100, 'sel_1'),
      makeResult('args', true, 100, 'arg_1'),
      makeResult('parallel', true, 100, 'par_1'),
      makeResult('refusal', true, 100, 'ref_1'),
      makeResult('recovery', true, 100, 'rec_1'),
    ]
    const result = computeScore(cases, METADATA)
    expect(result.score).toBe(100)
    expect(result.grade).toBe('A')
  })

  it('carries through metadata', () => {
    const result = computeScore([], METADATA)
    expect(result.runId).toBe('run_test')
    expect(result.model).toBe('ollama/llama3.1:8b')
    expect(result.endpoint).toBe('http://localhost:11434')
  })

  it('returns correct stats', () => {
    const cases: CaseResult[] = [
      makeResult('selection', true, 100, 'sel_1'),
      makeResult('selection', false, 0, 'sel_2'),
      makeResult('selection', false, 0, 'sel_3'),
    ]
    // Simulate one as error
    cases[2].actual.error = 'API timeout'

    const result = computeScore(cases, METADATA)
    expect(result.stats.total).toBe(3)
    expect(result.stats.passed).toBe(1)
    expect(result.stats.failed).toBe(1) // failed but no error
    expect(result.stats.errors).toBe(1) // has .error field
  })
})

// ────────────────────────────────────────────────────────────────────────────
// computeScore — weighted scoring
// ────────────────────────────────────────────────────────────────────────────

describe('computeScore — weighted scoring', () => {
  // Weights: selection 25%, args 30%, parallel 20%, refusal 10%, recovery 15%

  it('scores 0% selection doesn\'t make overall 0 (other dims contribute)', () => {
    const cases: CaseResult[] = [
      makeResult('selection', false, 0, 'sel_1'),
      makeResult('args', true, 100, 'arg_1'),
      makeResult('parallel', true, 100, 'par_1'),
      makeResult('refusal', true, 100, 'ref_1'),
      makeResult('recovery', true, 100, 'rec_1'),
    ]
    const result = computeScore(cases, METADATA)
    // selection = 25% weight = 0. Rest = 75%. Overall ≈ 75.
    expect(result.score).toBe(75)
  })

  it('args dimension has 30% weight', () => {
    const cases: CaseResult[] = [
      makeResult('selection', true, 100, 'sel_1'),
      makeResult('args', false, 0, 'arg_1'),
      makeResult('parallel', true, 100, 'par_1'),
      makeResult('refusal', true, 100, 'ref_1'),
      makeResult('recovery', true, 100, 'rec_1'),
    ]
    const result = computeScore(cases, METADATA)
    // args = 30% weight = 0. Rest = 70%. Overall ≈ 70.
    expect(result.score).toBe(70)
  })

  it('handles partial scores within a dimension', () => {
    // 3 selection cases: 100, 100, 0 = 67% average
    const cases: CaseResult[] = [
      makeResult('selection', true, 100, 'sel_1'),
      makeResult('selection', true, 100, 'sel_2'),
      makeResult('selection', false, 0, 'sel_3'),
    ]
    const result = computeScore(cases, METADATA)
    expect(result.dimensions.selection.score).toBe(67)
  })

  it('normalizes score when only some dimensions present', () => {
    // Only selection cases — should normalize to selection's contribution
    const cases: CaseResult[] = [
      makeResult('selection', true, 100, 'sel_1'),
    ]
    const result = computeScore(cases, METADATA)
    // Only selection (25% weight), normalized: 100% * 1.0 = 100
    expect(result.score).toBe(100)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// computeScore — dimension breakdown
// ────────────────────────────────────────────────────────────────────────────

describe('computeScore — dimension breakdown', () => {
  it('provides per-dimension results', () => {
    const cases: CaseResult[] = [
      makeResult('selection', true, 100, 'sel_1'),
      makeResult('selection', false, 50, 'sel_2'),
      makeResult('args', true, 100, 'arg_1'),
    ]
    const result = computeScore(cases, METADATA)

    expect(result.dimensions.selection.total).toBe(2)
    expect(result.dimensions.selection.pass).toBe(1)
    expect(result.dimensions.selection.score).toBe(75) // (100+50)/2

    expect(result.dimensions.args.total).toBe(1)
    expect(result.dimensions.args.pass).toBe(1)
    expect(result.dimensions.args.score).toBe(100)
  })

  it('returns 0 for dimensions with no cases', () => {
    const cases: CaseResult[] = [makeResult('selection', true, 100, 'sel_1')]
    const result = computeScore(cases, METADATA)

    expect(result.dimensions.args.total).toBe(0)
    expect(result.dimensions.args.score).toBe(0)
    expect(result.dimensions.parallel.total).toBe(0)
  })

  it('includes weight for all dimensions', () => {
    const result = computeScore([], METADATA)
    expect(result.dimensions.selection.weight).toBe(0.25)
    expect(result.dimensions.args.weight).toBe(0.30)
    expect(result.dimensions.parallel.weight).toBe(0.20)
    expect(result.dimensions.refusal.weight).toBe(0.10)
    expect(result.dimensions.recovery.weight).toBe(0.15)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// computeScore — grade boundary cases
// ────────────────────────────────────────────────────────────────────────────

describe('computeScore — grade boundaries', () => {
  function scoreWith(dimScore: number): number {
    const cases = [makeResult('selection', dimScore >= 80, dimScore)]
    return computeScore(cases, METADATA).score
  }

  it('grade A at 90+', () => {
    const cases = [makeResult('selection', true, 95)]
    const result = computeScore(cases, METADATA)
    expect(result.grade).toBe('A')
  })

  it('grade B at 75–89', () => {
    const cases = [makeResult('selection', true, 80)]
    const result = computeScore(cases, METADATA)
    expect(result.grade).toBe('B')
  })

  it('grade C at 60–74', () => {
    const cases = [makeResult('selection', false, 65)]
    const result = computeScore(cases, METADATA)
    expect(result.grade).toBe('C')
  })

  it('grade F at 0', () => {
    const result = computeScore([], METADATA)
    expect(result.score).toBe(0)
    expect(result.grade).toBe('F')
  })
})
