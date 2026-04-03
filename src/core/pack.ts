import fs from 'fs'
import path from 'path'
import type { TestCase, Dimension } from '../types/index.js'

// ────────────────────────────────────────────────────────────────────────────
// Pack Interfaces
// ────────────────────────────────────────────────────────────────────────────

export interface PackToolParam {
  type: string
  description?: string
  enum?: string[]
  items?: unknown
  properties?: Record<string, PackToolParam>
  required?: string[]
}

export interface PackTool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, PackToolParam>
    required?: string[]
  }
}

export interface PackExpectedCall {
  name: string
  args?: Record<string, unknown>
}

export interface PackCase {
  id: string
  dimension: Dimension
  prompt: string
  tools: PackTool[]
  expected: {
    calls?: PackExpectedCall[]
    noCall?: boolean
  }
  system?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  tags?: string[]
}

export interface Pack {
  version: string
  name: string
  cases: PackCase[]
}

// ────────────────────────────────────────────────────────────────────────────
// Valid dimensions
// ────────────────────────────────────────────────────────────────────────────

const VALID_DIMENSIONS: Dimension[] = ['selection', 'args', 'parallel', 'refusal', 'recovery']

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

export function validatePack(data: unknown): Pack {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Pack must be a JSON object')
  }

  const obj = data as Record<string, unknown>

  // Validate version
  if (!('version' in obj)) {
    throw new Error('Pack is missing required field: "version"')
  }
  if (typeof obj.version !== 'string') {
    throw new Error(`Pack "version" must be a string, got: ${typeof obj.version}`)
  }

  // Validate name
  if (!('name' in obj)) {
    throw new Error('Pack is missing required field: "name"')
  }
  if (typeof obj.name !== 'string') {
    throw new Error(`Pack "name" must be a string, got: ${typeof obj.name}`)
  }
  if (obj.name.trim() === '') {
    throw new Error('Pack "name" must not be empty')
  }

  // Validate cases
  if (!('cases' in obj)) {
    throw new Error('Pack is missing required field: "cases"')
  }
  if (!Array.isArray(obj.cases)) {
    throw new Error(`Pack "cases" must be an array, got: ${typeof obj.cases}`)
  }

  const validatedCases: PackCase[] = obj.cases.map((c: unknown, index: number) => {
    return validateCase(c, index)
  })

  return {
    version: obj.version,
    name: obj.name,
    cases: validatedCases,
  }
}

function validateCase(data: unknown, index: number): PackCase {
  const prefix = `cases[${index}]`

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`${prefix}: must be an object`)
  }

  const c = data as Record<string, unknown>

  // id
  if (!('id' in c) || typeof c.id !== 'string' || c.id.trim() === '') {
    throw new Error(`${prefix}: missing or invalid "id" (must be a non-empty string)`)
  }

  // dimension
  if (!('dimension' in c)) {
    throw new Error(`${prefix} (id: "${c.id}"): missing required field "dimension"`)
  }
  if (!VALID_DIMENSIONS.includes(c.dimension as Dimension)) {
    throw new Error(
      `${prefix} (id: "${c.id}"): invalid dimension "${c.dimension}". ` +
      `Must be one of: ${VALID_DIMENSIONS.join(', ')}`
    )
  }

  // prompt
  if (!('prompt' in c) || typeof c.prompt !== 'string' || c.prompt.trim() === '') {
    throw new Error(`${prefix} (id: "${c.id}"): missing or invalid "prompt" (must be a non-empty string)`)
  }

  // tools
  if (!('tools' in c) || !Array.isArray(c.tools)) {
    throw new Error(`${prefix} (id: "${c.id}"): missing or invalid "tools" (must be an array)`)
  }
  if (c.tools.length === 0) {
    throw new Error(`${prefix} (id: "${c.id}"): "tools" array must not be empty`)
  }

  const validatedTools = c.tools.map((t: unknown, ti: number) => {
    return validateTool(t, `${prefix}.tools[${ti}]`, String(c.id))
  })

  // expected
  if (!('expected' in c) || typeof c.expected !== 'object' || c.expected === null) {
    throw new Error(`${prefix} (id: "${c.id}"): missing or invalid "expected" (must be an object)`)
  }

  const expected = c.expected as Record<string, unknown>

  if (!('calls' in expected) && !('noCall' in expected)) {
    throw new Error(`${prefix} (id: "${c.id}"): "expected" must have either "calls" or "noCall"`)
  }

  let validatedExpected: PackCase['expected']

  if ('noCall' in expected) {
    if (expected.noCall !== true) {
      throw new Error(`${prefix} (id: "${c.id}"): "expected.noCall" must be true`)
    }
    validatedExpected = { noCall: true }
  } else {
    if (!Array.isArray(expected.calls)) {
      throw new Error(`${prefix} (id: "${c.id}"): "expected.calls" must be an array`)
    }
    const validatedCalls = expected.calls.map((call: unknown, ci: number) => {
      return validateExpectedCall(call, `${prefix}.expected.calls[${ci}]`, String(c.id))
    })
    validatedExpected = { calls: validatedCalls }
  }

  // Optional fields
  const result: PackCase = {
    id: c.id as string,
    dimension: c.dimension as Dimension,
    prompt: c.prompt as string,
    tools: validatedTools,
    expected: validatedExpected,
  }

  if ('system' in c && c.system !== undefined) {
    if (typeof c.system !== 'string') {
      throw new Error(`${prefix} (id: "${c.id}"): "system" must be a string`)
    }
    result.system = c.system
  }

  if ('difficulty' in c && c.difficulty !== undefined) {
    if (!['easy', 'medium', 'hard'].includes(c.difficulty as string)) {
      throw new Error(`${prefix} (id: "${c.id}"): "difficulty" must be one of: easy, medium, hard`)
    }
    result.difficulty = c.difficulty as 'easy' | 'medium' | 'hard'
  }

  if ('tags' in c && c.tags !== undefined) {
    if (!Array.isArray(c.tags) || !c.tags.every((t: unknown) => typeof t === 'string')) {
      throw new Error(`${prefix} (id: "${c.id}"): "tags" must be an array of strings`)
    }
    result.tags = c.tags as string[]
  }

  return result
}

