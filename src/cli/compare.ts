import chalk from 'chalk'
import { runBenchmark } from '../core/runner.js'
import { parseModel } from '../providers/index.js'
import { VERSION } from '../version.js'
import type { Dimension, ToolscoreResult, RunOptions } from '../types/index.js'

const DIMS: Dimension[] = ['selection', 'args', 'parallel', 'refusal', 'recovery']

export interface CompareOptions {
  apiKey?: string
  apiKeyA?: string
  apiKeyB?: string
  baseUrlA?: string
  baseUrlB?: string
  dimension?: string
  format?: string
}

export interface CompareResult {
  modelA: ToolscoreResult
  modelB: ToolscoreResult
  winner: 'modelA' | 'modelB' | 'tie'
  totalDiff: number
  dimensionWins: { modelA: number; modelB: number }
}

export function buildCompareResult(
  modelA: ToolscoreResult,
  modelB: ToolscoreResult
): CompareResult {
  const dimensionWins = { modelA: 0, modelB: 0 }

  for (const dim of DIMS) {
    const a = modelA.dimensions[dim]
    const b = modelB.dimensions[dim]
    if (!a || !b || a.total === 0) continue
    if (a.score > b.score) dimensionWins.modelA++
    else if (b.score > a.score) dimensionWins.modelB++
  }

  const totalDiff = Math.abs(modelA.score - modelB.score)
  let winner: 'modelA' | 'modelB' | 'tie'
  if (modelA.score > modelB.score) winner = 'modelA'
  else if (modelB.score > modelA.score) winner = 'modelB'
  else winner = 'tie'

  return { modelA, modelB, winner, totalDiff, dimensionWins }
}

export function getBiggestGap(modelA: ToolscoreResult, modelB: ToolscoreResult): { dim: Dimension; gap: number } | null {
  let biggestGap = 0
  let biggestDim: Dimension | null = null

  for (const dim of DIMS) {
    const a = modelA.dimensions[dim]
    const b = modelB.dimensions[dim]
    if (!a || !b || a.total === 0) continue
    const gap = Math.abs(a.score - b.score)
    if (gap > biggestGap) {
      biggestGap = gap
      biggestDim = dim
    }
  }

  return biggestDim ? { dim: biggestDim, gap: biggestGap } : null
}

export function toCompareJSON(result: CompareResult): string {
  return JSON.stringify(result, null, 2)
}

export function toCompareMarkdown(result: CompareResult): string {
  const { modelA, modelB, winner, totalDiff, dimensionWins } = result
  const nameA = modelA.modelResolved
  const nameB = modelB.modelResolved

  const lines: string[] = []
  lines.push(`# toolscore compare`)
  lines.push('')
  lines.push(`**Model A:** \`${nameA}\``)
  lines.push(`**Model B:** \`${nameB}\``)
  lines.push('')
  lines.push(`| Dimension | ${nameA} | ${nameB} |`)
  lines.push(`|-----------|${'-'.repeat(nameA.length + 2)}|${'-'.repeat(nameB.length + 2)}|`)

  for (const dim of DIMS) {
    const a = modelA.dimensions[dim]
    const b = modelB.dimensions[dim]
    if (!a || !b || a.total === 0) continue

    const aStr = `${a.pass}/${a.total} (${a.score}%)`
    const bStr = `${b.pass}/${b.total} (${b.score}%)`

    let aCell = aStr
    let bCell = bStr

    if (a.score > b.score) aCell = `**${aStr} ★**`
    else if (b.score > a.score) bCell = `**${bStr} ★**`

    lines.push(`| ${dim} | ${aCell} | ${bCell} |`)
  }

  // Total row
  const aTotal = `${modelA.stats.passed}/${modelA.stats.total} (${modelA.score}%)`
  const bTotal = `${modelB.stats.passed}/${modelB.stats.total} (${modelB.score}%)`
  let aTotalCell = `**${aTotal}**`
  let bTotalCell = `**${bTotal}**`
  if (winner === 'modelA') aTotalCell = `**${aTotal} ★**`
  else if (winner === 'modelB') bTotalCell = `**${bTotal} ★**`

  lines.push(`| **TOTAL** | ${aTotalCell} | ${bTotalCell} |`)
  lines.push('')

  if (winner === 'tie') {
    lines.push(`**Result:** Tie`)
  } else {
    const winnerName = winner === 'modelA' ? nameA : nameB
    lines.push(`**Winner:** ${winnerName} (+${totalDiff} points)`)
  }

  const biggestGap = getBiggestGap(modelA, modelB)
  if (biggestGap) {
    lines.push(`**Biggest gap:** ${biggestGap.dim} (${biggestGap.gap} point difference)`)
  }

  lines.push('')
  lines.push(`*Dimension wins — ${nameA}: ${dimensionWins.modelA} | ${nameB}: ${dimensionWins.modelB}*`)

  return lines.join('\n')
}

