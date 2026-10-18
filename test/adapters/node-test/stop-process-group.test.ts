import { afterEach, describe, expect, it, vi } from 'vitest'

import { stopProcessGroup } from '../../../adapters/node-test/stop-process-group'

/**
 * Creates an error with a code, as `process.kill` throws.
 *
 * @param code - Code such as `ESRCH`.
 * @returns Error with that code.
 */
function createError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

describe('stopProcessGroup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('kills the process group', () => {
    let kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    stopProcessGroup(42)

    expect(kill.mock.calls).toStrictEqual([[-42, 'SIGKILL']])
  })

  it('leaves a group that is gone', () => {
    let kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw createError('ESRCH')
    })
    stopProcessGroup(42)

    expect(kill).toHaveBeenCalledExactlyOnceWith(-42, 'SIGKILL')
  })

  it('kills the process alone where groups cannot be signalled', () => {
    let kill = vi
      .spyOn(process, 'kill')
      .mockImplementationOnce(() => {
        throw createError('EINVAL')
      })
      .mockReturnValueOnce(true)
    stopProcessGroup(42)

    expect(kill.mock.calls).toStrictEqual([
      [-42, 'SIGKILL'],
      [42, 'SIGKILL'],
    ])

    kill.mockImplementation(() => {
      throw createError('EPERM')
    })

    expect(() => {
      stopProcessGroup(42)
    }).not.toThrow()
  })
})
