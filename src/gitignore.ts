/**
 * Filter a list of repo-relative paths down to the ones git would actually
 * ignore in the given repository. Uses `git check-ignore --stdin` so we can
 * verify hundreds of paths in a single subprocess.
 *
 * Paths must be POSIX-style and relative to `repoRoot`.
 */
export async function filterGitIgnored(
  repoRoot: string,
  paths: readonly string[],
): Promise<Set<string>> {
  if (paths.length === 0) return new Set()

  const proc = Bun.spawn(
    ['git', 'check-ignore', '--stdin', '-z'],
    {
      cwd: repoRoot,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  // `-z` requires NUL-terminated input *and* NUL-separated output.
  const writer = proc.stdin
  writer.write(paths.join('\0') + '\0')
  await writer.end()

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  // `git check-ignore` exit codes:
  //   0 → one or more paths matched (ignored)
  //   1 → no paths matched (none ignored)
  //   128 → fatal error (not in a repo, bad args, ...)
  if (exitCode === 128) {
    throw new Error(`git check-ignore failed: ${stderr.trim() || 'unknown error'}`)
  }

  if (stdout === '') return new Set()

  const ignored = stdout
    .split('\0')
    .filter((p): p is string => p.length > 0)

  return new Set(ignored)
}

/**
 * Resolve the top-level directory of the git repo containing `cwd`.
 * Returns `null` when `cwd` is not inside a git working tree.
 */
export async function findRepoRoot(cwd: string): Promise<string | null> {
  const proc = Bun.spawn(
    ['git', 'rev-parse', '--show-toplevel'],
    { cwd, stdout: 'pipe', stderr: 'pipe' },
  )
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ])
  if (exitCode !== 0) return null
  const root = stdout.trim()
  return root === '' ? null : root
}
