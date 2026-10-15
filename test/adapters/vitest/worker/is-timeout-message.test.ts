import { describe, expect, it } from 'vitest'

import { isTimeoutMessage } from '../../../../adapters/vitest/worker/is-timeout-message'

describe('isTimeoutMessage', () => {
  it("tells Vitest's test and hook timeouts from other errors", () => {
    expect(isTimeoutMessage('Test timed out in 5000ms.')).toBe(true)
    expect(isTimeoutMessage('Hook timed out in 519ms.')).toBe(true)
    expect(
      isTimeoutMessage(
        'The setup phase of "aroundEach" hook timed out after 10ms.',
      ),
    ).toBe(true)
    expect(
      isTimeoutMessage(
        'The teardown phase of "aroundAll" hook timed out after 10ms.',
      ),
    ).toBe(true)
    expect(isTimeoutMessage('expected 1 to be 2')).toBe(false)
  })
})
