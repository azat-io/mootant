import { describe, expect, it } from 'vitest'

import { describeHookFailure } from '../../../adapters/node-test/describe-hook-failure'

describe('describeHookFailure', () => {
  it('names the root hook or the exit of a file that failed outside its tests', () => {
    expect(
      describeHookFailure({ signal: null, code: 0 }, { message: 'boom' }),
    ).toBe('A root hook of the test file failed: boom')
    expect(describeHookFailure({ signal: null, code: 1 }, undefined)).toBe(
      'The test file failed outside its tests (exit code 1).',
    )
    expect(
      describeHookFailure({ signal: 'SIGTERM', code: null }, undefined),
    ).toBe('The test file failed outside its tests (exit code SIGTERM).')
  })
})
