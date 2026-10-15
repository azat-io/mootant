import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

import { getSyntaxFingerprint } from '../../helpers/get-syntax-fingerprint'
import { instrumentFile } from '../../../core/instrument/instrument-file'
import { compareCodeUnits } from '../../../core/compare-code-units'
import expectations from '../../fixtures/list/expectations.json'
import { generateMutants } from '../../helpers/generate-mutants'
import { createMutant } from '../../helpers/create-mutant'

describe('instrumentFile', () => {
  it('returns the text as is without mutants', () => {
    expect(
      instrumentFile({ file: 'example.ts', source: 'let =', mutants: [] }),
    ).toBe('let =')
  })

  it('hosts every range and keeps the text between them', () => {
    let source = ['let a = 1', 'a++', 'run(a)'].join('\n')

    expect(
      instrumentFile({
        mutants: [
          createMutant({ replacement: 'a--', start: 10, end: 13 }),
          createMutant({ replacement: '0', start: 8, id: 'm2', end: 9 }),
        ],
        file: 'example.ts',
        source,
      }),
    ).toBe(
      [
        'let a = (globalThis.__mootant?.hit("m2") ? (0) : (1))',
        ';(globalThis.__mootant?.hit("m1") ? (a--) : (a++))',
        'run(a)',
      ].join('\n'),
    )
  })

  it('throws when the text does not parse', () => {
    expect(() =>
      instrumentFile({
        mutants: [createMutant({ start: 0, end: 1 })],
        file: 'example.ts',
        source: 'let =',
      }),
    ).toThrow('The original text of example.ts does not parse.')
  })

  it.each(
    expectations.files.flatMap(({ file }) =>
      ['recommended', 'strict'].map(preset => ({ preset, file })),
    ),
  )(
    'hosts every pending mutant of $file under $preset in a text that parses',
    async ({ preset, file }) => {
      let source = await readFile(file, 'utf8')
      let mutants = generateMutants(source, { preset, file })
      let pending = mutants.filter(mutant => mutant.status === 'Pending')
      let switched = instrumentFile({ mutants: pending, source, file })
      let sites = [...switched.matchAll(/__mootant\?\.hit\("(?<id>\w+)"\)/gu)]

      expect(pending.length).toBeGreaterThan(0)
      expect(getSyntaxFingerprint(file, switched)).not.toBeNull()
      expect(
        sites.map(site => site.groups!['id']!).toSorted(compareCodeUnits),
      ).toStrictEqual(
        pending.map(mutant => mutant.id).toSorted(compareCodeUnits),
      )
    },
  )
})
