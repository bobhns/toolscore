/**
 * toolscore — Benchmark LLM tool-calling reliability
 * 
 * Library entry point for programmatic use.
 * 
 * @example
 * ```ts
 * import { runBenchmark } from 'toolscore'
 * 
 * const result = await runBenchmark({ model: 'ollama/llama3.1:8b' })
 * console.log(result.score) // 74
 * ```
 */

export { runBenchmark } from './core/runner.js'
export { computeScore, scoreToGrade } from './core/scorer.js'
export { verifyResponse, scoreArgs } from './core/verifier.js'
export { parseModel, getEndpointDisplay } from './providers/index.js'
export { getAllCases, getCasesByDimension, getCaseCounts, selectCases } from './cases/index.js'
export { printScorecard, toJSON, toMarkdown, toBadgeUrl, formatDuration } from './reporter/index.js'
export type {
  TestCase,
  ToolscoreResult,
  CaseResult,
  DimensionResult,
  Dimension,
  RunOptions,
  OpenAIClientConfig,
  ExpectedCall,
  ArgsMatchMode,
} from './types/index.js'

// Convenience alias
export { runBenchmark as toolscore } from './core/runner.js'
