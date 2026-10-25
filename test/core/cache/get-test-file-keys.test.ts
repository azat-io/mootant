import { describe, expect, it } from 'vitest'

import type { DryFile } from '../../../types/adapter/dry-file'

import { getTestFileKeys } from '../../../core/cache/get-test-file-keys'

/**
 * Builds a test file of a dry run.
 *
 * @param file - Absolute path.
 * @param fields - Fields that differ from the defaults.
 * @returns Test file.
 */
function createFile(file: string, fields: Partial<DryFile> = {}): DryFile {
  return {
    loadFailed: false,
    concurrent: false,
    loadDuration: 0,
    hookDuration: 0,
    project: '',
    covers: [],
    errors: [],
    hits: 0,
    file,
    ...fields,
  }
}

/**
 * Hashes of the files of the tests.
 */
let hashes = new Map<string, string | null>([
  ['/p/test/a.test.ts', 'a'],
  ['/p/test/b.test.ts', 'b'],
  ['/p/src/a.ts', 'x'],
  ['/p/src/b.ts', 'y'],
])

describe('getTestFileKeys', () => {
  it('keys test files by their dependencies, in any order', () => {
    let files = [
      createFile('/p/test/a.test.ts', {
        dependencies: ['/p/src/b.ts', '/p/src/a.ts'],
      }),
      createFile('/p/test/b.test.ts', { dependencies: ['/p/src/b.ts'] }),
    ]
    let keys = getTestFileKeys({
      mutated: new Set(),
      environment: 'e',
      variables: {},
      root: '/p',
      hashes,
      files,
    })
    let reordered = getTestFileKeys({
      files: [
        createFile('/p/test/a.test.ts', {
          dependencies: ['/p/src/a.ts', '/p/test/a.test.ts', '/p/src/b.ts'],
        }),
      ],
      mutated: new Set(),
      environment: 'e',
      variables: {},
      root: '/p',
      hashes,
    })
    let changed = getTestFileKeys({
      hashes: new Map([...hashes, ['/p/src/a.ts', 'z']]),
      mutated: new Set(),
      environment: 'e',
      variables: {},
      root: '/p',
      files,
    })

    expect([...keys.keys()]).toStrictEqual([
      '/p/test/a.test.ts',
      '/p/test/b.test.ts',
    ])
    expect(reordered.get('/p/test/a.test.ts')).toBe(
      keys.get('/p/test/a.test.ts'),
    )
    expect(changed.get('/p/test/a.test.ts')).not.toBe(
      keys.get('/p/test/a.test.ts'),
    )
    expect(changed.get('/p/test/b.test.ts')).toBe(keys.get('/p/test/b.test.ts'))
  })

  it('leaves the files mutants are listed from out of the keys', () => {
    /**
     * Builds the key of a test file that reads two sources, one of them
     * mutated, after one file got a new hash.
     *
     * @param changed - File whose hash changes, or null.
     * @returns Key of the test file.
     */
    function keyAfter(changed: string | null): undefined | string {
      return getTestFileKeys({
        files: [
          createFile('/p/test/a.test.ts', {
            dependencies: ['/p/src/a.ts', '/p/src/b.ts', '/p/test/a.test.ts'],
          }),
        ],
        hashes:
          changed === null ? hashes : new Map([...hashes, [changed, 'z']]),
        mutated: new Set(['/p/test/a.test.ts', '/p/src/a.ts']),
        environment: 'e',
        variables: {},
        root: '/p',
      }).get('/p/test/a.test.ts')
    }
    let key = keyAfter(null)

    expect(keyAfter('/p/src/a.ts')).toBe(key)
    expect(keyAfter('/p/src/b.ts')).not.toBe(key)
    expect(keyAfter('/p/test/a.test.ts')).not.toBe(key)
  })

  it('separates projects and environments', () => {
    let files = [
      createFile('/p/test/a.test.ts', { dependencies: [] }),
      createFile('/p/test/a.test.ts', { dependencies: [], project: 'web' }),
    ]
    let keys = getTestFileKeys({
      mutated: new Set(),
      environment: 'e',
      variables: {},
      root: '/p',
      hashes,
      files,
    })
    let other = getTestFileKeys({
      mutated: new Set(),
      environment: 'f',
      variables: {},
      root: '/p',
      hashes,
      files,
    })

    expect(keys.get('/p/test/a.test.ts')).not.toBe(
      keys.get('/p/test/a.test.ts\0web'),
    )
    expect(other.get('/p/test/a.test.ts')).not.toBe(
      keys.get('/p/test/a.test.ts'),
    )
  })

  it('keys test files by the environment variables they read', () => {
    let files = [
      createFile('/p/test/a.test.ts', {
        environment: ['MODE', 'UNSET'],
        dependencies: [],
      }),
      createFile('/p/test/b.test.ts', {
        environment: ['MODE'],
        dependencies: [],
        project: 'web',
      }),
      createFile('/p/test/c.test.ts', { dependencies: [] }),
    ]
    /**
     * Builds the keys with values of the variables.
     *
     * @param variables - Hashes of the variables of each project.
     * @returns Keys by test file key.
     */
    function keysWith(
      variables: Record<string, Record<string, string>>,
    ): Map<string, string> {
      return getTestFileKeys({
        mutated: new Set(),
        environment: 'e',
        root: '/p',
        variables,
        hashes,
        files,
      })
    }
    let keys = keysWith({ '': { OTHER: 'o1', MODE: 'm1' } })
    let other = keysWith({ '': { OTHER: 'o2', MODE: 'm1' } })
    let mode = keysWith({ '': { OTHER: 'o1', MODE: 'm2' } })
    let unset = keysWith({ '': { OTHER: 'o1', UNSET: 'u', MODE: 'm1' } })
    let reordered = getTestFileKeys({
      files: [
        createFile('/p/test/a.test.ts', {
          environment: ['UNSET', 'MODE', 'MODE'],
          dependencies: [],
        }),
      ],
      variables: { '': { MODE: 'm1' } },
      mutated: new Set(),
      environment: 'e',
      root: '/p',
      hashes,
    })

    expect(other).toStrictEqual(keys)
    expect(reordered.get('/p/test/a.test.ts')).toBe(
      keys.get('/p/test/a.test.ts'),
    )
    expect(mode.get('/p/test/a.test.ts')).not.toBe(
      keys.get('/p/test/a.test.ts'),
    )
    expect(unset.get('/p/test/a.test.ts')).not.toBe(
      keys.get('/p/test/a.test.ts'),
    )
    expect(mode.get('/p/test/b.test.ts\0web')).toBe(
      keys.get('/p/test/b.test.ts\0web'),
    )
    expect(mode.get('/p/test/c.test.ts')).toBe(keys.get('/p/test/c.test.ts'))
  })

  it('gives no key to test files without dependencies', () => {
    expect(
      getTestFileKeys({
        files: [
          createFile('/p/test/a.test.ts'),
          createFile('/p/test/b.test.ts', { dependencies: null }),
        ],
        mutated: new Set(),
        environment: 'e',
        variables: {},
        root: '/p',
        hashes,
      }).size,
    ).toBe(0)
  })
})
