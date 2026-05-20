export interface ParsedPattern {
  /** The original line as written in the file (after trimming trailing CR). */
  raw: string
  /** Glob pattern usable with Bun's Glob, in POSIX-style forward slashes. */
  glob: string
  /** True when the rule is a negation (`!foo` in gitignore syntax). */
  negate: boolean
  /** True when the pattern only matches directories (trailing slash). */
  directoryOnly: boolean
}

/**
 * Parse a `.worktreeinclude` file body into a list of patterns.
 * Empty lines and `#`-prefixed comments are skipped.
 * Returned patterns preserve source order; negations apply to whatever
 * matched earlier in the list.
 */
export function parsePatterns(source: string): ParsedPattern[] {
  const out: ParsedPattern[] = []
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '')
    if (line === '' || line.startsWith('#')) continue
    const parsed = parseLine(line)
    if (parsed) out.push(parsed)
  }
  return out
}

function parseLine(line: string): ParsedPattern | null {
  let body = line
  const negate = body.startsWith('!')
  if (negate) body = body.slice(1)

  // A leading `\#` escapes a literal `#` in gitignore syntax.
  if (body.startsWith('\\#')) body = body.slice(1)

  const directoryOnly = body.endsWith('/') && body !== '/'
  if (directoryOnly) body = body.slice(0, -1)

  const rooted = body.startsWith('/')
  if (rooted) body = body.slice(1)

  if (body === '') return null

  // A pattern with a slash anywhere in the middle is relative to the file root.
  // A pattern without slashes matches at any depth (gitignore semantics).
  const hasSlash = body.includes('/')
  let glob = hasSlash || rooted ? body : `**/${body}`

  if (directoryOnly) glob = `${glob}/**`

  return {
    raw: line,
    glob,
    negate,
    directoryOnly,
  }
}
