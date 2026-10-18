import { describe, expect, it } from 'vitest'

import { describeExit } from '../../../adapters/node-test/describe-exit'

describe('describeExit', () => {
  it('names how the process ended', () => {
    expect(describeExit({ signal: 'SIGKILL', code: null, hung: true })).toBe(
      'The test process ran past its time limit and was stopped.',
    )
    expect(describeExit({ signal: 'SIGSEGV', hung: false, code: null })).toBe(
      'The test process was stopped by SIGSEGV before the test file ended.',
    )
    expect(describeExit({ signal: null, hung: false, code: 7 })).toBe(
      'The test process exited with code 7 before the test file ended.',
    )
  })
})
