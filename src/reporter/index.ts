import chalk from 'chalk'
import type { ToolscoreResult, Dimension, CaseResult } from '../types/index.js'
import { VERSION } from '../version.js'

const DIMENSION_LABELS: Record<Dimension, string> = {
  selection: 'Selection',
  args: 'Arg Accuracy',
  parallel: 'Parallel',
  refusal: 'Refusal',
  recovery: 'Recovery',
}

const GRADE_COLORS: Record<string, (s: string) => string> = {
  A: chalk.green,
  B: chalk.cyan,
  C: chalk.yellow,
  D: chalk.rgb(255, 165, 0),
  F: chalk.red,
}

/**
 * Render a progress bar
 */
function progressBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width)
  const empty = width - filled
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty))
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}

/**
 * Print the full terminal scorecard
 */
export function printScorecard(result: ToolscoreResult): void {
  const { score, grade, dimensions, stats, durationMs, model, endpoint } = result

  console.log()
  console.log(
    chalk.bold.white(`  toolscore v${VERSION}`) +
    chalk.gray('  •  ') +
    chalk.cyan(result.modelResolved) +
    chalk.gray(` @ ${endpoint}`)
  )
  console.log()

  // Overall score
  const gradeColor = GRADE_COLORS[grade] ?? chalk.white
  const scoreBar = progressBar(score)
  console.log(
    chalk.bold('  Overall Score') +
    '    ' +
    gradeColor(chalk.bold(`${score} / 100`)) +
    '  ' +
    scoreBar +
    '  ' +
    gradeColor(chalk.bold(`[${grade}]`))
  )
  console.log()

  // Per-dimension scores
  const dims: Dimension[] = ['selection', 'args', 'parallel', 'refusal', 'recovery']
  for (const dim of dims) {
    const d = dimensions[dim]
    if (!d || d.total === 0) continue

    const label = DIMENSION_LABELS[dim].padEnd(14)
    const scoreStr = `${d.score}%`.padStart(4)
    const bar = progressBar(d.score)
    const counts = chalk.gray(`(${d.pass}/${d.total})`)

    let scoreColor = chalk.green
    if (d.score < 60) scoreColor = chalk.red
    else if (d.score < 80) scoreColor = chalk.yellow

    console.log(
      `  ${chalk.bold(label)}  ${scoreColor(scoreStr)}  ${bar}  ${counts}`
    )
  }

  console.log()
  console.log(
    chalk.gray(`  Ran ${stats.total} cases in ${formatDuration(durationMs)}`) +
    (stats.errors > 0 ? chalk.red(`  |  ${stats.errors} errors`) : '')
  )
  console.log()

  // Badge hint
  const modelSlug = model.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const badgeColor = score >= 80 ? 'brightgreen' : score >= 60 ? 'yellow' : 'red'
  console.log(
    chalk.dim(`  Badge: `) +
    chalk.gray(`![toolscore: ${score}](https://img.shields.io/badge/toolscore-${score}%2F100-${badgeColor})`)
  )
  console.log(
    chalk.dim(`  Results: `) +
    chalk.gray(`https://github.com/bobhns/toolscore#community-results`)
  )
  console.log()
}

/**
 * Print a minimal one-line progress update
 */
export function printProgress(current: number, total: number, caseId: string): void {
  const pct = Math.round((current / total) * 100)
  const bar = progressBar(pct, 30)
  process.stdout.write(
    `\r  ${bar}  ${current}/${total}  ${chalk.gray(caseId.padEnd(16))}`
  )
}

export function clearProgress(): void {
  process.stdout.write('\r' + ' '.repeat(80) + '\r')
}

/**
 * Serialize result to JSON
 */
export function toJSON(result: ToolscoreResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : 0)
}

/**
 * Render result as Markdown full report
 */
