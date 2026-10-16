import { describe, expect, it } from 'vitest'

import { resolveMutantIds } from '../../../core/identity/resolve-mutant-ids'

/**
 * Mutants whose ids share prefixes.
 */
const MUTANTS = [
  { id: 'k3m9x2p7q4w8', file: 'src/a.ts' },
  { id: 'k3m9y5d1a2b3', file: 'src/a.ts' },
  { id: 'a8d2c4e6f8g0', file: 'src/b.ts' },
  { file: 'src/b.ts', id: 'ab' },
]

describe('resolveMutantIds', () => {
  it('keeps full ids and completes unique prefixes in the given order', () => {
    expect(
      resolveMutantIds(['a8d2', 'k3m9y', 'k3m9x2p7q4w8', 'ab'], MUTANTS),
    ).toStrictEqual(['a8d2c4e6f8g0', 'k3m9y5d1a2b3', 'k3m9x2p7q4w8', 'ab'])
  })

  it('rejects a prefix shorter than four characters', () => {
    expect(() => resolveMutantIds(['k3m'], MUTANTS)).toThrow(
      'Mutant id "k3m" is too short: give at least 4 characters.',
    )
  })

  it('rejects a prefix of no mutant', () => {
    expect(() => resolveMutantIds(['zzzz'], MUTANTS)).toThrow(
      'Unknown mutant id "zzzz".',
    )
  })

  it('names the mutants of an ambiguous prefix', () => {
    expect(() => resolveMutantIds(['k3m9'], MUTANTS)).toThrow(
      'Mutant id "k3m9" matches 2 mutants; give more characters:\n  k3m9x2p7q4w8  src/a.ts\n  k3m9y5d1a2b3  src/a.ts',
    )
  })

  it('names five candidates and counts the others', () => {
    let mutants = Array.from({ length: 7 }, (_value, index) => ({
      id: `abcd${index}`,
      file: 'src/c.ts',
    }))

    expect(() => resolveMutantIds(['abcd'], mutants)).toThrow(
      /abcd4 {2}src\/c\.ts\n {2}and 2 more$/u,
    )
  })
})
