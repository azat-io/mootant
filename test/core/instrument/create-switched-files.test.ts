import { describe, expect, it } from 'vitest'

import { createSwitchedFiles } from '../../../core/instrument/create-switched-files'
import { createMutant } from '../../helpers/create-mutant'

describe('createSwitchedFiles', () => {
  it('switches files with pending mutants and hosts only those', () => {
    expect(
      createSwitchedFiles([
        {
          mutants: [
            createMutant({ replacement: '2', start: 8, end: 9 }),
            createMutant({
              status: 'Ignored',
              start: 12,
              id: 'm2',
              end: 13,
            }),
          ],
          source: 'let a = 1 + 3',
          absolute: '/root/a.ts',
          file: 'a.ts',
        },
      ]),
    ).toStrictEqual({
      switched: [
        {
          switched: 'let a = (globalThis.__mootant?.hit("m1") ? (2) : (1)) + 3',
          original: 'let a = 1 + 3',
          file: '/root/a.ts',
        },
      ],
      diagnostics: [],
    })
  })

  it('leaves out unread files and files without pending mutants', () => {
    expect(
      createSwitchedFiles([
        {
          mutants: [createMutant({ start: 0, end: 1 })],
          absolute: '/root/a.ts',
          source: null,
          file: 'a.ts',
        },
        {
          mutants: [createMutant({ status: 'Ignored', start: 0, end: 1 })],
          absolute: '/root/b.ts',
          file: 'b.ts',
          source: 'a',
        },
        { absolute: '/root/c.ts', file: 'c.ts', source: 'a', mutants: [] },
      ]),
    ).toStrictEqual({ diagnostics: [], switched: [] })
  })

  it('reports a file whose mutants cannot be hosted and goes on', () => {
    expect(
      createSwitchedFiles([
        {
          mutants: [
            createMutant({ start: 0, end: 5 }),
            createMutant({ start: 3, id: 'm2', end: 7 }),
          ],
          absolute: '/root/a.ts',
          source: 'let a = 1',
          file: 'a.ts',
        },
        {
          mutants: [createMutant({ start: 0, end: 1 })],
          absolute: '/root/b.ts',
          file: 'b.ts',
          source: 'a',
        },
      ]),
    ).toStrictEqual({
      diagnostics: [
        {
          message:
            'Cannot host the mutants of a.ts. Mutant ranges of example.ts overlap at 3.',
          code: 'instrument-error',
          severity: 'error',
          column: null,
          file: 'a.ts',
          line: null,
        },
      ],
      switched: [
        {
          switched: ';(globalThis.__mootant?.hit("m1") ? (x) : (a))',
          file: '/root/b.ts',
          original: 'a',
        },
      ],
    })
  })
})