export function toMarkdown(result: ToolscoreResult): string {
  const { score, grade, dimensions, stats, durationMs, model, modelResolved } = result

  const lines: string[] = []

  lines.push(`# toolscore Results`)
  lines.push('')
  lines.push(`**Model:** \`${model}\` (${modelResolved})`)
  lines.push(`**Score:** ${score}/100 (${grade})`)
  lines.push(`**Date:** ${result.timestamp}`)
  lines.push(`**Duration:** ${formatDuration(durationMs)}`)
  lines.push('')
  lines.push(`## Dimension Scores`)
  lines.push('')
  lines.push('| Dimension | Score | Pass/Total |')
  lines.push('|-----------|-------|-----------|')

  const dims: Dimension[] = ['selection', 'args', 'parallel', 'refusal', 'recovery']
  for (const dim of dims) {
    const d = dimensions[dim]
    if (!d || d.total === 0) continue
    lines.push(`| ${DIMENSION_LABELS[dim]} | ${d.score}% | ${d.pass}/${d.total} |`)
  }

  lines.push('')
  lines.push(`**Total:** ${stats.passed}/${stats.total} passed`)
  if (stats.errors > 0) {
    lines.push(`**Errors:** ${stats.errors}`)
  }

  return lines.join('\n')
}

/**
 * Render a single community leaderboard table row for pasting into the README.
 *
 * Format matches the community-results table:
 * | Model | Score | Selection | Args | Parallel | Refusal | Recovery | Version |
 */
export function toTableRow(result: ToolscoreResult, version: string): string {
  const { score, grade, dimensions, model } = result
  const d = dimensions

  const sel = d.selection.total > 0 ? `${d.selection.score}%` : '—'
  const args = d.args.total > 0 ? `${d.args.score}%` : '—'
  const par = d.parallel.total > 0 ? `${d.parallel.score}%` : '—'
  const ref = d.refusal.total > 0 ? `${d.refusal.score}%` : '—'
  const rec = d.recovery.total > 0 ? `${d.recovery.score}%` : '—'

  const modelDisplay = model.includes('/') ? model.split('/').slice(1).join('/') : model
  const badgeColor = score >= 80 ? 'brightgreen' : score >= 60 ? 'yellow' : score >= 40 ? 'orange' : 'red'
  const badge = `![${score}](https://img.shields.io/badge/toolscore-${score}%2F100-${badgeColor})`

  const lines: string[] = []
  lines.push(`<!-- paste this row into the Community Results table in README.md -->`)
  lines.push(`| ${modelDisplay} | ${badge} | ${sel} | ${args} | ${par} | ${ref} | ${rec} | v${version} |`)
  lines.push(``)
  lines.push(`Badge markdown (embed in your model's README):`)
  lines.push(`\`\`\``)
  lines.push(`[![toolscore: ${score}/100](${toBadgeUrl(result)})](https://github.com/bobhns/toolscore)`)
  lines.push(`\`\`\``)

  return lines.join('\n')
}

/**
 * Generate a badge URL
 */
export function toBadgeUrl(result: ToolscoreResult): string {
  const { score } = result
  const color = score >= 80 ? 'brightgreen' : score >= 60 ? 'yellow' : score >= 40 ? 'orange' : 'red'
  return `https://img.shields.io/badge/toolscore-${score}%2F100-${color}`
}

/**
 * Print verbose case-by-case output
 */
export function printVerboseCases(cases: CaseResult[]): void {
  console.log()
  console.log(chalk.bold('  Case Details'))
  console.log(chalk.gray('  ' + '─'.repeat(60)))

  for (const c of cases) {
    const icon = c.pass ? chalk.green('✓') : chalk.red('✗')
    const score = `${c.score}`.padStart(3)
    const dim = chalk.gray(c.dimension.padEnd(10))
    const id = c.id.padEnd(12)

    console.log(`  ${icon} ${dim} ${id} ${score}/100  ${formatDuration(c.durationMs)}`)

    if (!c.pass && c.actual.toolCalls) {
      const actual = c.actual.toolCalls.map(tc => tc.name).join(', ')
      console.log(chalk.gray(`       Got: ${actual}`))
    }
    if (!c.pass && c.actual.error) {
      console.log(chalk.red(`       Error: ${c.actual.error.slice(0, 80)}`))
    }
  }
}
