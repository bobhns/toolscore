import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { ToolscoreResult } from '../types/index.js'

const DB_DIR = path.join(os.homedir(), '.toolscore')
const DB_PATH = path.join(DB_DIR, 'results.db')

function getDb(): InstanceType<typeof Database> {
  fs.mkdirSync(DB_DIR, { recursive: true })
  const db = new Database(DB_PATH)

  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id        TEXT PRIMARY KEY,
      model     TEXT NOT NULL,
      endpoint  TEXT NOT NULL,
      score     REAL NOT NULL,
      grade     TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      result_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_runs_model ON runs (model);
    CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs (timestamp);
  `)

  return db
}

export function saveRun(result: ToolscoreResult): void {
  const db = getDb()
  try {
    db.prepare(`
      INSERT OR REPLACE INTO runs
        (id, model, endpoint, score, grade, timestamp, duration_ms, result_json)
      VALUES
        (@id, @model, @endpoint, @score, @grade, @timestamp, @duration_ms, @result_json)
    `).run({
      id: result.runId,
      model: result.model,
      endpoint: result.endpoint,
      score: result.score,
      grade: result.grade,
      timestamp: result.timestamp,
      duration_ms: result.durationMs,
      result_json: JSON.stringify(result),
    })
  } finally {
    db.close()
  }
}

export interface HistoryRow {
  id: string
  model: string
  endpoint: string
  score: number
  grade: string
  timestamp: string
  durationMs: number
}

export interface HistoryOptions {
  model?: string
  limit?: number
  json?: boolean
}

export function getHistory(options: HistoryOptions = {}): HistoryRow[] {
  if (!fs.existsSync(DB_PATH)) return []

  const db = getDb()
  try {
    let query = `
      SELECT id, model, endpoint, score, grade, timestamp, duration_ms
      FROM runs
    `
    const params: unknown[] = []

    if (options.model) {
      query += ` WHERE model = ?`
      params.push(options.model)
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`
    params.push(options.limit ?? 10)

    const rows = db.prepare(query).all(...params) as Array<{
      id: string
      model: string
      endpoint: string
      score: number
      grade: string
      timestamp: string
      duration_ms: number
    }>

    return rows.map(r => ({
      id: r.id,
      model: r.model,
      endpoint: r.endpoint,
      score: r.score,
      grade: r.grade,
      timestamp: r.timestamp,
      durationMs: r.duration_ms,
    }))
  } finally {
    db.close()
  }
}

export function clearHistory(): number {
  if (!fs.existsSync(DB_PATH)) return 0
  const db = getDb()
  try {
    const result = db.prepare('DELETE FROM runs').run()
    return result.changes
  } finally {
    db.close()
  }
}

export function dbPath(): string {
  return DB_PATH
}
