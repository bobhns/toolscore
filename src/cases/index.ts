import type { TestCase, Dimension } from '../types/index.js'
import { TestCaseSchema } from '../types/index.js'
import { z } from 'zod'

// Import JSON data directly so tsup bundles them inline
import selectionRaw from './selection.json' with { type: 'json' }
import argsRaw from './args.json' with { type: 'json' }
import parallelRaw from './parallel.json' with { type: 'json' }
import refusalRaw from './refusal.json' with { type: 'json' }
import recoveryRaw from './recovery.json' with { type: 'json' }

function parseCases(raw: unknown[], name: string): TestCase[] {
  const schema = z.array(TestCaseSchema)
  const result = schema.safeParse(raw)
  if (!result.success) {
    const errors = result.error.errors.map(e => `  [${e.path.join('.')}] ${e.message}`).join('\n')
    throw new Error(`Invalid test cases in ${name}:\n${errors}`)
  }
  return result.data
}

let _allCases: TestCase[] | null = null

export function getAllCases(): TestCase[] {
  if (_allCases) return _allCases

  _allCases = [
    ...parseCases(selectionRaw as unknown[], 'selection.json'),
    ...parseCases(argsRaw as unknown[], 'args.json'),
    ...parseCases(parallelRaw as unknown[], 'parallel.json'),
    ...parseCases(refusalRaw as unknown[], 'refusal.json'),
    ...parseCases(recoveryRaw as unknown[], 'recovery.json'),
  ]

  return _allCases
}

export function getCasesByDimension(dimension: Dimension): TestCase[] {
  return getAllCases().filter(c => c.dimension === dimension)
}

export function getCaseCounts(): Record<Dimension, number> {
  const cases = getAllCases()
  const dims: Dimension[] = ['selection', 'args', 'parallel', 'refusal', 'recovery']
  const result = {} as Record<Dimension, number>
  for (const dim of dims) {
    result[dim] = cases.filter(c => c.dimension === dim).length
  }
  return result
}

export function selectCases(
  count?: number,
  dimensions?: Dimension[]
): TestCase[] {
  let cases = getAllCases()

  if (dimensions && dimensions.length > 0) {
    cases = cases.filter(c => dimensions.includes(c.dimension as Dimension))
  }

  if (count && count < cases.length) {
    // Stratified sample by dimension
    const byDim = new Map<Dimension, TestCase[]>()
    for (const c of cases) {
      const d = c.dimension as Dimension
      if (!byDim.has(d)) byDim.set(d, [])
      byDim.get(d)!.push(c)
    }

    const selected: TestCase[] = []
    const perDim = Math.floor(count / byDim.size)
    for (const [, dimCases] of byDim) {
      const shuffled = [...dimCases].sort(() => Math.random() - 0.5)
      selected.push(...shuffled.slice(0, perDim))
    }

    return selected.slice(0, count)
  }

  return cases
}
