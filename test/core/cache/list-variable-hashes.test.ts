import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'

import { listVariableHashes } from '../../../core/cache/list-variable-hashes'

/**
 * Reads the hash `*` stands for in an environment.
 *
 * @param environment - Environment variables.
 * @returns Hash under `*`.
 */
function hashAll(environment: NodeJS.ProcessEnv): string | null {
  let hashes = new Map(listVariableHashes([], environment))
  return hashes.get('*')!
}

/**
 * Hashes a value as the saved dry run does.
 *
 * @param value - Value of a variable.
 * @returns SHA-256 in hex.
 */
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

describe('listVariableHashes', () => {
  it('hashes the names test code read, set or not, and every variable under *', () => {
    let hashes = listVariableHashes(['B', 'PWD', 'A', '*', 'A'], {
      PWD: '/project',
      OTHER: 'x',
      A: '1',
    })

    expect(hashes.map(([name]) => name)).toStrictEqual(['*', 'A', 'B', 'PWD'])
    expect(hashes.slice(1)).toStrictEqual([
      ['A', hash('1')],
      ['B', null],
      ['PWD', hash('/project')],
    ])
    expect(hashes[0]![1]).toMatch(/^[\da-f]{64}$/u)
  })

  it('changes * with any variable but those that change from shell to shell', () => {
    let first = hashAll({ UNSET: undefined, OTHER: 'x', PWD: '/a', _: 'a' })

    expect(hashAll({ OTHER: 'x', SHLVL: '2', PWD: '/b' })).toBe(first)
    expect(hashAll({ OTHER: 'y', PWD: '/a' })).not.toBe(first)
    expect(hashAll({ OTHER: 'x', NEW: '' })).not.toBe(first)
    expect(hashAll({})).not.toBe(first)
  })
})
