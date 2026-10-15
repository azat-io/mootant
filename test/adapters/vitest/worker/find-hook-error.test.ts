import { describe, expect, it } from 'vitest'

import { findHookError } from '../../../../adapters/vitest/worker/find-hook-error'

describe('findHookError', () => {
  it('finds the first error of the file or a nested suite', () => {
    let file = {
      tasks: [
        { result: { errors: [{ message: 'test' }] }, type: 'test' },
        { result: { errors: [] }, type: 'suite', tasks: [] },
        {
          result: { errors: [{ message: 'hook\nstack' }] },
          type: 'suite',
          tasks: [],
        },
      ],
      result: {
        errors: [{ message: 'Obsolete snapshots found when no update' }],
      },
    } as never

    expect(findHookError(file)).toBe('hook')
    expect(
      findHookError({
        result: { errors: [{ message: 'file' }] },
        tasks: [],
      } as never),
    ).toBe('file')
  })

  it('returns null without errors', () => {
    expect(
      findHookError({
        tasks: [{ type: 'suite', tasks: [] }],
      } as never),
    ).toBeNull()
  })
})
