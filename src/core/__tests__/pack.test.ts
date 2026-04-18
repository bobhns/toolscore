import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validatePack, loadPack, packCasesToTestCases } from '../pack.js'
import type { Pack } from '../pack.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const validTool = {
  name: 'create_event',
  description: 'Create a calendar event',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      datetime: { type: 'string' },
    },
    required: ['title', 'datetime'],
  },
}

const validCase = {
  id: 'cal_001',
  dimension: 'selection',
  prompt: 'Schedule a meeting next Tuesday at 3pm',
  tools: [validTool],
  expected: {
    calls: [{ name: 'create_event' }],
  },
}

const validPack = {
  version: '1',
  name: 'calendar-tools',
  cases: [validCase],
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolscore-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writePack(name: string, content: string): string {
  const filePath = path.join(tmpDir, name)
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
}

// ────────────────────────────────────────────────────────────────────────────
// validatePack — valid pack
// ────────────────────────────────────────────────────────────────────────────

describe('validatePack', () => {
  it('accepts a valid pack', () => {
    const result = validatePack(validPack)
    expect(result.version).toBe('1')
    expect(result.name).toBe('calendar-tools')
    expect(result.cases).toHaveLength(1)
    expect(result.cases[0].id).toBe('cal_001')
  })

  it('accepts all valid dimensions', () => {
    const dims = ['selection', 'args', 'parallel', 'refusal', 'recovery']
    for (const dim of dims) {
      const pack = {
        ...validPack,
        cases: [{ ...validCase, id: `case_${dim}`, dimension: dim }],
      }
      const result = validatePack(pack)
      expect(result.cases[0].dimension).toBe(dim)
    }
  })

  it('accepts empty cases array', () => {
    const pack = { ...validPack, cases: [] }
    const result = validatePack(pack)
    expect(result.cases).toHaveLength(0)
  })

  it('accepts a case with noCall expected', () => {
    const pack = {
      ...validPack,
      cases: [{ ...validCase, expected: { noCall: true } }],
    }
    const result = validatePack(pack)
    expect(result.cases[0].expected).toEqual({ noCall: true })
  })

  it('accepts optional fields: system, difficulty, tags', () => {
    const pack = {
      ...validPack,
      cases: [{
        ...validCase,
        system: 'You are a calendar assistant',
        difficulty: 'easy',
        tags: ['calendar', 'scheduling'],
      }],
    }
    const result = validatePack(pack)
    expect(result.cases[0].system).toBe('You are a calendar assistant')
    expect(result.cases[0].difficulty).toBe('easy')
    expect(result.cases[0].tags).toEqual(['calendar', 'scheduling'])
  })

  // ────────────────────────────────────────────────────────────────────────
  // Missing top-level fields
  // ────────────────────────────────────────────────────────────────────────

  it('throws when version is missing', () => {
    const { version: _v, ...pack } = validPack
    expect(() => validatePack(pack)).toThrow(/"version"/)
  })

  it('throws when name is missing', () => {
    const { name: _n, ...pack } = validPack
    expect(() => validatePack(pack)).toThrow(/"name"/)
  })

  it('throws when cases is missing', () => {
    const { cases: _c, ...pack } = validPack
    expect(() => validatePack(pack)).toThrow(/"cases"/)
  })

  it('throws when the root is not an object', () => {
    expect(() => validatePack('not an object')).toThrow(/JSON object/)
    expect(() => validatePack(null)).toThrow(/JSON object/)
    expect(() => validatePack([validPack])).toThrow(/JSON object/)
  })

  // ────────────────────────────────────────────────────────────────────────
  // Invalid dimension
  // ────────────────────────────────────────────────────────────────────────

  it('throws on invalid dimension value', () => {
    const pack = {
      ...validPack,
      cases: [{ ...validCase, dimension: 'unknown_dim' }],
    }
    expect(() => validatePack(pack)).toThrow(/invalid dimension/)
  })

  it('error message for invalid dimension lists valid options', () => {
    const pack = {
      ...validPack,
      cases: [{ ...validCase, dimension: 'bad' }],
    }
    try {
      validatePack(pack)
      expect.fail('should have thrown')
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('selection')
      expect(msg).toContain('args')
      expect(msg).toContain('parallel')
      expect(msg).toContain('refusal')
      expect(msg).toContain('recovery')
    }
  })

  // ────────────────────────────────────────────────────────────────────────
  // Missing case fields
  // ────────────────────────────────────────────────────────────────────────

  it('throws when case is missing id', () => {
    const { id: _id, ...caseNoId } = validCase
    expect(() => validatePack({ ...validPack, cases: [caseNoId] })).toThrow(/"id"/)
  })

  it('throws when case is missing prompt', () => {
    const { prompt: _p, ...caseNoPrompt } = validCase
    expect(() => validatePack({ ...validPack, cases: [caseNoPrompt] })).toThrow(/"prompt"/)
  })

  it('throws when case is missing tools', () => {
    const { tools: _t, ...caseNoTools } = validCase
    expect(() => validatePack({ ...validPack, cases: [caseNoTools] })).toThrow(/"tools"/)
  })

  it('throws when case tools array is empty', () => {
    const pack = { ...validPack, cases: [{ ...validCase, tools: [] }] }
    expect(() => validatePack(pack)).toThrow(/empty/)
  })

  it('throws when case expected is missing', () => {
    const { expected: _e, ...caseNoExpected } = validCase
    expect(() => validatePack({ ...validPack, cases: [caseNoExpected] })).toThrow(/"expected"/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// loadPack
// ────────────────────────────────────────────────────────────────────────────

describe('loadPack', () => {
  it('loads a valid pack JSON file', () => {
    const filePath = writePack('valid.json', JSON.stringify(validPack, null, 2))
    const result = loadPack(filePath)
    expect(result.name).toBe('calendar-tools')
    expect(result.cases).toHaveLength(1)
  })

  it('throws when file does not exist', () => {
    expect(() => loadPack(path.join(tmpDir, 'nonexistent.json'))).toThrow(/not found/)
  })

  it('throws on invalid JSON', () => {
    const filePath = writePack('bad.json', '{ "version": "1", bad json }')
    expect(() => loadPack(filePath)).toThrow(/Invalid JSON/)
  })

  it('throws with helpful error for invalid pack structure', () => {
    const filePath = writePack('missing-name.json', JSON.stringify({ version: '1', cases: [] }))
    expect(() => loadPack(filePath)).toThrow(/Invalid pack file/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// packCasesToTestCases — dimension filtering
// ────────────────────────────────────────────────────────────────────────────

describe('packCasesToTestCases', () => {
  const multiDimPack: Pack = {
    version: '1',
    name: 'multi-dim',
    cases: [
      { ...validCase, id: 'sel_001', dimension: 'selection' },
      { ...validCase, id: 'args_001', dimension: 'args' },
      { ...validCase, id: 'par_001', dimension: 'parallel' },
      { ...validCase, id: 'ref_001', dimension: 'refusal' },
      { ...validCase, id: 'rec_001', dimension: 'recovery' },
    ],
  }

  it('returns all cases when no dimensions filter', () => {
    const testCases = packCasesToTestCases(multiDimPack)
    expect(testCases).toHaveLength(5)
  })

  it('filters to a single dimension', () => {
    const testCases = packCasesToTestCases(multiDimPack, ['selection'])
    expect(testCases).toHaveLength(1)
    expect(testCases[0].id).toBe('sel_001')
  })

  it('filters to multiple dimensions', () => {
    const testCases = packCasesToTestCases(multiDimPack, ['args', 'parallel'])
    expect(testCases).toHaveLength(2)
    const ids = testCases.map(c => c.id)
    expect(ids).toContain('args_001')
    expect(ids).toContain('par_001')
  })

  it('returns empty array when no cases match the dimension filter', () => {
    const singleDimPack: Pack = {
      version: '1',
      name: 'single',
      cases: [{ ...validCase, dimension: 'selection' }],
    }
    const testCases = packCasesToTestCases(singleDimPack, ['refusal'])
    expect(testCases).toHaveLength(0)
  })

  it('converts pack tools to TestCase tool format with type:function wrapper', () => {
    const testCases = packCasesToTestCases({ ...validPack, cases: [validCase] })
    expect(testCases[0].tools[0]).toHaveProperty('type', 'function')
    expect(testCases[0].tools[0]).toHaveProperty('function')
    expect((testCases[0].tools[0] as any).function.name).toBe('create_event')
  })

  it('converts expected calls with argsMatchMode subset default', () => {
    const testCases = packCasesToTestCases(validPack)
    const expected = testCases[0].expected as { calls: any[] }
    expect(expected.calls[0].argsMatchMode).toBe('subset')
  })

  it('preserves noCall expected cases', () => {
    const pack: Pack = {
      version: '1',
      name: 'noCall-test',
      cases: [{ ...validCase, expected: { noCall: true } }],
    }
    const testCases = packCasesToTestCases(pack)
    expect(testCases[0].expected).toEqual({ noCall: true })
  })

  it('handles empty cases array', () => {
    const emptyPack: Pack = { version: '1', name: 'empty', cases: [] }
    const testCases = packCasesToTestCases(emptyPack)
    expect(testCases).toHaveLength(0)
  })
})
