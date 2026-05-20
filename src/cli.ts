#!/usr/bin/env bun
import type { ParseArgsConfig } from 'node:util'
import { resolve } from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { copyWorktreeIncludes } from './copy.ts'

const USAGE = `Usage: worktreeinclude [options] <source> <target>

Copy gitignored files matching .worktreeinclude patterns from <source>
into <target>. Only files that match a pattern AND are gitignored are
copied, so tracked files are never duplicated.

Options:
  -c, --config <path>   Path to the .worktreeinclude file
                        (default: <source>/.worktreeinclude)
  -n, --dry-run         Print what would be copied without writing
      --no-gitignore    Skip the git check-ignore verification step
  -q, --quiet           Suppress per-file output
  -h, --help            Show this help text
`

const OPTIONS = {
  'config': { type: 'string', short: 'c' },
  'dry-run': { type: 'boolean', short: 'n' },
  'no-gitignore': { type: 'boolean' },
  'quiet': { type: 'boolean', short: 'q' },
  'help': { type: 'boolean', short: 'h' },
} satisfies ParseArgsConfig['options']

async function main(argv: readonly string[]): Promise<number> {
  let parsed: ReturnType<typeof parseArgs>
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: OPTIONS,
    })
  }
  catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${USAGE}`)
    return 2
  }

  const values = parsed.values as {
    'config'?: string
    'dry-run'?: boolean
    'no-gitignore'?: boolean
    'quiet'?: boolean
    'help'?: boolean
  }

  if (values.help) {
    process.stdout.write(USAGE)
    return 0
  }

  const [source, target, ...rest] = parsed.positionals
  if (!source || !target || rest.length > 0) {
    process.stderr.write(`error: expected <source> <target>\n\n${USAGE}`)
    return 2
  }

  const dryRun = values['dry-run'] ?? false
  const result = await copyWorktreeIncludes({
    source: resolve(source),
    target: resolve(target),
    configPath: values.config ? resolve(values.config) : undefined,
    dryRun,
    skipGitignoreCheck: values['no-gitignore'] ?? false,
  })

  if (!values.quiet) {
    for (const file of result.copied) {
      process.stdout.write(`${dryRun ? 'would copy' : 'copied'} ${file}\n`)
    }
    for (const file of result.skippedTracked) {
      process.stderr.write(`skipped (tracked) ${file}\n`)
    }
  }
  process.stdout.write(
    `${result.copied.length} file(s) ${dryRun ? 'would be copied' : 'copied'}, ${result.skippedTracked.length} skipped\n`,
  )
  return 0
}

const exitCode = await main(process.argv.slice(2))
process.exit(exitCode)
