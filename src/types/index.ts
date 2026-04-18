import { z } from 'zod'

// ────────────────────────────────────────────────────────────────────────────
// Tool Definition Schema
// ────────────────────────────────────────────────────────────────────────────

export const ToolParamSchema: z.ZodType<ToolParam> = z.lazy(() =>
  z.object({
    type: z.string(),
    description: z.string().optional(),
    enum: z.array(z.string()).optional(),
    items: z.any().optional(),
    properties: z.record(ToolParamSchema).optional(),
    required: z.array(z.string()).optional(),
  })
)

export type ToolParam = {
  type: string
  description?: string
  enum?: string[]
  items?: unknown
  properties?: Record<string, ToolParam>
  required?: string[]
}

export const ToolFunctionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(ToolParamSchema),
    required: z.array(z.string()).optional(),
  }),
})

export const ToolDefinitionSchema = z.object({
  type: z.literal('function'),
  function: ToolFunctionSchema,
})

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>

// ────────────────────────────────────────────────────────────────────────────
// Test Case Schema
// ────────────────────────────────────────────────────────────────────────────

export const ArgsMatchModeSchema = z.enum(['exact', 'subset', 'types-only', 'fuzzy'])
export type ArgsMatchMode = z.infer<typeof ArgsMatchModeSchema>

export const ExpectedCallSchema = z.object({
  name: z.string(),
  args: z.record(z.unknown()),
  argsMatchMode: ArgsMatchModeSchema.default('subset'),
})

export type ExpectedCall = z.infer<typeof ExpectedCallSchema>

export const DimensionSchema = z.enum(['selection', 'args', 'parallel', 'refusal', 'recovery'])
export type Dimension = z.infer<typeof DimensionSchema>

export const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.string().nullable().optional(),
  tool_calls: z.array(z.any()).optional(),
  tool_call_id: z.string().optional(),
  name: z.string().optional(),
})

export type ConversationMessage = z.infer<typeof ConversationMessageSchema>

export const TestCaseSchema = z.object({
  id: z.string(),
  dimension: DimensionSchema,
  prompt: z.string(),
  tools: z.array(ToolDefinitionSchema),
  system: z.string().optional(),
  expected: z.union([
    z.object({ calls: z.array(ExpectedCallSchema) }),
    z.object({ noCall: z.literal(true) }),
  ]),
  setupConversation: z.array(ConversationMessageSchema).optional(),
  tags: z.array(z.string()).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
})

export type TestCase = z.infer<typeof TestCaseSchema>

// ────────────────────────────────────────────────────────────────────────────
// Result Types
// ────────────────────────────────────────────────────────────────────────────

export interface ActualToolCall {
  name: string
  args: Record<string, unknown>
  rawArguments: string
}

export interface ArgDetail {
  key: string
  expected: unknown
  actual: unknown
  score: number
  reason: string
}

export interface CaseResult {
  id: string
  dimension: Dimension
  pass: boolean
  score: number // 0–100
  durationMs: number
  actual: {
    toolCalls: ActualToolCall[] | null
    content: string | null
    error?: string
  }
  expected: TestCase['expected']
  argDetails?: ArgDetail[]
}

export interface DimensionResult {
  score: number // 0–100
  pass: number
  total: number
  weight: number
}

export interface ToolscoreResult {
  runId: string
  model: string
  modelResolved: string
  endpoint: string
  timestamp: string
  durationMs: number
  score: number // 0–100
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  dimensions: Record<Dimension, DimensionResult>
  cases: CaseResult[]
  stats: {
    total: number
    passed: number
    failed: number
    errors: number
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Provider Config
// ────────────────────────────────────────────────────────────────────────────

export interface OpenAIClientConfig {
  baseURL: string
  apiKey: string
  model: string
  providerName: string
}

// ────────────────────────────────────────────────────────────────────────────
// Runner Options
// ────────────────────────────────────────────────────────────────────────────

export interface RunOptions {
  model: string
  apiKey?: string
  baseUrl?: string
  dimensions?: Dimension[]
  cases?: number
  timeout?: number
  concurrency?: number
  dryRun?: boolean
  verbose?: boolean
  /** Custom test cases (e.g. from a --pack file). When set, overrides built-in suite. */
  customCases?: TestCase[]
}
