import { describe, it, expect } from 'vitest'
import { verifyResponse, scoreArgs } from '../core/verifier.js'
import type { TestCase } from '../types/index.js'
import type { ChatCompletion } from 'openai/resources/chat/completions.js'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeResponse(toolCalls?: Array<{ name: string; args: Record<string, unknown> }>, content?: string): ChatCompletion {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'test-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: content ?? null,
          tool_calls: toolCalls?.map((tc, i) => ({
            id: `call_${i}`,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          })),
        },
        finish_reason: toolCalls?.length ? 'tool_calls' : 'stop',
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  } as ChatCompletion
}

const WEATHER_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: 'Get weather for a city',
      parameters: {
        type: 'object' as const,
        properties: {
          city: { type: 'string' },
          units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_web',
      description: 'Search the web',
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
]

const BASE_CASE: TestCase = {
  id: 'test_001',
  dimension: 'selection',
  prompt: "What's the weather in Paris?",
  tools: WEATHER_TOOLS,
  expected: {
    calls: [{ name: 'get_weather', args: { city: 'Paris' }, argsMatchMode: 'subset' }],
  },
}

// ────────────────────────────────────────────────────────────────────────────
// verifyResponse — error handling
// ────────────────────────────────────────────────────────────────────────────

describe('verifyResponse — error cases', () => {
  it('returns error result when error string is passed', () => {
    const result = verifyResponse(BASE_CASE, null, 'API timeout', 100)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
    expect(result.actual.error).toBe('API timeout')
    expect(result.actual.toolCalls).toBeNull()
  })

  it('returns error result when response is null', () => {
    const result = verifyResponse(BASE_CASE, null, undefined, 100)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
    expect(result.actual.error).toBe('No response')
  })

  it('returns error result when choices is empty', () => {
    const emptyResponse = { ...makeResponse(), choices: [] } as ChatCompletion
    const result = verifyResponse(BASE_CASE, emptyResponse, undefined, 100)
    expect(result.pass).toBe(false)
    expect(result.actual.error).toBe('Empty response choices')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// verifyResponse — SELECTION dimension
// ────────────────────────────────────────────────────────────────────────────

describe('verifyResponse — selection dimension', () => {
  it('passes when correct tool is called', () => {
    const response = makeResponse([{ name: 'get_weather', args: { city: 'Paris' } }])
    const result = verifyResponse(BASE_CASE, response, undefined, 100)
    expect(result.pass).toBe(true)
    expect(result.score).toBeGreaterThan(0)
  })

  it('fails when wrong tool is called', () => {
    const response = makeResponse([{ name: 'search_web', args: { query: 'Paris weather' } }])
    const result = verifyResponse(BASE_CASE, response, undefined, 100)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
  })

  it('fails when no tool is called', () => {
    const response = makeResponse([], "The weather in Paris is nice today.")
    const result = verifyResponse(BASE_CASE, response, undefined, 100)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
    expect(result.actual.toolCalls).toBeNull()
  })

  it('passes with extra tools called (still has correct tool)', () => {
    const response = makeResponse([
      { name: 'get_weather', args: { city: 'Paris' } },
      { name: 'search_web', args: { query: 'Paris' } },
    ])
    const result = verifyResponse(BASE_CASE, response, undefined, 100)
    // Should still pass — correct tool was called
    expect(result.pass).toBe(true)
  })

  it('carries dimension through result', () => {
    const response = makeResponse([{ name: 'get_weather', args: { city: 'Paris' } }])
    const result = verifyResponse(BASE_CASE, response, undefined, 100)
    expect(result.dimension).toBe('selection')
    expect(result.id).toBe('test_001')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// verifyResponse — ARGS dimension
// ────────────────────────────────────────────────────────────────────────────

describe('verifyResponse — args dimension', () => {
  const argsCase: TestCase = {
    id: 'arg_001',
    dimension: 'args',
    prompt: 'Get the weather in Paris in celsius',
    tools: WEATHER_TOOLS,
    expected: {
      calls: [{ name: 'get_weather', args: { city: 'Paris', units: 'celsius' }, argsMatchMode: 'subset' }],
    },
  }

  it('passes with all correct args', () => {
    const response = makeResponse([{ name: 'get_weather', args: { city: 'Paris', units: 'celsius' } }])
    const result = verifyResponse(argsCase, response, undefined, 100)
    expect(result.pass).toBe(true)
    expect(result.score).toBe(100)
  })

  it('partial credit for partially correct args', () => {
    const response = makeResponse([{ name: 'get_weather', args: { city: 'Paris', units: 'fahrenheit' } }])
    const result = verifyResponse(argsCase, response, undefined, 100)
    expect(result.pass).toBe(false) // 50% < 80% threshold
    expect(result.score).toBe(50)
    expect(result.argDetails).toBeDefined()
    expect(result.argDetails?.length).toBe(2)
  })

  it('fails with completely wrong args', () => {
    const response = makeResponse([{ name: 'get_weather', args: { city: 'London', units: 'fahrenheit' } }])
    const result = verifyResponse(argsCase, response, undefined, 100)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
  })

  it('passes when extra args provided (subset mode)', () => {
    const response = makeResponse([{ name: 'get_weather', args: { city: 'Paris', units: 'celsius', extra: 'ignored' } }])
    const result = verifyResponse(argsCase, response, undefined, 100)
    expect(result.pass).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// verifyResponse — PARALLEL dimension
// ────────────────────────────────────────────────────────────────────────────

describe('verifyResponse — parallel dimension', () => {
  const parallelCase: TestCase = {
    id: 'par_001',
    dimension: 'parallel',
    prompt: "What's the weather in Paris AND search the web for hotels in Paris?",
    tools: WEATHER_TOOLS,
    expected: {
      calls: [
        { name: 'get_weather', args: { city: 'Paris' }, argsMatchMode: 'subset' },
        { name: 'search_web', args: { query: 'Paris' }, argsMatchMode: 'fuzzy' },
      ],
    },
  }

  it('passes when both tools called in parallel', () => {
    const response = makeResponse([
      { name: 'get_weather', args: { city: 'Paris' } },
      { name: 'search_web', args: { query: 'hotels in Paris' } },
    ])
    const result = verifyResponse(parallelCase, response, undefined, 100)
    expect(result.pass).toBe(true)
    expect(result.score).toBe(100)
  })

  it('partial credit when only one tool called', () => {
    const response = makeResponse([{ name: 'get_weather', args: { city: 'Paris' } }])
    const result = verifyResponse(parallelCase, response, undefined, 100)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(50) // 1 of 2 matched
  })

  it('fails when no tools called', () => {
    const response = makeResponse([], 'I would check the weather and search for hotels...')
    const result = verifyResponse(parallelCase, response, undefined, 100)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
  })

  it('fails when wrong tools called', () => {
    const response = makeResponse([
      { name: 'wrong_tool', args: {} },
      { name: 'another_wrong', args: {} },
    ])
    const result = verifyResponse(parallelCase, response, undefined, 100)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// verifyResponse — REFUSAL dimension
// ────────────────────────────────────────────────────────────────────────────

describe('verifyResponse — refusal dimension', () => {
  const refusalCase: TestCase = {
    id: 'ref_001',
    dimension: 'refusal',
    prompt: "What's 2 + 2?",
    tools: WEATHER_TOOLS,
    expected: { noCall: true },
  }

  it('passes when model does NOT call a tool', () => {
    const response = makeResponse([], 'The answer is 4.')
    const result = verifyResponse(refusalCase, response, undefined, 100)
    expect(result.pass).toBe(true)
    expect(result.score).toBe(100)
  })

  it('fails when model incorrectly calls a tool', () => {
    const response = makeResponse([{ name: 'get_weather', args: { city: 'Paris' } }])
    const result = verifyResponse(refusalCase, response, undefined, 100)
    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
  })

  it('passes with no tool_calls field at all', () => {
    const response = makeResponse()
    const result = verifyResponse(refusalCase, response, undefined, 100)
    expect(result.pass).toBe(true)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// verifyResponse — RECOVERY dimension
// ────────────────────────────────────────────────────────────────────────────

describe('verifyResponse — recovery dimension', () => {
  const recoveryCase: TestCase = {
    id: 'rec_001',
    dimension: 'recovery',
    prompt: 'Please try again with the weather API.',
    tools: WEATHER_TOOLS,
    setupConversation: [
      { role: 'user', content: "What's the weather in Paris?" },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'call_abc', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }],
      },
      { role: 'tool', tool_call_id: 'call_abc', content: 'Error: Service unavailable. Please retry.' },
    ],
    expected: {
      calls: [{ name: 'get_weather', args: { city: 'Paris' }, argsMatchMode: 'subset' }],
    },
  }

  it('passes when model retries the correct tool after error', () => {
    const response = makeResponse([{ name: 'get_weather', args: { city: 'Paris' } }])
    const result = verifyResponse(recoveryCase, response, undefined, 100)
    expect(result.pass).toBe(true)
    expect(result.dimension).toBe('recovery')
  })

  it('fails when model gives up and responds conversationally', () => {
    const response = makeResponse([], "I'm sorry, the weather service appears to be unavailable.")
    const result = verifyResponse(recoveryCase, response, undefined, 100)
    expect(result.pass).toBe(false)
  })

  it('fails when model calls wrong tool on retry', () => {
    const response = makeResponse([{ name: 'search_web', args: { query: 'Paris weather' } }])
    const result = verifyResponse(recoveryCase, response, undefined, 100)
    expect(result.pass).toBe(false)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// verifyResponse — content fallback parsing
// ────────────────────────────────────────────────────────────────────────────

describe('verifyResponse — content fallback', () => {
  it('parses tool call from content JSON when tool_calls is missing', () => {
    const response: ChatCompletion = {
      ...makeResponse(),
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify({ name: 'get_weather', arguments: { city: 'Paris' } }),
            tool_calls: undefined,
          },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
    } as ChatCompletion

    const result = verifyResponse(BASE_CASE, response, undefined, 100)
    // Model used content format — should still be detected
    expect(result.actual.toolCalls).not.toBeNull()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// scoreArgs
// ────────────────────────────────────────────────────────────────────────────

describe('scoreArgs', () => {
  it('returns 1.0 for empty expected args', () => {
    const { score } = scoreArgs({ city: 'Paris' }, {}, 'subset')
    expect(score).toBe(1)
  })

  it('subset mode: exact match scores 1.0', () => {
    const { score } = scoreArgs({ city: 'Paris' }, { city: 'Paris' }, 'subset')
    expect(score).toBe(1)
  })

  it('subset mode: value mismatch scores 0', () => {
    const { score } = scoreArgs({ city: 'London' }, { city: 'Paris' }, 'subset')
    expect(score).toBe(0)
  })

  it('subset mode: missing key scores 0', () => {
    const { score } = scoreArgs({}, { city: 'Paris' }, 'subset')
    expect(score).toBe(0)
  })

  it('subset mode: partial match gives partial score', () => {
    const { score } = scoreArgs(
      { city: 'Paris', units: 'fahrenheit' },
      { city: 'Paris', units: 'celsius' },
      'subset'
    )
    expect(score).toBe(0.5) // 1 of 2 args correct
  })

  it('exact mode: correct type wrong value gives 0.5', () => {
    const { score } = scoreArgs({ count: 5 }, { count: 10 }, 'exact')
    expect(score).toBe(0.5)
  })

  it('exact mode: perfect match gives 1.0', () => {
    const { score } = scoreArgs({ count: 10 }, { count: 10 }, 'exact')
    expect(score).toBe(1.0)
  })

  it('exact mode: type mismatch gives 0', () => {
    const { score } = scoreArgs({ count: '10' }, { count: 10 }, 'exact')
    expect(score).toBe(0)
  })

  it('types-only mode: same type passes', () => {
    const { score } = scoreArgs({ city: 'London' }, { city: 'Paris' }, 'types-only')
    expect(score).toBe(1)
  })

  it('types-only mode: different type fails', () => {
    const { score } = scoreArgs({ city: 42 }, { city: 'Paris' }, 'types-only')
    expect(score).toBe(0)
  })

  it('fuzzy mode: close numeric match gives 0.5', () => {
    const { score } = scoreArgs({ value: 105 }, { value: 100 }, 'fuzzy')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('fuzzy mode: string contains expected gives partial score', () => {
    const { score } = scoreArgs({ query: 'weather in Paris today' }, { query: 'Paris' }, 'fuzzy')
    expect(score).toBeGreaterThan(0)
  })

  it('fuzzy mode: normalized string match gives 1.0', () => {
    const { score } = scoreArgs({ city: '  Paris  ' }, { city: 'paris' }, 'fuzzy')
    expect(score).toBe(1)
  })

  it('returns per-arg details', () => {
    const { details } = scoreArgs(
      { city: 'Paris', units: 'fahrenheit' },
      { city: 'Paris', units: 'celsius' },
      'subset'
    )
    expect(details).toHaveLength(2)
    const cityDetail = details.find(d => d.key === 'city')
    expect(cityDetail?.score).toBe(1)
    const unitsDetail = details.find(d => d.key === 'units')
    expect(unitsDetail?.score).toBe(0)
  })
})
