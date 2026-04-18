import { Command } from 'commander'
import chalk from 'chalk'
import { getHistory, clearHistory, dbPath } from '../core/history.js'

export function makeHistoryCommand(): Command {
  const cmd = new Command('history')
    .description('Show past toolscore run history')
    .option('-m, --model <model>', 'Filter by model name')
    .option('-n, --limit <number>', 'Number of runs to show (default: 10)', parseInt)
    .option('--json', 'Output as JSON')
    .option('--clear', 'Delete all stored run history')

  cmd.action((options) => {
    // Clear mode
    if (options.clear) {
      const deleted = clearHistory()
      console.log(chalk.green(`  Cleared ${deleted} run(s) from history`))
      console.log(chalk.gray(`  DB: ${dbPath()}`))
      return
    }

    const rows = getHistory({
      model: options.model,
      limit: options.limit ?? 10,
    })

    if (options.json) {
      console.log(JSON.stringify(rows, null, 2))
      return
    }

    console.log()
    console.log(chalk.bold('  toolscore history'))
    if (options.model) {
      console.log(chalk.gray(`  Filtering: ${options.model}`))
    }
    console.log()

    if (rows.length === 0) {
      console.log(chalk.gray('  No runs found. Run toolscore to record results.'))
      console.log()
      return
    }

    // Header
    console.log(
      chalk.gray('  ') +
      chalk.bold('Score'.padStart(6)) +
      chalk.bold('  Grade') +
      chalk.bold('  ' + 'Model'.padEnd(40)) +
      chalk.bold('  When')
    )
    console.log(chalk.gray('  ' + '─'.repeat(75)))

    for (const row of rows) {
      const score = row.score.toFixed(1).padStart(6)
      const grade = gradeColor(row.grade)(row.grade.padEnd(5))
      const model = row.model.length > 38
        ? row.model.slice(0, 35) + '...'
        : row.model.padEnd(38)
      const when = formatRelative(row.timestamp)

      console.log(
        chalk.gray('  ') +
        chalk.bold(score) +
        '  ' + grade +
        '  ' + chalk.cyan(model) +
        '  ' + chalk.gray(when)
      )
    }

    console.log()
    console.log(chalk.gray(`  ${rows.length} run(s) shown  ·  DB: ${dbPath()}`))
    console.log()
  })

  return cmd
}

function gradeColor(grade: string): (s: string) => string {
  switch (grade) {
    case 'A': return chalk.green
    case 'B': return chalk.cyan
    case 'C': return chalk.yellow
    case 'D': return chalk.yellow
    default:   return chalk.red
  }
}

function formatRelative(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffH < 24) return `${diffH}h ago`
  if (diffD < 7) return `${diffD}d ago`
  return new Date(iso).toISOString().slice(0, 10)
}
