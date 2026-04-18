import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Override home dir for tests
const TEST_HOME = path.join(os.tmpdir(), `toolscore-test-${Date.now()}`)
process.env.HOME = TEST_HOME
process.env.USERPROFILE = TEST_HOME // Windows

// Import AFTER env override
const { saveRun, getHistory, clearHistory, dbPath } = await import('../history.js')

function makeResult(overrides: Record<string, unknown> = {}) {
  return {
    runId: `run_test_${Math.random().toString(36).slice(2)}`,
    model: 'ollama/llama3.1:8b',
    modelResolved: 'llama3.1:8b',
    endpoint: 'http://localhost:11434/v1',
    timestamp: new Date().toISOString(),
    durationMs: 1234,
    score: 75.5,
    grade: 'B' as const,
    dimensions: {} as never,
    cases: [],
    stats: { total: 50, passed: 38, failed: 12, errors: 0 },
    ...overrides,
  }
}

describe('history', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(TEST_HOME, '.toolscore'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true })
    process.env.HOME = os.homedir()
  })

  it('returns empty array when no DB exists', () => {
    expect(getHistory()).toEqual([])
  })

  it('saves a run and retrieves it', () => {
    const r = makeResult()
    saveRun(r)
    const rows = getHistory()
    expect(rows).toHaveLength(1)
    expect(rows[0].model).toBe(r.model)
    expect(rows[0].score).toBe(r.score)
    expect(rows[0].grade).toBe(r.grade)
  })

  it('returns runs ordered by timestamp desc', () => {
    const r1 = makeResult({ timestamp: '2026-01-01T00:00:00.000Z', score: 60 })
    const r2 = makeResult({ timestamp: '2026-01-02T00:00:00.000Z', score: 80 })
    saveRun(r1)
    saveRun(r2)
    const rows = getHistory()
    expect(rows[0].score).toBe(80)
    expect(rows[1].score).toBe(60)
  })

  it('filters by model', () => {
    saveRun(makeResult({ model: 'ollama/llama3.1:8b' }))
    saveRun(makeResult({ model: 'openai/gpt-4o' }))
    const rows = getHistory({ model: 'openai/gpt-4o' })
    expect(rows).toHaveLength(1)
    expect(rows[0].model).toBe('openai/gpt-4o')
  })

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      saveRun(makeResult({ score: i * 10 }))
    }
    const rows = getHistory({ limit: 3 })
    expect(rows).toHaveLength(3)
  })

  it('clears history', () => {
    saveRun(makeResult())
    saveRun(makeResult())
    const deleted = clearHistory()
    expect(deleted).toBe(2)
    expect(getHistory()).toHaveLength(0)
  })

  it('handles upsert (same runId)', () => {
    const r = makeResult()
    saveRun(r)
    saveRun({ ...r, score: 99 })
    const rows = getHistory()
    expect(rows).toHaveLength(1)
    expect(rows[0].score).toBe(99)
  })

  it('dbPath returns path in home dir', () => {
    expect(dbPath()).toContain('.toolscore')
    expect(dbPath()).toContain('results.db')
  })
})
