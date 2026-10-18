import { describe, expect, it } from 'vitest'

import type { TestProcessOutcome } from '../../../adapters/node-test/types/test-process-outcome'
import type { NodeTestRecord } from '../../../adapters/node-test/types/node-test-record'

import { buildIsolatedFacts } from '../../../adapters/node-test/build-isolated-facts'
import { createNodeTestEnd } from '../../helpers/create-node-test-end'
import { createNodeTestTry } from '../../helpers/create-node-test-try'

/**
 * Unit of the facts.
 */
const INPUT = { file: '/p/a.test.js', mutant: 'm1', root: '/p', unit: 2 }

/**
 * Start record of a process.
 */
const START: NodeTestRecord = {
  node: 'v26.0.0',
  hooks: 'sync',
  kind: 'start',
  time: 130,
  pid: 1,
}

/**
 * Creates the outcome of a process.
 *
 * @param records - Its records.
 * @param fields - Fields that differ from a clean exit.
 * @returns What the process left behind.
 */
function createOutcome(
  records: NodeTestRecord[],
  fields: Partial<TestProcessOutcome> = {},
): TestProcessOutcome {
  return {
    spawned: 100,
    signal: null,
    hung: false,
    code: 0,
    records,
    ...fields,
  }
}

describe('buildIsolatedFacts', () => {
  it('builds the facts of a unit that ended', () => {
    let facts = buildIsolatedFacts(
      createOutcome(
        [
          START,
          createNodeTestTry({ reached: true, failed: true, name: 'a', seq: 0 }),
          { message: 'late', kind: 'error', load: false, tries: [], hits: 0 },
          createNodeTestEnd({ reached: true, duration: 30, total: 9 }),
        ],
        { code: 1 },
      ),
      INPUT,
    )

    expect(facts).toMatchObject({
      tests: [{ failed: true, mutant: 'm1' }],
      incomplete: null,
      strays: ['late'],
      timedOut: false,
      loadError: null,
      hookError: null,
      reached: true,
      duration: 30,
      startup: 30,
      hits: 9,
      unit: 2,
    })
  })

  it('counts failures of a process that exited with 0 as passed', () => {
    let facts = buildIsolatedFacts(
      createOutcome([
        createNodeTestTry({ failed: true, name: 'todo', seq: 0 }),
        createNodeTestEnd(),
      ]),
      INPUT,
    )

    expect(facts.tests[0]!.failed).toBe(false)
    expect(facts.startup).toBe(0)
  })

  it('reports a failure outside tests as the hook error', () => {
    let facts = buildIsolatedFacts(
      createOutcome(
        [createNodeTestTry({ name: 'a', seq: 0 }), createNodeTestEnd()],
        {
          code: 1,
        },
      ),
      INPUT,
    )

    expect(facts.hookError).toBe(
      'The test file failed outside its tests (exit code 1).',
    )
    expect(
      buildIsolatedFacts(
        createOutcome([createNodeTestEnd()], { signal: 'SIGTERM', code: null }),
        INPUT,
      ).hookError,
    ).toBe('The test file failed outside its tests (exit code SIGTERM).')
  })

  it('reports a failed root hook as the hook error, even after an exit with 0', () => {
    let hook: NodeTestRecord = { kind: 'root-hook', message: 'boom' }

    expect(
      buildIsolatedFacts(
        createOutcome([
          createNodeTestTry({ name: 'a', seq: 0 }),
          hook,
          createNodeTestEnd(),
        ]),
        INPUT,
      ).hookError,
    ).toBe('A root hook of the test file failed: boom')
    expect(
      buildIsolatedFacts(
        createOutcome(
          [
            createNodeTestTry({ failed: true, name: 'a', seq: 0 }),
            hook,
            createNodeTestEnd(),
          ],
          { code: 1 },
        ),
        INPUT,
      ).hookError,
    ).toBeNull()
  })

  it('takes a failed todo test as the reason of a failing exit code', () => {
    let facts = buildIsolatedFacts(
      createOutcome(
        [
          createNodeTestTry({ name: 'a', seq: 0 }),
          { failed: false, kind: 'todo' },
          { kind: 'todo', failed: true },
          createNodeTestEnd(),
        ],
        { code: 1 },
      ),
      INPUT,
    )

    expect(facts.hookError).toBeNull()
    expect(facts.tests[0]!.failed).toBe(false)
  })

  it('fails outside tests when a test or suite that is not todo failed', () => {
    let facts = buildIsolatedFacts(
      createOutcome(
        [
          createNodeTestTry({ name: 'a', seq: 0 }),
          { kind: 'todo', failed: true },
          { kind: 'failure' },
          createNodeTestEnd(),
        ],
        { code: 1 },
      ),
      INPUT,
    )

    expect(facts.hookError).toBe(
      'The test file failed outside its tests (exit code 1).',
    )
  })

  it('drops uncaught errors that node:test gave to a todo test', () => {
    let facts = buildIsolatedFacts(
      createOutcome(
        [
          createNodeTestTry({ name: 'a', seq: 0 }),
          { message: 'todo', kind: 'error', load: false, tries: [], hits: 0 },
          { message: 'own', kind: 'error', load: false, tries: [], hits: 0 },
          { kind: 'todo-error', error: 0 },
          createNodeTestEnd(),
        ],
        { code: 1 },
      ),
      INPUT,
    )

    expect(facts.strays).toStrictEqual(['own'])
  })

  it('reports load errors, crashes and hangs', () => {
    let load = buildIsolatedFacts(
      createOutcome(
        [
          START,
          { message: 'first', kind: 'error', load: true, tries: [], hits: 12 },
          { message: 'second', kind: 'error', load: true, tries: [], hits: 3 },
        ],
        { code: 1 },
      ),
      INPUT,
    )

    expect(load).toMatchObject({
      loadError: 'first',
      incomplete: null,
      hookError: null,
      reached: false,
      duration: 0,
      strays: [],
      hits: 12,
    })

    let crash = buildIsolatedFacts(
      createOutcome(
        [
          { kind: 'loaded' },
          createNodeTestTry({
            reached: true,
            duration: 5,
            name: 'a',
            hits: 4,
            seq: 0,
          }),
          { message: 'boom', kind: 'error', load: false, tries: [0], hits: 2 },
        ],
        { code: 134 },
      ),
      INPUT,
    )

    expect(crash).toMatchObject({
      incomplete: 'crash',
      hookError: null,
      reached: true,
      duration: 5,
      hits: 4,
    })

    // The test file threw at its top level after registering a test, which
    // Node started before it reported the error.
    let thrown = buildIsolatedFacts(
      createOutcome(
        [
          createNodeTestTry({ name: 'a', seq: 0 }),
          {
            message: 'thrown',
            kind: 'error',
            load: false,
            tries: [0],
            hits: 0,
          },
          createNodeTestEnd({ code: 1 }),
        ],
        { code: 1 },
      ),
      INPUT,
    )

    expect(thrown).toMatchObject({
      loadError: 'thrown',
      incomplete: null,
      hookError: null,
      strays: [],
    })

    let hang = buildIsolatedFacts(
      createOutcome(
        [{ message: 'early', kind: 'error', load: true, tries: [], hits: 0 }],
        { signal: 'SIGKILL', code: null, hung: true },
      ),
      INPUT,
    )

    expect(hang).toMatchObject({
      incomplete: 'hang',
      loadError: null,
      hookError: null,
    })
  })
})
