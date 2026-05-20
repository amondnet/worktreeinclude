import type { ParsedPattern } from './patterns.ts'
import { mkdir, realpath } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

import { Glob } from 'bun'
import { filterGitIgnored, findRepoRoot } from './gitignore.ts'
import { parsePatterns } from './patterns.ts'

export interface CopyOptions {
  /** Directory containing the source files (typically the main checkout). */
  source: string
  /** Directory to copy into (typically the new worktree). */
  target: string
  /** Path to the `.worktreeinclude` file. Defaults to `<source>/.worktreeinclude`. */
  configPath?: string
  /** When true, walk the work but skip the actual file writes. */
  dryRun?: boolean
  /** When true, skip the `git check-ignore` verification step. */
  skipGitignoreCheck?: boolean
}

export interface CopyResult {
  copied: string[]
  /** Files matched by pattern but skipped because git does not ignore them. */
  skippedTracked: string[]
}

/**
 * Read `.worktreeinclude`, match files inside `source`, and copy the ones git
 * also ignores into `target`. Existing files are overwritten.
 */
export async function copyWorktreeIncludes(options: CopyOptions): Promise<CopyResult> {
  const { target, dryRun = false, skipGitignoreCheck = false } = options
  // Resolve symlinks so paths line up with what `git rev-parse --show-toplevel`
  // returns (notably /var → /private/var on macOS).
  const source = await realpath(options.source)
  const configPath = options.configPath ?? join(source, '.worktreeinclude')

  const configFile = Bun.file(configPath)
  if (!(await configFile.exists())) {
    return { copied: [], skippedTracked: [] }
  }
  const patterns = parsePatterns(await configFile.text())
  if (patterns.length === 0) {
    return { copied: [], skippedTracked: [] }
  }

  const matched = await resolveMatches(source, patterns)
  const sorted = [...matched].sort()

  let ignored: Set<string>
  if (skipGitignoreCheck) {
    ignored = new Set(sorted)
  }
  else {
    const repoRoot = (await findRepoRoot(source)) ?? source
    // git check-ignore wants paths relative to the repo root.
    const repoRelative = sorted.map(p => toPosix(relative(repoRoot, join(source, p))))
    const ignoredRepoRel = await filterGitIgnored(repoRoot, repoRelative)
    ignored = new Set(
      sorted.filter((_, i) => ignoredRepoRel.has(repoRelative[i]!)),
    )
  }

  const copied: string[] = []
  const skippedTracked: string[] = []

  for (const rel of sorted) {
    if (!ignored.has(rel)) {
      skippedTracked.push(rel)
      continue
    }
    const from = join(source, rel)
    const to = join(target, rel)
    if (!dryRun) {
      await mkdir(dirname(to), { recursive: true })
      await Bun.write(to, Bun.file(from))
    }
    copied.push(rel)
  }

  return { copied, skippedTracked }
}

/**
 * Apply patterns in order, honoring `!negation` rules, and return the set
 * of repo-relative POSIX paths still selected after all rules.
 */
async function resolveMatches(
  source: string,
  patterns: readonly ParsedPattern[],
): Promise<Set<string>> {
  const matched = new Set<string>()

  for (const pattern of patterns) {
    const glob = new Glob(pattern.glob)
    const hits: string[] = []
    for await (const file of glob.scan({
      cwd: source,
      dot: true,
      onlyFiles: true,
      followSymlinks: false,
    })) {
      hits.push(toPosix(file))
    }
    if (pattern.negate) {
      for (const hit of hits) matched.delete(hit)
    }
    else {
      for (const hit of hits) matched.add(hit)
    }
  }

  return matched
}

function toPosix(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/')
}
