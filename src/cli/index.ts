import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { runBenchmark } from '../core/runner.js'
import { printScorecard, printProgress, clearProgress, toJSON, toMarkdown, toBadgeUrl, printVerboseCases } from '../reporter/index.js'
import { getCaseCounts, getAllCases } from '../cases/index.js'
import { parseModel } from '../providers/index.js'
import type { Dimension, RunOptions } from '../types/index.js'
import { VERSION } from '../version.js'
import { saveRun } from '../core/history.js'
import { makeHistoryCommand } from './history.js'
import fs from 'fs'
import path from 'path'

const program = new Command()

program
  .name('toolscore')
  .description('Benchmark LLM tool-calling reliability against any OpenAI-compatible endpoint')
  .version(VERSION)

// Register subcommands
program.addCommand(makeHistoryCommand())

program
  .option('-m, --model <model>', 'Model to benchmark (e.g. ollama/llama3.1:8b, openai/gpt-4o)')
  .option('-k, --api-key <key>', 'API key (overrides environment variable)')
  .option('-b, --base-url <url>', 'Custom API base URL')
  .option('-d, --dimension <dim>', 'Run only this dimension (selection, args, parallel, refusal, recovery)')
  .option('-n, --cases <number>', 'Number of test cases to run (default: all)', parseInt)
  .option('-t, --timeout <seconds>', 'Timeout per case in seconds (default: 30)', parseInt)
  .option('-c, --concurrency <number>', 'Concurrent requests (default: 3)', parseInt)
  .option('-f, --format <format>', 'Output format: terminal (default), json, markdown, badge')
  .option('-o, --output <file>', 'Save results to file')
  .option('--dry-run', 'Show what would run without calling the API')
  .option('--list-cases', 'List test case counts per dimension')
  .option('--verbose', 'Show per-case results')
  .option('--fail-below <score>', 'Exit with code 1 if score is below this threshold', parseInt)

program.action(async (options) => {
  // List cases mode
  if (options.listCases) {
    printCaseList()
    return
  }

  if (!options.model) {
    console.error(chalk.red('Error: --model is required'))
    console.log()
    console.log('Examples:')
    console.log('  toolscore --model ollama/llama3.1:8b')
    console.log('  toolscore --model openai/gpt-4o')
    console.log('  toolscore --model openrouter/anthropic/claude-3-haiku')
    console.log('  toolscore --model ollama/llama3.1:8b --dry-run')
    console.log()
    process.exit(1)
  }

  const dims = options.dimension
    ? [options.dimension as Dimension]
    : undefined

  const runOptions: RunOptions = {
    model: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    dimensions: dims,
    cases: options.cases,
    timeout: options.timeout ?? 30,
    concurrency: options.concurrency ?? 3,
    dryRun: options.dryRun,
    verbose: options.verbose,
  }

  // Dry run mode
  if (options.dryRun) {
    printDryRun(runOptions)
    return
  }

  // Show header
  const config = parseModel(options.model, { apiKey: options.apiKey, baseUrl: options.baseUrl })
  console.log()
  console.log(
    chalk.bold.white('  toolscore') +
    chalk.gray(' v' + VERSION) +
    chalk.gray('  —  Tool Calling Benchmark')
  )
  console.log()
  console.log(`  ${chalk.bold('Model:')} ${chalk.cyan(config.model)} ${chalk.gray(`(${config.providerName})`)}`)

  const spinner = ora({
    text: 'Starting benchmark...',
    prefixText: '  ',
    color: 'cyan',
  })

  let caseTotal = 0
  let caseDone = 0

  try {
    const result = await runBenchmark(runOptions, {
      onStart: (total, model, endpoint) => {
        caseTotal = total
        console.log(`  ${chalk.bold('Cases:')} ${total} | ${chalk.bold('Concurrency:')} ${runOptions.concurrency ?? 3} | ${chalk.bold('Timeout:')} ${runOptions.timeout ?? 30}s`)
        console.log()
        spinner.start('Running...')
      },
      onCaseStart: (caseId, index) => {
        if (spinner.isSpinning) {
          spinner.text = `Running... ${index + 1}/${caseTotal}  ${chalk.gray(caseId)}`
        }
      },
      onCaseEnd: (caseResult) => {
        caseDone++
        const icon = caseResult.pass ? chalk.green('✓') : chalk.red('✗')
        if (spinner.isSpinning) {
          spinner.text = `${icon} ${caseDone}/${caseTotal}  ${chalk.gray(caseResult.id)}`
        }
      },
    })

    spinner.stop()
    clearProgress()

    // Auto-save to history
    try {
      saveRun(result)
    } catch {
      // Never let history errors break the main flow
    }

    // Output based on format
    const format = options.format ?? 'terminal'

    if (format === 'json') {
      const json = toJSON(result)
      if (options.output) {
        fs.writeFileSync(options.output, json, 'utf8')
        console.log(chalk.green(`Results saved to ${options.output}`))
      } else {
        console.log(json)
      }
    } else if (format === 'markdown') {
      const md = toMarkdown(result)
      if (options.output) {
        fs.writeFileSync(options.output, md, 'utf8')
        console.log(chalk.green(`Results saved to ${options.output}`))
      } else {
        console.log(md)
      }
    } else if (format === 'badge') {
      const url = toBadgeUrl(result)
      console.log(`![toolscore: ${result.score}](${url})`)
    } else {
      // Terminal format
      printScorecard(result)

      if (options.verbose) {
        printVerboseCases(result.cases)
      }

      // Save to file if requested
      if (options.output) {
        const ext = path.extname(options.output).toLowerCase()
        let content: string
        if (ext === '.md' || ext === '.markdown') {
          content = toMarkdown(result)
        } else {
          content = toJSON(result)
        }
        fs.mkdirSync(path.dirname(options.output) || '.', { recursive: true })
        fs.writeFileSync(options.output, content, 'utf8')
        console.log(chalk.gray(`  Saved: ${options.output}`))
        console.log()
      } else {
        // Auto-save to toolscore-results/
        const resultsDir = 'toolscore-results'
        fs.mkdirSync(resultsDir, { recursive: true })
        const filename = path.join(resultsDir, `${result.runId}.json`)
        fs.writeFileSync(filename, toJSON(result), 'utf8')
        console.log(chalk.gray(`  Saved: ${filename}`))
        console.log()
      }
    }

    // Check threshold
    if (options.failBelow !== undefined && result.score < options.failBelow) {
      console.log(chalk.red(`  Score ${result.score} is below threshold ${options.failBelow} — failing`))
      process.exit(1)
    }

  } catch (err) {
    spinner.stop()
    const msg = err instanceof Error ? err.message : String(err)
    console.error()
    console.error(chalk.red(`  Error: ${msg}`))

    // Better error messages for common issues
    if (msg.includes('ECONNREFUSED') && options.model.startsWith('ollama/')) {
      console.error(chalk.yellow('  → Ollama is not running. Start it with: ollama serve'))
    } else if (msg.includes('401') || msg.includes('Unauthorized')) {
      console.error(chalk.yellow('  → Check your API key'))
    } else if (msg.includes('404') && options.model.startsWith('ollama/')) {
      const modelName = options.model.replace('ollama/', '')
      console.error(chalk.yellow(`  → Model not found. Try: ollama pull ${modelName}`))
    }

    console.error()
    process.exit(1)
  }
})

