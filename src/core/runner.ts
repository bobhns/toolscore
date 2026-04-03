import OpenAI from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js'
import type { TestCase, CaseResult, RunOptions, Dimension } from '../types/index.js'
import { parseModel, getEndpointDisplay } from '../providers/index.js'
import { verifyResponse } from './verifier.js'
import { computeScore } from './scorer.js'
import type { ToolscoreResult } from '../types/index.js'
import { selectCases } from '../cases/index.js'

interface RunnerCallbacks {
  onStart?: (total: number, model: string, endpoint: string) => void
  onCaseStart?: (caseId: string, index: number, total: number) => void
  onCaseEnd?: (result: CaseResult) => void
  onError?: (error: Error) => void
}

export async function runBenchmark(
  options: RunOptions,
  callbacks?: RunnerCallbacks
): Promise<ToolscoreResult> {
  const config = parseModel(options.model, {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
  })

  const endpoint = getEndpointDisplay(config)

  const cases = selectCases(
    options.cases,
    options.dimensions
  )

  callbacks?.onStart?.(cases.length, config.model, endpoint)

  const runId = `run_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 15)}`
  const startTime = Date.now()

  if (options.dryRun) {
    // Return what would run without actually calling the API
    const dryResults: CaseResult[] = cases.map(c => ({
      id: c.id,
      dimension: c.dimension as Dimension,
      pass: false,
      score: 0,
      durationMs: 0,
      actual: { toolCalls: null, content: null, error: 'dry-run' },
      expected: c.expected,
    }))

    return computeScore(dryResults, {
      runId,
      model: options.model,
      modelResolved: config.model,
      endpoint,
      timestamp: new Date().toISOString(),
      durationMs: 0,
    })
  }

  const client = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey || 'none',
    timeout: (options.timeout ?? 30) * 1000,
    maxRetries: 0,
  })

  const concurrency = options.concurrency ?? 3
  const results: CaseResult[] = []

  // Process cases with concurrency limit
  const queue = [...cases]
  let index = 0

  async function processCase(testCase: TestCase, caseIndex: number): Promise<CaseResult> {
    callbacks?.onCaseStart?.(testCase.id, caseIndex, cases.length)

    const caseStart = Date.now()
    let result: CaseResult

    try {
      const response = await callModel(client, config.model, testCase, options)
      const durationMs = Date.now() - caseStart
      result = verifyResponse(testCase, response, undefined, durationMs)
    } catch (err) {
      const durationMs = Date.now() - caseStart
      const errorMsg = err instanceof Error ? err.message : String(err)
      result = verifyResponse(testCase, null, errorMsg, durationMs)
    }

    callbacks?.onCaseEnd?.(result)
    return result
  }

  // Simple concurrency pool
  const workers: Promise<void>[] = []

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const testCase = queue.shift()
      if (!testCase) break
      const caseIndex = index++
      const result = await processCase(testCase, caseIndex)
      results.push(result)
    }
  }

  for (let i = 0; i < Math.min(concurrency, cases.length); i++) {
    workers.push(worker())
  }

  await Promise.all(workers)

  const totalDuration = Date.now() - startTime

  return computeScore(results, {
    runId,
    model: options.model,
    modelResolved: config.model,
    endpoint,
    timestamp: new Date().toISOString(),
    durationMs: totalDuration,
  })
}

async function callModel(
  client: OpenAI,
  modelId: string,
  testCase: TestCase,
  options: RunOptions
) {
  const messages = buildMessages(testCase)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestBody: any = {
    model: modelId,
    messages,
    tools: testCase.tools as never,
    tool_choice: 'auto' as const,
  }

  // Enable parallel tool calls for parallel dimension
  if (testCase.dimension === 'parallel') {
    requestBody.parallel_tool_calls = true
  }

  // Add system prompt if specified
  if (testCase.system && !messages.some(m => m.role === 'system')) {
    messages.unshift({ role: 'system', content: testCase.system })
  }

  return await client.chat.completions.create(requestBody)
}

function buildMessages(testCase: TestCase): ChatCompletionMessageParam[] {
  // Recovery cases: use the setup conversation + continuation prompt
  if (testCase.setupConversation && testCase.setupConversation.length > 0) {
    const msgs: ChatCompletionMessageParam[] = testCase.setupConversation.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          tool_call_id: m.tool_call_id ?? 'unknown',
          content: m.content ?? '',
        }
      }
      if (m.role === 'assistant') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return m as any
      }
      return {
        role: m.role as 'user' | 'system',
        content: m.content ?? '',
      }
    })

    // Add the continuation prompt
    msgs.push({ role: 'user', content: testCase.prompt })
    return msgs
  }

  // Standard case: single user message
  return [{ role: 'user', content: testCase.prompt }]
}
