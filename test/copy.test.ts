import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { copyWorktreeIncludes } from '../src/copy.ts'

interface Fixture {
  source: string
  target: string
  cleanup: () => Promise<void>
}

async function createFixture(files: Record<string, string>): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'worktreeinclude-'))
  const source = join(root, 'source')
  const target = join(root, 'target')

  for (const [rel, body] of Object.entries(files)) {
    await Bun.write(join(source, rel), body)
  }

  // Bootstrap a real git repo so check-ignore has something to work with.
  await Bun.spawn(['git', 'init', '-q', '-b', 'main'], { cwd: source }).exited
  await Bun.spawn(['git', 'config', 'user.email', 'test@example.com'], { cwd: source }).exited
  await Bun.spawn(['git', 'config', 'user.name', 'Test'], { cwd: source }).exited
  await Bun.spawn(['git', 'add', '.'], { cwd: source }).exited
  await Bun.spawn(['git', 'commit', '-q', '-m', 'init', '--allow-empty'], { cwd: source }).exited

  return {
    source,
    target,
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

describe('copyWorktreeIncludes', () => {
  let fixture: Fixture

  beforeAll(async () => {
    fixture = await createFixture({
      '.gitignore': '.env\n.env.local\nconfig/secrets.json\ntracked-but-listed.txt-NOT\n',
      '.worktreeinclude': '.env\n.env.local\nconfig/secrets.json\ntracked-but-listed.txt\n',
      '.env': 'API_KEY=root',
      '.env.local': 'DB=local',
      'config/secrets.json': '{"token":"xyz"}',
      'tracked-but-listed.txt': 'this file IS tracked',
      'src/app.ts': 'export const app = true',
    })
  })

  afterAll(() => fixture.cleanup())

  test('copies files that are both pattern-matched AND gitignored', async () => {
    const result = await copyWorktreeIncludes({
      source: fixture.source,
      target: fixture.target,
    })

    expect(result.copied.sort()).toEqual([
      '.env',
      '.env.local',
      'config/secrets.json',
    ])
    expect(result.skippedTracked).toEqual(['tracked-but-listed.txt'])
  })

  test('actually wrote the files with matching contents', async () => {
    const env = await Bun.file(join(fixture.target, '.env')).text()
    const secret = await Bun.file(join(fixture.target, 'config/secrets.json')).text()
    expect(env).toBe('API_KEY=root')
    expect(secret).toBe('{"token":"xyz"}')
  })

  test('did NOT copy tracked source files', async () => {
    expect(await Bun.file(join(fixture.target, 'src/app.ts')).exists()).toBe(false)
  })
})

describe('copyWorktreeIncludes (dry run)', () => {
  test('reports matches without writing files', async () => {
    const f = await createFixture({
      '.gitignore': '.env\n',
      '.worktreeinclude': '.env\n',
      '.env': 'X=1',
    })

    try {
      const result = await copyWorktreeIncludes({
        source: f.source,
        target: f.target,
        dryRun: true,
      })
      expect(result.copied).toEqual(['.env'])
      expect(await Bun.file(join(f.target, '.env')).exists()).toBe(false)
    }
    finally {
      await f.cleanup()
    }
  })
})

describe('copyWorktreeIncludes (negation)', () => {
  test('!pattern excludes earlier matches', async () => {
    const f = await createFixture({
      '.gitignore': '*.env\n',
      '.worktreeinclude': '*.env\n!keep.env\n',
      'prod.env': 'PROD=1',
      'keep.env': 'KEEP=1',
    })

    try {
      const result = await copyWorktreeIncludes({
        source: f.source,
        target: f.target,
        skipGitignoreCheck: true,
      })
      expect(result.copied.sort()).toEqual(['prod.env'])
    }
    finally {
      await f.cleanup()
    }
  })
})

describe('copyWorktreeIncludes (no config)', () => {
  test('returns empty result when .worktreeinclude is missing', async () => {
    const f = await createFixture({
      '.gitignore': '.env\n',
      '.env': 'X=1',
    })
    try {
      const result = await copyWorktreeIncludes({
        source: f.source,
        target: f.target,
      })
      expect(result.copied).toEqual([])
      expect(result.skippedTracked).toEqual([])
    }
    finally {
      await f.cleanup()
    }
  })
})
