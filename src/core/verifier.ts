import type { TestCase, CaseResult, ArgDetail, ArgsMatchMode, Dimension, ActualToolCall } from '../types/index.js'
import type { ChatCompletion } from 'openai/resources/chat/completions.js'

/**
 * Verify a model's response against a test case.
 * Returns a CaseResult with pass/fail status and score.
 */
export function verifyResponse(
  testCase: TestCase,
  response: ChatCompletion | null,
  error: string | undefined,
  durationMs: number
): CaseResult {
  const dimension = testCase.dimension as Dimension

  if (error || !response) {
    return {
      id: testCase.id,
      dimension,
      pass: false,
      score: 0,
      durationMs,
      actual: { toolCalls: null, content: null, error: error ?? 'No response' },
      expected: testCase.expected,
    }
  }

  const message = response.choices?.[0]?.message
  if (!message) {
    return {
      id: testCase.id,
      dimension,
      pass: false,
      score: 0,
      durationMs,
      actual: { toolCalls: null, content: null, error: 'Empty response choices' },
      expected: testCase.expected,
    }
  }

  // Parse tool calls from the response
  const parsedCalls = parseToolCalls(message)
  const content = message.content ?? null

  // REFUSAL dimension: model should NOT call any tool
  if ('noCall' in testCase.expected) {
    const calledSomething = parsedCalls !== null && parsedCalls.length > 0
    return {
      id: testCase.id,
      dimension,
      pass: !calledSomething,
      score: calledSomething ? 0 : 100,
      durationMs,
      actual: { toolCalls: parsedCalls, content },
      expected: testCase.expected,
    }
  }

  // All other dimensions: model SHOULD call tools
  const expectedCalls = testCase.expected.calls

  if (!parsedCalls || parsedCalls.length === 0) {
    // Model didn't call any tool — fail
    return {
      id: testCase.id,
      dimension,
      pass: false,
      score: 0,
      durationMs,
      actual: { toolCalls: null, content },
      expected: testCase.expected,
    }
  }

  // PARALLEL dimension: needs ALL expected calls in ONE response
  if (dimension === 'parallel') {
    return verifyParallel(testCase, parsedCalls, content, durationMs)
  }

  // SELECTION, ARGS, RECOVERY: verify primary call
  return verifyCall(testCase, parsedCalls, content, durationMs)
}

/**
 * Parse tool calls from a message, handling malformed JSON gracefully.
 * Also tries to extract tool calls from content if tool_calls is missing.
 */
function parseToolCalls(
  message: { tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }> | null; content?: string | null }
): ActualToolCall[] | null {
  // Primary: check tool_calls field
  if (message.tool_calls && message.tool_calls.length > 0) {
    const result: ActualToolCall[] = []
    for (const tc of message.tool_calls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function.arguments)
      } catch {
        // Invalid JSON in arguments — record what we got
        args = { __parse_error: tc.function.arguments }
      }
      result.push({
        name: tc.function.name,
        args,
        rawArguments: tc.function.arguments,
      })
    }
    return result
  }

  // Fallback: try to parse content as tool call JSON (some models do this)
  if (message.content) {
    const content = message.content.trim()
    try {
      const parsed = JSON.parse(content)
      if (parsed.name && typeof parsed.name === 'string') {
        return [{
          name: parsed.name,
          args: parsed.arguments ?? parsed.args ?? {},
          rawArguments: JSON.stringify(parsed.arguments ?? parsed.args ?? {}),
        }]
      }
      // Check for array format
      if (Array.isArray(parsed) && parsed[0]?.name) {
        return parsed.map((p: { name: string; arguments?: Record<string, unknown>; args?: Record<string, unknown> }) => ({
          name: p.name,
          args: p.arguments ?? p.args ?? {},
          rawArguments: JSON.stringify(p.arguments ?? p.args ?? {}),
        }))
      }
    } catch {
      // Not JSON content — model replied conversationally
    }
  }

  return null
}

/**
 * Verify single-call scenarios (selection, args, recovery)
 */
function verifyCall(
  testCase: TestCase,
  actualCalls: ActualToolCall[],
  content: string | null,
  durationMs: number
): CaseResult {
  const dimension = testCase.dimension as Dimension
  if (!('calls' in testCase.expected)) {
    throw new Error('Expected calls array')
  }
  const expectedCalls = testCase.expected.calls

  // Check selection: did model call the right function?
  const primaryExpected = expectedCalls[0]
  const matchingCall = actualCalls.find(c => c.name === primaryExpected.name)

  if (!matchingCall) {
    // Wrong function called
    return {
      id: testCase.id,
      dimension,
      pass: false,
      score: 0,
      durationMs,
      actual: { toolCalls: actualCalls, content },
      expected: testCase.expected,
    }
  }

  // Verify args
  const { score: argScore, details } = scoreArgs(
    matchingCall.args,
    primaryExpected.args,
    primaryExpected.argsMatchMode
  )

  const pass = argScore >= 0.8 // 80% threshold for "pass"
  const score = Math.round(argScore * 100)

  return {
    id: testCase.id,
    dimension,
    pass,
    score,
    durationMs,
    actual: { toolCalls: actualCalls, content },
    expected: testCase.expected,
    argDetails: details,
  }
}

