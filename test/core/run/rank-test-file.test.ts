import { describe, expect, it } from 'vitest'

import { rankTestFile } from '../../../core/run/rank-test-file'

/**
 * Ranks a test file of a project at `/p` that imports nothing.
 *
 * @param module - Path of the module relative to the project root.
 * @param file - Path of the test file relative to the project root.
 * @param imports - Absolute paths the test file imports.
 * @returns Rank of the test file.
 */
function rank(module: string, file: string, imports: string[] = []): number {
  return rankTestFile(`/p/${module}`, `/p/${file}`, { root: '/p', imports })
}

describe('rankTestFile', () => {
  it('ranks a test file named after the module in a mirrored path first', () => {
    expect(
      [
        'src/a/b.test.ts',
        'src/a/b.spec.tsx',
        'src/a/__tests__/b.test.ts',
        'test/a/b.test.ts',
        'tests/src/a/b.test.ts',
        'test/a/__tests__/b.test.ts',
        'b.test.ts',
      ].map(file => rank('src/a/b.ts', file)),
    ).toStrictEqual([0, 0, 0, 0, 0, 0, 3])
    expect(rank('core/a/b.ts', 'test/core/a/b.test.ts')).toBe(0)
    expect(rank('packages/x/src/b.ts', 'packages/x/test/b.test.ts')).toBe(0)
  })

  it('ranks a test file named after the module elsewhere second when it imports the module', () => {
    let files = [
      'test/other/b.test.ts',
      'src/b.test.ts',
      'lib/a/b.test.ts',
      'test/a/b/c.test.ts',
    ]

    expect(
      files.map(file => rank('src/a/b.ts', file, ['/p/src/a/b'])),
    ).toStrictEqual([1, 1, 1, 2])
    expect(files.map(file => rank('src/a/b.ts', file))).toStrictEqual([
      3, 3, 3, 4,
    ])
  })

  it('ranks a test file of a module of the same name elsewhere after direct importers', () => {
    expect(rank('src/a/utils.ts', 'test/b/utils.test.ts')).toBe(3)
    expect(rank('packages/a/src/foo.ts', 'packages/b/test/foo.test.ts')).toBe(3)
    expect(
      rank('packages/a/src/foo.ts', 'packages/b/test/foo.test.ts', [
        '/p/packages/a/src/foo.ts',
      ]),
    ).toBe(1)
  })

  it('compares names without extensions and test suffixes', () => {
    expect(rank('src/badge.vue', 'test/badge.test.ts')).toBe(0)
    expect(rank('src/stars.svelte', 'test/stars.test.ts')).toBe(0)
    expect(rank('src/tally.svelte.ts', 'test/tally.test.ts')).toBe(0)
    expect(rank('src/tally.svelte.ts', 'test/tally.svelte.test.ts')).toBe(0)
    expect(rank('src/b.ts', 'test/b.ts')).toBe(0)
    expect(rank('src/b.ts', 'test/b.screens.test.ts')).toBe(4)
    expect(rank('src/b.test-utils.ts', 'test/b.test.ts')).toBe(4)
  })

  it('names an index module by its directory or by index in a mirrored path', () => {
    expect(
      [
        'test/cli.test.ts',
        'test/cli/index.test.ts',
        'test/other/index.test.ts',
        'test/other/cli.test.ts',
      ].map(file => rank('cli/index.ts', file)),
    ).toStrictEqual([0, 0, 4, 3])
  })

  it('ranks a test file that imports the module directly third', () => {
    let module = 'src/a/b.ts'

    expect(rank(module, 'test/x.test.ts', ['/p/src/a/b.ts'])).toBe(2)
    expect(rank(module, 'test/x.test.ts', ['/p/src/a/b.js'])).toBe(2)
    expect(rank(module, 'test/x.test.ts', ['/p/src/a/b'])).toBe(2)
    expect(rank(module, 'test/x.test.ts', ['/p/src/a/c', '/p/src/a'])).toBe(4)
    expect(rank('src/a/index.ts', 'test/x.test.ts', ['/p/src/a'])).toBe(2)
    expect(rank('src/a/index.ts', 'test/x.test.ts', ['/p/src/a/index'])).toBe(2)
    expect(
      rank('src/a/index.ts', 'test/x.test.ts', ['/p/src/a/index.js']),
    ).toBe(2)
    expect(rank('src/c.vue', 'test/x.test.ts', ['/p/src/c.vue'])).toBe(2)
    expect(rank('src/c.vue', 'test/x.test.ts', ['/p/src/c'])).toBe(4)
  })

  it('keeps a module and the index module of a directory of the same name apart', () => {
    expect(rank('src/a/index.ts', 'test/x.test.ts', ['/p/src/a.ts'])).toBe(4)
    expect(rank('src/a/index.ts', 'test/x.test.ts', ['/p/src/a.js'])).toBe(4)
    expect(rank('src/a.ts', 'test/x.test.ts', ['/p/src/a/index.ts'])).toBe(4)
    expect(rank('src/a.ts', 'test/x.test.ts', ['/p/src/a/index'])).toBe(4)
    expect(rank('src/a.ts', 'test/x.test.ts', ['/p/src/a'])).toBe(2)
  })
})
