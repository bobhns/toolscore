import type { CaseResult, DimensionResult, ToolscoreResult, Dimension } from '../types/index.js'

const WEIGHTS: Record<Dimension, number> = {
  selection: 0.25,
  args: 0.30,
  parallel: 0.20,
  refusal: 0.10,
  recovery: 0.15,
}

const ALL_DIMENSIONS: Dimension[] = ['selection', 'args', 'parallel', 'refusal', 'recovery']

export function computeScore(
  caseResults: CaseResult[],
  metadata: {
    runId: string
    model: string
    modelResolved: string
    endpoint: string
    timestamp: string
    durationMs: number
  }
): ToolscoreResult {
  // Group results by dimension
  const byDimension = new Map<Dimension, CaseResult[]>()
  for (const dim of ALL_DIMENSIONS) {
    byDimension.set(dim, [])
  }

  for (const result of caseResults) {
    const list = byDimension.get(result.dimension)
    if (list) list.push(result)
  }

  // Compute per-dimension scores
  const dimensions = {} as Record<Dimension, DimensionResult>
  let weightedSum = 0
  let weightSum = 0

  for (const dim of ALL_DIMENSIONS) {
    const dimResults = byDimension.get(dim) ?? []
    const total = dimResults.length

    if (total === 0) {
      dimensions[dim] = {
        score: 0,
        pass: 0,
        total: 0,
        weight: WEIGHTS[dim],
      }
      continue
    }

    // Use actual scores (partial credit for args)
    const scoreSum = dimResults.reduce((sum, r) => sum + r.score, 0)
    const pass = dimResults.filter(r => r.pass).length
    const score = Math.round(scoreSum / total)

    dimensions[dim] = { score, pass, total, weight: WEIGHTS[dim] }

    weightedSum += (score / 100) * WEIGHTS[dim]
    weightSum += WEIGHTS[dim]
  }

  // Normalize if not all dimensions are present
  const finalScore = weightSum > 0
    ? Math.round((weightedSum / weightSum) * 100)
    : 0

  const grade = scoreToGrade(finalScore)

  const stats = {
    total: caseResults.length,
    passed: caseResults.filter(r => r.pass).length,
    failed: caseResults.filter(r => !r.pass && !r.actual.error).length,
    errors: caseResults.filter(r => !!r.actual.error).length,
  }

  return {
    ...metadata,
    score: finalScore,
    grade,
    dimensions,
    cases: caseResults,
    stats,
  }
}

export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 45) return 'D'
  return 'F'
}
