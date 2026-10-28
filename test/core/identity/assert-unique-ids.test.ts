import { describe, expect, it } from 'vitest'

import type { FileMutants } from '../../../types/mutant/file-mutants'

import { assertUniqueIds } from '../../../core/identity/assert-unique-ids'
import { createMutant } from '../../helpers/create-mutant'

/**
 * Builds the result of a parsed file.
 *
 * @param file - Display path of the file.
 * @param source - Text of the file.
 * @param mutants - Ids and start offsets of its mutants.
 * @returns Result of the file.
 */
function createResult(
  file: string,
  source: string,
  mutants: [string, number][],
): FileMutants {
  return {
    mutants: mutants.map(([id, start]) =>
      createMutant({ replacement: '-', end: start + 1, start, file, id }),
    ),
    absolute: `/repo/${file}`,
    diagnostics: [],
    parsed: true,
    skipped: [],
    source,
    file,
  }
}

describe('assertUniqueIds', () => {
  it('accepts mutants with distinct ids and files without mutants', () => {
    let files = [
      createResult('src/a.ts', 'a + b', [
        ['aaaaaaaaaaaa', 0],
        ['bbbbbbbbbbbb', 2],
      ]),
      {
        absolute: '/repo/src/b.ts',
        file: 'src/b.ts',
        diagnostics: [],
        parsed: false,
        source: null,
        skipped: [],
        mutants: [],
      },
      createResult('src/c.ts', 'c + d', [['cccccccccccc', 2]]),
    ]

    expect(() => {
      assertUniqueIds(files)
    }).not.toThrow()
  })

  it('names both positions of a shared id', () => {
    let files = [
      createResult('src/a.ts', ['let x = 1', 'let y = a + b'].join('\n'), [
        ['aaaaaaaaaaaa', 0],
        ['shared000000', 20],
      ]),
      createResult('src/b.ts', '\r\n  c + d', [['shared000000', 4]]),
    ]

    expect(() => {
      assertUniqueIds(files)
    }).toThrow(
      new Error(
        'Mutant id shared000000 is shared by src/a.ts:2:11 and src/b.ts:2:3. This is a hash collision; please report it.',
      ),
    )
  })

  it('reports a shared id within one file', () => {
    let files = [
      createResult('src/a.ts', 'a + b + c', [
        ['shared000000', 0],
        ['shared000000', 6],
      ]),
    ]

    expect(() => {
      assertUniqueIds(files)
    }).toThrow(
      new Error(
        'Mutant id shared000000 is shared by src/a.ts:1:1 and src/a.ts:1:7. This is a hash collision; please report it.',
      ),
    )
  })
})