function validateTool(data: unknown, prefix: string, caseId: string): PackTool {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`${prefix} (case: "${caseId}"): tool must be an object`)
  }

  const t = data as Record<string, unknown>

  if (!('name' in t) || typeof t.name !== 'string' || t.name.trim() === '') {
    throw new Error(`${prefix} (case: "${caseId}"): tool missing or invalid "name"`)
  }

  if (!('description' in t) || typeof t.description !== 'string') {
    throw new Error(`${prefix} (case: "${caseId}"): tool "${t.name}" missing or invalid "description"`)
  }

  if (!('parameters' in t) || typeof t.parameters !== 'object' || t.parameters === null) {
    throw new Error(`${prefix} (case: "${caseId}"): tool "${t.name}" missing or invalid "parameters"`)
  }

  const params = t.parameters as Record<string, unknown>
  if (params.type !== 'object') {
    throw new Error(`${prefix} (case: "${caseId}"): tool "${t.name}" parameters.type must be "object"`)
  }

  if (!('properties' in params) || typeof params.properties !== 'object' || params.properties === null) {
    throw new Error(`${prefix} (case: "${caseId}"): tool "${t.name}" missing "parameters.properties"`)
  }

  return {
    name: t.name as string,
    description: t.description as string,
    parameters: {
      type: 'object',
      properties: params.properties as Record<string, PackToolParam>,
      required: Array.isArray(params.required) ? params.required as string[] : undefined,
    },
  }
}

function validateExpectedCall(data: unknown, prefix: string, caseId: string): PackExpectedCall {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`${prefix} (case: "${caseId}"): expected call must be an object`)
  }

  const call = data as Record<string, unknown>

  if (!('name' in call) || typeof call.name !== 'string' || call.name.trim() === '') {
    throw new Error(`${prefix} (case: "${caseId}"): expected call missing or invalid "name"`)
  }

  const result: PackExpectedCall = { name: call.name as string }

  if ('args' in call && call.args !== undefined) {
    if (typeof call.args !== 'object' || Array.isArray(call.args)) {
      throw new Error(`${prefix} (case: "${caseId}"): expected call "args" must be an object`)
    }
    result.args = call.args as Record<string, unknown>
  }

  return result
}

// ────────────────────────────────────────────────────────────────────────────
// Load Pack from File
// ────────────────────────────────────────────────────────────────────────────

export function loadPack(filePath: string): Pack {
  const resolvedPath = path.resolve(filePath)

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Pack file not found: ${filePath}`)
  }

  let raw: string
  try {
    raw = fs.readFileSync(resolvedPath, 'utf8')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read pack file "${filePath}": ${msg}`)
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid JSON in pack file "${filePath}": ${msg}`)
  }

  try {
    return validatePack(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Invalid pack file "${filePath}": ${msg}`)
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Convert Pack Cases to TestCase format for runner
// ────────────────────────────────────────────────────────────────────────────

export function packCasesToTestCases(pack: Pack, dimensions?: Dimension[]): TestCase[] {
  let cases = pack.cases

  // Filter by dimension if requested
  if (dimensions && dimensions.length > 0) {
    cases = cases.filter(c => dimensions.includes(c.dimension))
  }

  return cases.map(c => {
    // Convert pack tool format to TestCase tool format (with type: 'function' wrapper)
    const tools = c.tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))

    // Convert expected calls to TestCase format
    let expected: TestCase['expected']
    if (c.expected.noCall) {
      expected = { noCall: true }
    } else {
      expected = {
        calls: (c.expected.calls ?? []).map(call => ({
          name: call.name,
          args: call.args ?? {},
          argsMatchMode: 'subset' as const,
        })),
      }
    }

    const testCase: TestCase = {
      id: c.id,
      dimension: c.dimension,
      prompt: c.prompt,
      tools,
      expected,
    }

    if (c.system) testCase.system = c.system
    if (c.difficulty) testCase.difficulty = c.difficulty
    if (c.tags) testCase.tags = c.tags

    return testCase
  })
}
