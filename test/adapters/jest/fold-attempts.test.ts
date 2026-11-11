import { describe, expect, it } from 'vitest'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'

import { foldAttempts } from '../../../adapters/jest/fold-attempts'

/**
 * Builds a `try` record of a passing attempt.
 *
 * @param fields - Fields that differ.
 * @returns The record.
 */
function attempt(
  fields: Partial<Extract<JestTimedRecord, { kind: 'try' }>>,
): JestTimedRecord {
  return {
    timedOut: false,
    reached: false,
    failed: false,
    occurrence: 0,
    message: null,
    realm: null,
    duration: 1,
    kind: 'try',
    covers: [],
    name: 'a',
    time: 0,
    hits: 1,
    ...fields,
  }
}

describe('foldAttempts', () => {
  it('folds a test that passes on retry into one passed entry, with sums and the union of covers', () => {
    expect(
      foldAttempts([
        attempt({
          covers: ['z', 'b'],
          message: 'first',
          realm: 'current',
          timedOut: true,
          failed: true,
          duration: 5,
          hits: 2,
        }),
        { kind: 'start', time: 0 },
        attempt({ covers: ['b', 'a'], reached: true, duration: 7, hits: 3 }),
      ]),
    ).toStrictEqual([
      {
        covers: ['a', 'b', 'z'],
        timedOut: false,
        reached: true,
        failed: false,
        message: null,
        occurrence: 0,
        duration: 12,
        realm: null,
        name: 'a',
        hits: 5,
      },
    ])
  })

  it('folds a test that fails on every attempt into one failed entry', () => {
    expect(
      foldAttempts([
        attempt({ message: 'first', realm: 'host', failed: true }),
        attempt({ realm: 'current', message: 'last', failed: true }),
      ]),
    ).toMatchObject([{ realm: 'current', message: 'last', failed: true }])
  })

  it('turns an entry failed by a late try, with its covers kept and nothing added', () => {
    expect(
      foldAttempts([
        attempt({ covers: ['a'], duration: 4, hits: 2 }),
        attempt({
          realm: 'current',
          message: 'late',
          failed: true,
          covers: null,
          duration: 0,
          hits: 0,
        }),
      ]),
    ).toMatchObject([
      { message: 'late', covers: ['a'], failed: true, duration: 4, hits: 2 },
    ])
  })

  it('keeps two occurrences of a name apart', () => {
    expect(
      foldAttempts([
        attempt({ covers: ['a'], occurrence: 0 }),
        attempt({ covers: ['b'], occurrence: 1 }),
      ]).map(test => [test.name, test.occurrence, test.covers]),
    ).toStrictEqual([
      ['a', 0, ['a']],
      ['a', 1, ['b']],
    ])
  })

  it('orders tests by their first attempts', () => {
    expect(
      foldAttempts([
        attempt({ failed: true, name: 'z' }),
        attempt({ name: 'a' }),
        attempt({ name: 'z' }),
      ]).map(test => test.name),
    ).toStrictEqual(['z', 'a'])
  })

  it('takes a test with no covers in any attempt as having none', () => {
    expect(foldAttempts([attempt({ covers: null })])[0]!.covers).toStrictEqual(
      [],
    )
  })
})