export function printCompareTable(result: CompareResult): void {
  const { modelA, modelB, winner, totalDiff, dimensionWins } = result
  const nameA = modelA.modelResolved
  const nameB = modelB.modelResolved
  const provA = modelA.endpoint
  const provB = modelB.endpoint

  const COL_W = 18
  const pad = (s: string, w: number) => s.padEnd(w).slice(0, w)
  const padl = (s: string, w: number) => s.padStart(w).slice(0, w)

  const top    = `┌${'─'.repeat(COL_W)}┬${'─'.repeat(COL_W)}┬${'─'.repeat(COL_W)}┐`
  const mid    = `├${'─'.repeat(COL_W)}┼${'─'.repeat(COL_W)}┼${'─'.repeat(COL_W)}┤`
  const bot    = `└${'─'.repeat(COL_W)}┴${'─'.repeat(COL_W)}┴${'─'.repeat(COL_W)}┘`
  const row = (c1: string, c2: string, c3: string) =>
    `│${pad(c1, COL_W)}│${pad(c2, COL_W)}│${pad(c3, COL_W)}│`

  const colorA = (s: string) => winner === 'modelA' ? chalk.green(s) : winner === 'modelB' ? chalk.dim(s) : s
  const colorB = (s: string) => winner === 'modelB' ? chalk.green(s) : winner === 'modelA' ? chalk.dim(s) : s

  console.log()
  console.log(chalk.bold.white('  toolscore compare'))
  console.log()
  console.log(`  ${chalk.bold('Model A:')} ${chalk.cyan(nameA)}  ${chalk.gray(`(${provA})`)}`)
  console.log(`  ${chalk.bold('Model B:')} ${chalk.cyan(nameB)}  ${chalk.gray(`(${provB})`)}`)
  console.log()

  console.log('  ' + top)
  // Header row
  const hDim = ' Dimension'
  const hA = ' ' + nameA.slice(0, COL_W - 2)
  const hB = ' ' + nameB.slice(0, COL_W - 2)
  console.log('  ' + `│${chalk.bold(pad(hDim, COL_W))}│${colorA(chalk.bold(pad(hA, COL_W)))}│${colorB(chalk.bold(pad(hB, COL_W)))}│`)
  console.log('  ' + mid)

  for (const dim of DIMS) {
    const a = modelA.dimensions[dim]
    const b = modelB.dimensions[dim]
    if (!a || !b || a.total === 0) continue

    const aWins = a.score > b.score
    const bWins = b.score > a.score

    const aStr = ` ${a.pass}/${a.total} (${a.score}%)${aWins ? ' ★' : ''} `
    const bStr = ` ${b.pass}/${b.total} (${b.score}%)${bWins ? ' ★' : ''} `

    const dimCell = ` ${dim}`
    console.log(
      '  ' +
      `│${pad(dimCell, COL_W)}│${colorA(pad(aStr, COL_W))}│${colorB(pad(bStr, COL_W))}│`
    )
  }

  console.log('  ' + mid)

  // Total row
  const aWinsTotal = modelA.score > modelB.score
  const bWinsTotal = modelB.score > modelA.score
  const aTotalStr = ` ${modelA.stats.passed}/${modelA.stats.total} (${modelA.score}%)${aWinsTotal ? ' ★' : ''} `
  const bTotalStr = ` ${modelB.stats.passed}/${modelB.stats.total} (${modelB.score}%)${bWinsTotal ? ' ★' : ''} `
  console.log(
    '  ' +
    `│${pad(chalk.bold(' TOTAL'), COL_W)}│${colorA(chalk.bold(pad(aTotalStr, COL_W)))}│${colorB(chalk.bold(pad(bTotalStr, COL_W)))}│`
  )
  console.log('  ' + bot)
  console.log()

  if (winner === 'tie') {
    console.log(`  ${chalk.bold('Result:')} Tie — both models scored ${modelA.score}`)
  } else {
    const winnerName = winner === 'modelA' ? nameA : nameB
    console.log(`  ${chalk.bold('Winner:')} ${chalk.green(winnerName)} (+${totalDiff} points)`)
  }

  const biggestGap = getBiggestGap(modelA, modelB)
  if (biggestGap) {
    console.log(`  ${chalk.bold('Biggest gap:')} ${biggestGap.dim} (${biggestGap.gap} point difference)`)
  }

  console.log()
}

export async function runCompare(
  modelA: string,
  modelB: string,
  options: CompareOptions
): Promise<CompareResult> {
  const dims = options.dimension
    ? [options.dimension as Dimension]
    : undefined

  const runOptionsA: RunOptions = {
    model: modelA,
    apiKey: options.apiKeyA ?? options.apiKey,
    baseUrl: options.baseUrlA,
    dimensions: dims,
  }

  const runOptionsB: RunOptions = {
    model: modelB,
    apiKey: options.apiKeyB ?? options.apiKey,
    baseUrl: options.baseUrlB,
    dimensions: dims,
  }

  const [resultA, resultB] = await Promise.all([
    runBenchmark(runOptionsA),
    runBenchmark(runOptionsB),
  ])

  return buildCompareResult(resultA, resultB)
}
