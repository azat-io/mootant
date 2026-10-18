import { describe, expect, it } from 'vitest'

import { createNodeTestTry } from '../../helpers/create-node-test-try'
import { getTestId } from '../../../adapters/node-test/get-test-id'
import { readTries } from '../../../adapters/node-test/read-tries'

describe('readTries', () => {
  let input = { file: '/p/a.test.js', mutant: 'm1', root: '/p' }

  it('reads tries in the order they started with their stray errors', () => {
    let tries = readTries(
      [
        createNodeTestTry({
          message: 'timed out',
          timedOut: true,
          covers: ['x'],
          failed: true,
          name: 'b',
          hits: 2,
          seq: 1,
        }),
        { message: 'late', kind: 'error', tries: [0, 1], load: false, hits: 0 },
        { message: 'outside', kind: 'error', load: false, tries: [], hits: 0 },
        createNodeTestTry({ reached: true, name: 'a', seq: 0 }),
        { kind: 'loaded' },
      ],
      { ...input, passed: false },
    )

    expect(tries).toStrictEqual([
      {
        facts: {
          test: getTestId('/p', '/p/a.test.js', { occurrence: 0, name: 'a' }),
          strays: ['late'],
          timedOut: false,
          skipped: false,
          message: null,
          reached: true,
          failed: false,
          mutant: 'm1',
          covers: null,
          duration: 3,
          hits: 0,
        },
        expected: false,
        occurrence: 0,
        name: 'a',
      },
      {
        facts: {
          test: getTestId('/p', '/p/a.test.js', { occurrence: 0, name: 'b' }),
          message: 'timed out',
          strays: ['late'],
          reached: false,
          skipped: false,
          timedOut: true,
          covers: ['x'],
          mutant: 'm1',
          failed: true,
          duration: 3,
          hits: 2,
        },
        expected: false,
        occurrence: 0,
        name: 'b',
      },
    ])
  })

  it('counts failures of a process that exited with 0 as expected', () => {
    let [entry] = readTries(
      [
        createNodeTestTry({
          message: 'todo',
          timedOut: true,
          failed: true,
          name: 'a',
          seq: 0,
        }),
      ],
      { ...input, passed: true },
    )

    expect(entry).toMatchObject({
      facts: { timedOut: false, message: null, failed: false },
      expected: true,
    })
  })
})
