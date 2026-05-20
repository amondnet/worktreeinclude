# worktreeinclude

[![CI](https://github.com/amondnet/worktreeinclude/actions/workflows/ci.yml/badge.svg)](https://github.com/amondnet/worktreeinclude/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/amondnet/worktreeinclude/graph/badge.svg)](https://codecov.io/gh/amondnet/worktreeinclude)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> Copy gitignored files matching `.worktreeinclude` patterns into a fresh git worktree.

A fresh `git worktree add` checkout never contains untracked files like `.env`,
`.env.local`, or `config/secrets.json` — and copying them by hand every time gets
old fast. `worktreeinclude` reads a `.worktreeinclude` file (using familiar
`.gitignore` syntax) and copies only files that are **both** pattern-matched
**and** gitignored, so tracked files are never duplicated.

The behavior mirrors [Claude Code's built-in `.worktreeinclude` support][cc], but
runs as a standalone CLI you can wire into any worktree workflow.

[cc]: https://docs.claude.com/en/docs/claude-code/

## Install

```bash
bun add -g @pleaseai/worktreeinclude
# or, without installing globally:
bunx @pleaseai/worktreeinclude <source> <target>
```

The installed binary is named `worktreeinclude`.

Requires [Bun](https://bun.sh) `>= 1.1` and `git` on `$PATH`.

## Usage

```text
worktreeinclude [options] <source> <target>

Options:
  -c, --config <path>   Path to the .worktreeinclude file
                        (default: <source>/.worktreeinclude)
  -n, --dry-run         Print what would be copied without writing
      --no-gitignore    Skip the git check-ignore verification step
  -q, --quiet           Suppress per-file output
  -h, --help            Show this help text
```

### Example

In your main checkout, create `.worktreeinclude`:

```gitignore
.env
.env.local
config/secrets.json
```

Add a new worktree and populate it:

```bash
git worktree add ../feature-x -b feature-x
worktreeinclude . ../feature-x
```

```text
copied .env
copied .env.local
copied config/secrets.json
3 file(s) copied, 0 skipped
```

### Hook it into `git worktree add`

A tiny wrapper makes the copy automatic:

```bash
#!/usr/bin/env bash
# git-wt: thin wrapper around `git worktree add`
set -euo pipefail
target="$1"; shift
git worktree add "$target" "$@"
worktreeinclude "$(git rev-parse --show-toplevel)" "$target"
```

Drop it on your `$PATH` as `git-wt` and use `git wt ../feature-x -b feature-x`.

## How it works

1. Parse `.worktreeinclude` using `.gitignore` syntax (negation, directory-only,
   rooted patterns are all supported).
2. Walk the source tree with [Bun's `Glob`][bun-glob] to find every file that
   matches a pattern.
3. Pipe the candidate list through `git check-ignore --stdin -z` in a single
   subprocess — only paths git would actually ignore survive.
4. Copy the survivors into the target worktree with `Bun.write`, preserving
   directory structure and overwriting any existing files.

[bun-glob]: https://bun.com/docs/runtime/glob

## Pattern syntax

`.worktreeinclude` uses the same rules as `.gitignore`:

| Pattern               | Matches                                    |
| --------------------- | ------------------------------------------ |
| `.env`                | `.env` at any depth                        |
| `config/secrets.json` | exactly `config/secrets.json` from root    |
| `/build`              | `build` only at the repo root              |
| `cache/`              | every file inside any directory named `cache` |
| `*.local`             | any `*.local` file at any depth            |
| `!keep.env`           | exclude `keep.env` from a prior match      |
| `# comment`           | comment, ignored                           |

## Library usage

`worktreeinclude` also exports its building blocks:

```ts
import { copyWorktreeIncludes } from '@pleaseai/worktreeinclude'

const result = await copyWorktreeIncludes({
  source: '/path/to/main/checkout',
  target: '/path/to/new/worktree',
  dryRun: false,
})

console.log(result.copied) // string[] — files copied (repo-relative)
console.log(result.skippedTracked) // string[] — matched but git tracks them
```

Other named exports: `parsePatterns`, `filterGitIgnored`, `findRepoRoot`.

## Development

```bash
bun install
bun test
bun run typecheck
bun run lint
```

Code style follows [`@pleaseai/eslint-config`][pleaseai].

[pleaseai]: https://github.com/pleaseai/code-style/tree/main/packages/eslint-config

## License

MIT © [Minsu Lee](https://github.com/amondnet)