/**
 * Verify parallel call scenarios — model must call ALL expected functions
 */
function verifyParallel(
  testCase: TestCase,
  actualCalls: ActualToolCall[],
  content: string | null,
  durationMs: number
): CaseResult {
  const dimension = testCase.dimension as Dimension
  if (!('calls' in testCase.expected)) {
    throw new Error('Expected calls array')
  }
  const expectedCalls = testCase.expected.calls

  // Check that all expected calls are present (order independent)
  const matched: boolean[] = new Array(expectedCalls.length).fill(false)

  for (let i = 0; i < expectedCalls.length; i++) {
    const exp = expectedCalls[i]
    // Find a matching actual call (by name)
    for (const actual of actualCalls) {
      if (actual.name === exp.name) {
        const { score } = scoreArgs(actual.args, exp.args, exp.argsMatchMode)
        if (score >= 0.5) {
          // At least partially matched
          matched[i] = true
          break
        }
      }
    }
  }

  const matchedCount = matched.filter(Boolean).length
  const pass = matchedCount === expectedCalls.length
  const score = Math.round((matchedCount / expectedCalls.length) * 100)

  return {
    id: testCase.id,
    dimension,
    pass,
    score,
    durationMs,
    actual: { toolCalls: actualCalls, content },
    expected: testCase.expected,
  }
}

/**
 * Score argument accuracy for a single call.
 * Returns a score 0.0–1.0 and per-arg details.
 */
export function scoreArgs(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  mode: ArgsMatchMode = 'subset'
): { score: number; details: ArgDetail[] } {
  const expectedKeys = Object.keys(expected)

  if (expectedKeys.length === 0) {
    return { score: 1, details: [] }
  }

  const details: ArgDetail[] = []
  let totalScore = 0

  for (const key of expectedKeys) {
    const actualVal = actual[key]
    const expectedVal = expected[key]

    if (actualVal === undefined) {
      details.push({
        key,
        expected: expectedVal,
        actual: undefined,
        score: 0,
        reason: 'missing',
      })
      continue
    }

    let keyScore = 0
    let reason = ''

    switch (mode) {
      case 'exact': {
        const typeMatch = typeof actualVal === typeof expectedVal
        const valueMatch = JSON.stringify(actualVal) === JSON.stringify(expectedVal)
        if (valueMatch) {
          keyScore = 1.0
          reason = 'exact match'
        } else if (typeMatch) {
          keyScore = 0.5
          reason = 'type match, wrong value'
        } else {
          keyScore = 0
          reason = 'type and value mismatch'
        }
        break
      }

      case 'subset': {
        const valueMatch = JSON.stringify(actualVal) === JSON.stringify(expectedVal)
        keyScore = valueMatch ? 1.0 : 0
        reason = valueMatch ? 'exact match' : 'value mismatch'
        break
      }

      case 'types-only': {
        const typeMatch = typeof actualVal === typeof expectedVal
        keyScore = typeMatch ? 1.0 : 0
        reason = typeMatch ? 'type match' : 'type mismatch'
        break
      }

      case 'fuzzy': {
        if (typeof expectedVal === 'number' && typeof actualVal === 'number') {
          const diff = Math.abs(actualVal - expectedVal) / Math.abs((expectedVal as number) || 1)
          if (diff < 0.01) {
            keyScore = 1.0
            reason = 'exact numeric match'
          } else if (diff < 0.1) {
            keyScore = 0.5
            reason = 'close numeric match'
          } else {
            keyScore = 0
            reason = 'numeric too far off'
          }
        } else if (typeof expectedVal === 'string' && typeof actualVal === 'string') {
          const norm = (s: string) => s.toLowerCase().trim()
          if (norm(actualVal as string) === norm(expectedVal as string)) {
            keyScore = 1.0
            reason = 'exact string match (normalized)'
          } else if (norm(actualVal as string).includes(norm(expectedVal as string))) {
            keyScore = 0.8
            reason = 'string contains expected'
          } else if (norm(expectedVal as string).includes(norm(actualVal as string))) {
            keyScore = 0.6
            reason = 'expected contains actual'
          } else {
            keyScore = 0
            reason = 'string mismatch'
          }
        } else {
          const valueMatch = JSON.stringify(actualVal) === JSON.stringify(expectedVal)
          keyScore = valueMatch ? 1.0 : 0
          reason = valueMatch ? 'exact match' : 'value mismatch'
        }
        break
      }
    }

    totalScore += keyScore
    details.push({
      key,
      expected: expectedVal,
      actual: actualVal,
      score: keyScore,
      reason,
    })
  }

  return {
    score: totalScore / expectedKeys.length,
    details,
  }
}
