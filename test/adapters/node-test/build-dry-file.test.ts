import { describe, expect, it } from 'vitest'

import type { TestProcessOutcome } from '../../../adapters/node-test/types/test-process-outcome'
import type { NodeTestRecord } from '../../../adapters/node-test/types/node-test-record'

import { buildDryFile } from '../../../adapters/node-test/build-dry-file'
import { createNodeTestEnd } from '../../helpers/create-node-test-end'
import { createNodeTestTry } from '../../helpers/create-node-test-try'
import { getTestId } from '../../../adapters/node-test/get-test-id'

/**
 * Input of the test file.
 */
const INPUT = { file: '/p/a.test.js', root: '/p' }

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
  return { signal: null, hung: false, spawned: 0, code: 0, records, ...fields }
}

/**
 * Gives the id of a test of the file.
 *
 * @param name - Full name.
 * @returns Its id.
 */
function id(name: string): string {
  return getTestId('/p', '/p/a.test.js', { occurrence: 0, name })
}

describe('buildDryFile', () => {
  it('builds the file and its tests from a clean process', () => {
    let report = buildDryFile(
      createOutcome([
        createNodeTestTry({ covers: ['m1'], name: 'a', hits: 1, seq: 0 }),
        createNodeTestEnd({
          environment: ['HOME'],
          modified: ['/p/x'],
          concurrent: true,
          covers: ['m2'],
          hits: 2,
        }),
      ]),
      INPUT,
    )

    expect(report).toStrictEqual({
      tests: [
        {
          tries: [
            {
              timedOut: false,
              skipped: false,
              covers: ['m1'],
              reached: false,
              message: null,
              failed: false,
              test: id('a'),
              mutant: null,
              duration: 3,
              strays: [],
              hits: 1,
            },
          ],
          file: '/p/a.test.js',
          project: '',
          id: id('a'),
          line: null,
          name: 'a',
        },
      ],
      entry: {
        environment: ['HOME'],
        file: '/p/a.test.js',
        modified: ['/p/x'],
        loadFailed: false,
        concurrent: true,
        loadDuration: 4,
        hookDuration: 1,
        covers: ['m2'],
        project: '',
        errors: [],
        hits: 2,
      },
      expected: [],
      hung: null,
    })
  })

  it('keeps failures of a process that exited with 0 as expected', () => {
    let report = buildDryFile(
      createOutcome([
        createNodeTestTry({
          occurrence: 1,
          failed: true,
          name: 'todo',
          seq: 0,
        }),
        createNodeTestEnd(),
      ]),
      INPUT,
    )

    expect(report.tests[0]!.tries[0]!.failed).toBe(false)
    expect(report.expected).toStrictEqual([{ occurrence: 1, name: 'todo' }])
  })

  it('fails a file whose process failed outside its tests', () => {
    let outside = buildDryFile(
      createOutcome(
        [createNodeTestTry({ name: 'a', seq: 0 }), createNodeTestEnd()],
        {
          code: 1,
        },
      ),
      INPUT,
    )

    expect(outside.entry).toMatchObject({
      errors: ['The test file failed outside its tests (exit code 1).'],
      loadFailed: true,
    })

    let stray = buildDryFile(
      createOutcome(
        [
          { message: 'late', kind: 'error', load: false, tries: [], hits: 0 },
          createNodeTestEnd(),
        ],
        { code: 1 },
      ),
      INPUT,
    )

    expect(stray.entry).toMatchObject({ errors: ['late'], loadFailed: true })

    let signalled = buildDryFile(
      createOutcome([createNodeTestEnd()], { signal: 'SIGTERM', code: null }),
      INPUT,
    )

    expect(signalled.entry.errors).toStrictEqual([
      'The test file failed outside its tests (exit code SIGTERM).',
    ])

    let failing = buildDryFile(
      createOutcome(
        [
          createNodeTestTry({ failed: true, name: 'a', seq: 0 }),
          createNodeTestEnd(),
        ],
        { code: 1 },
      ),
      INPUT,
    )

    expect(failing.entry.loadFailed).toBe(false)
    expect(failing.tests[0]!.tries[0]!.failed).toBe(true)
  })

  it('fails a file whose root hook failed, even after an exit with 0', () => {
    let file = buildDryFile(
      createOutcome([
        createNodeTestTry({ name: 'a', seq: 0 }),
        { kind: 'root-hook', message: 'boom' },
        createNodeTestEnd(),
      ]),
      INPUT,
    )

    expect(file.entry).toMatchObject({
      errors: ['A root hook of the test file failed: boom'],
      loadFailed: true,
    })
  })

  it('fails a file that did not load or did not end', () => {
    let load = buildDryFile(
      createOutcome(
        [{ message: 'missing', kind: 'error', load: true, tries: [], hits: 0 }],
        { code: 1 },
      ),
      INPUT,
    )

    expect(load.entry).toStrictEqual({
      file: '/p/a.test.js',
      errors: ['missing'],
      concurrent: false,
      loadFailed: true,
      loadDuration: 0,
      hookDuration: 0,
      project: '',
      covers: [],
      hits: 0,
    })

    // The test file threw at its top level after registering a test, which
    // Node started before it reported the error.
    let thrown = buildDryFile(
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

    expect(thrown.entry).toMatchObject({ errors: ['thrown'], loadFailed: true })

    let late = buildDryFile(
      createOutcome(
        [
          { kind: 'loaded' },
          createNodeTestTry({ name: 'a', seq: 0 }),
          { message: 'late', kind: 'error', load: false, tries: [0], hits: 0 },
          createNodeTestEnd({ code: 1 }),
        ],
        { code: 1 },
      ),
      INPUT,
    )

    expect(late.entry).toMatchObject({
      errors: ['The test file failed outside its tests (exit code 1).'],
      loadFailed: true,
    })

    let crash = buildDryFile(createOutcome([], { code: 134 }), INPUT)

    expect(crash.entry).toMatchObject({
      errors: [
        'The test process exited with code 134 before the test file ended.',
      ],
      loadFailed: true,
    })
  })

  it('names the test a hung process ran', () => {
    let report = buildDryFile(
      createOutcome(
        [
          { occurrence: 0, kind: 'open', name: 'a', seq: 0 },
          { kind: 'close', seq: 0 },
          { occurrence: 0, kind: 'open', name: 'b', seq: 1 },
        ],
        { signal: 'SIGKILL', code: null, hung: true },
      ),
      INPUT,
    )

    expect(report.hung).toStrictEqual({ test: id('b'), name: 'b' })
    expect(report.entry).toMatchObject({
      errors: ['The test process ran past its time limit and was stopped.'],
      loadFailed: true,
    })
    expect(
      buildDryFile(
        createOutcome([createNodeTestEnd()], { hung: true, code: null }),
        INPUT,
      ).hung,
    ).toStrictEqual({ name: null, test: null })
  })
})