function printCaseList(): void {
  const counts = getCaseCounts()
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  console.log()
  console.log(chalk.bold('  toolscore test cases'))
  console.log()

  const dims: Dimension[] = ['selection', 'args', 'parallel', 'refusal', 'recovery']
  const labels = { selection: 'Selection', args: 'Arg Accuracy', parallel: 'Parallel', refusal: 'Refusal', recovery: 'Recovery' }

  for (const dim of dims) {
    const count = counts[dim]
    console.log(`  ${chalk.cyan(labels[dim].padEnd(14))}  ${count} cases`)
  }

  console.log()
  console.log(`  ${chalk.bold('Total:')} ${total} cases`)
  console.log()
}

function printDryRun(options: RunOptions): void {
  const config = parseModel(options.model, { apiKey: options.apiKey, baseUrl: options.baseUrl })
  const cases = getAllCases()

  const dims = options.dimensions
    ? cases.filter(c => options.dimensions!.includes(c.dimension as Dimension))
    : cases

  console.log()
  console.log(chalk.bold.white('  toolscore dry-run'))
  console.log()
  console.log(`  ${chalk.bold('Model:')} ${chalk.cyan(config.model)} ${chalk.gray(`(${config.providerName})`)}`)
  console.log(`  ${chalk.bold('Endpoint:')} ${chalk.gray(config.baseURL)}`)
  console.log(`  ${chalk.bold('Cases:')} ${dims.length}`)
  console.log()
  console.log(chalk.gray('  Cases that would run:'))
  console.log()

  for (const c of dims.slice(0, 20)) {
    const diff = c.difficulty ? chalk.gray(`[${c.difficulty}]`) : ''
    console.log(`  ${chalk.cyan(c.dimension.padEnd(10))}  ${c.id.padEnd(10)}  ${c.prompt.slice(0, 50)}${c.prompt.length > 50 ? '…' : ''}  ${diff}`)
  }

  if (dims.length > 20) {
    console.log(chalk.gray(`  ... and ${dims.length - 20} more`))
  }

  console.log()
}

program.parse()
