import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fork } from 'node:child_process'

import type { runReference } from '../../helpers/run-reference'

import { runJestBothWays } from '../../helpers/run-jest-both-ways'
import { runOnWorker } from '../../../adapters/jest/run-on-worker'
import { createJestScope } from '../../helpers/create-jest-scope'
import { getJestMajors } from '../../helpers/get-jest-majors'
import { jestAdapter } from '../../../adapters/jest/index'
import { isAlive } from '../../helpers/is-alive'

vi.mock(import('node:child_process'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, fork: vi.fn(actual.fork) as typeof actual.fork }
})

vi.mock(
  import('../../../adapters/jest/run-on-worker'),
  async importOriginal => {
    let actual = await importOriginal()
    return { runOnWorker: vi.fn(actual.runOnWorker) }
  },
)

/**
 * Mutants of the `leftovers` fixture whose test passes and leaves something
 * that a plain run fails or never ends on only where its process goes on: in
 * band, as the second value says, in the order of a run, and for the late
 * errors also in a parallel run with another file after it on that worker. A
 * plain run of that file alone on a worker that then ends says what these rows
 * read: survived.
 */
const IN_BAND_ONLY = [
  // A timer ends the process after its file ended.
  ['src/exit-leaves.js | boolean-literal | true', 'killed'],
  // An interval keeps the process from ending.
  ['src/interval-leaves.js | boolean-literal | true', 'Timeout'],
  // A server keeps the process from ending.
  ['src/port-leaves.js | boolean-literal | true', 'Timeout'],
  // A rejection comes after its file ended, with no test to fail.
  ['src/rejection-leaves.js | boolean-literal | true', 'killed'],
  // A timer throws after its file ended, with no test to fail.
  ['src/timer-leaves.js | boolean-literal | true', 'killed'],
]

/**
 * Major versions of Jest of the rows that run on both, as `MOOTANT_TEST_JEST`
 * narrows them.
 */
let majors = getJestMajors()

/**
 * Copies of fixtures and sessions of the current test, which `cleanUp` ends.
 */
let { clearVariables, createProject, listForked, cleanUp } = createJestScope()

/**
 * Checks a run of the `leftovers` fixture: nothing reads `Error`, no process is
 * left, what plain Jest decides the same way in band and in parallel equals the
 * run by hand, and what it does not survives. So nothing left behind turned
 * into a kill, in the file that left it or in the next one.
 *
 * @param run - What `runJestBothWays` gave.
 */
function checkLeftovers(
  run: Awaited<ReturnType<typeof runJestBothWays>>,
): void {
  let names = new Set(IN_BAND_ONLY.map(([mutant]) => mutant))
  let compared = run.rows.filter(row => !names.has(row.mutant))
  let plain = run.result.results.filter(entry =>
    entry.mutant.file.endsWith('-plain.js'),
  )

  expect(run.original).toBe(true)
  expect(
    run.result.results.filter(entry => entry.status === 'Error'),
  ).toStrictEqual([])
  expect(compared).toStrictEqual(
    compared.map(row => ({ ...row, verdict: row.reference })),
  )
  expect(run.rows.filter(row => names.has(row.mutant))).toStrictEqual(
    IN_BAND_ONLY.map(([mutant, reference]) => ({
      verdict: 'survived',
      reference,
      mutant,
    })),
  )
  expect(new Set(plain.map(entry => entry.cause ?? '-'))).toStrictEqual(
    new Set(['assertion', '-']),
  )
  expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
}

describe.each(majors)('jest warm safety on Jest %i', major => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  /**
   * Verdicts by hand of the `leftovers` fixture, once the first test made them.
   */
  let reference: Awaited<ReturnType<typeof runReference>> | undefined

  it.each([{ concurrency: 1 }, { concurrency: 2 }])(
    'keeps what a test leaves from every later verdict, with concurrency $concurrency',
    { timeout: 600_000 },
    async ({ concurrency }) => {
      let run = await runJestBothWays(await createProject('leftovers', major), {
        ...(reference && { reference }),
        concurrency,
      })
      reference ??= run.reference

      checkLeftovers(run)
    },
  )

  it(
    'gives the same verdicts with fresh workers, on a fork per unit',
    { timeout: 600_000 },
    async () => {
      let run = await runJestBothWays(await createProject('leftovers', major), {
        adapter: jestAdapter({ freshWorkers: true }),
        ...(reference && { reference }),
      })
      reference ??= run.reference

      checkLeftovers(run)
      expect(vi.mocked(fork).mock.calls).toHaveLength(
        1 + vi.mocked(runOnWorker).mock.calls.length,
      )
    },
  )
})
