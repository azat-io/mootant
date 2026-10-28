import { describe, expect, it, vi } from 'vitest'

import { runInChunks } from '../../../core/cache/run-in-chunks'

describe('runInChunks', () => {
  it('runs the tasks of one chunk at a time', async () => {
    let log: string[] = []

    await runInChunks([0, 1, 2, 3, 4, 5, 6], 3, async item => {
      log.push(`start ${item}`)
      await new Promise(resolve => {
        setTimeout(resolve, 1)
      })
      log.push(`end ${item}`)
    })

    expect(log).toStrictEqual([
      'start 0',
      'start 1',
      'start 2',
      'end 0',
      'end 1',
      'end 2',
      'start 3',
      'start 4',
      'start 5',
      'end 3',
      'end 4',
      'end 5',
      'start 6',
      'end 6',
    ])
  })

  it('resolves without items', async () => {
    let task = vi.fn<(item: string) => Promise<void>>()

    await expect(runInChunks([], 3, task)).resolves.toBeUndefined()
    expect(task).not.toHaveBeenCalled()
  })
})
