import { describe, expect, test } from 'bun:test'

import { parsePatterns } from '../src/patterns.ts'

describe('parsePatterns', () => {
  test('strips blank lines and # comments', () => {
    const result = parsePatterns([
      '',
      '# a comment',
      '.env',
      '   ',
      '## another comment',
    ].join('\n'))
    expect(result).toHaveLength(1)
    expect(result[0]!.glob).toBe('**/.env')
  })

  test('bare filename matches at any depth', () => {
    expect(parsePatterns('.env')[0]!.glob).toBe('**/.env')
    expect(parsePatterns('.env')[0]!.negate).toBe(false)
  })

  test('path with slash anchors to root', () => {
    expect(parsePatterns('config/secrets.json')[0]!.glob)
      .toBe('config/secrets.json')
  })

  test('leading slash strips the slash but stays rooted', () => {
    expect(parsePatterns('/root.env')[0]!.glob).toBe('root.env')
  })

  test('directory-only patterns become recursive globs', () => {
    const result = parsePatterns('cache/')
    expect(result[0]!.glob).toBe('**/cache/**')
    expect(result[0]!.directoryOnly).toBe(true)
  })

  test('rooted directory pattern keeps anchor', () => {
    const result = parsePatterns('/tmp/')
    expect(result[0]!.glob).toBe('tmp/**')
    expect(result[0]!.directoryOnly).toBe(true)
  })

  test('negation flag is captured', () => {
    const result = parsePatterns('!.env.example')
    expect(result[0]!.negate).toBe(true)
    expect(result[0]!.glob).toBe('**/.env.example')
  })

  test('escaped hash is treated literally', () => {
    const result = parsePatterns('\\#weird')
    expect(result[0]!.glob).toBe('**/#weird')
  })
})
