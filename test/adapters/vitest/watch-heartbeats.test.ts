import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { VitestHeartbeat } from '../../../adapters/vitest/types/vitest-worker'

import { watchHeartbeats } from '../../../adapters/vitest/watch-heartbeats'

/**
 * Builds a heartbeat.
 *
 * @param sequence - Number of the beat.
 * @param budget - Milliseconds allowed.
 * @returns Heartbeat of process 7.
 */
function createBeat(sequence: number, budget: number): VitestHeartbeat {
  return {
    file: '/a.test.ts',
    name: 'suite > t',
    mutant: 'm',
    test: 't',
    sequence,
    unit: 0,
    pid: 7,
    budget,
  }
}

describe('watchHeartbeats', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports a worker whose beat is older than its budget once', async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'performance'],
    })
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-watch-'))
    await mkdir(path.join(directory, 'beat'))
    let file = path.join(directory, 'beat', '7.json')
    let hung: VitestHeartbeat[] = []
    let watch = watchHeartbeats(directory, beat => {
      hung.push(beat)
      return Promise.resolve()
    })

    await writeFile(file, JSON.stringify(createBeat(1, 400)))
    await writeFile(path.join(directory, 'beat', '8.json'), '{"seq')
    vi.advanceTimersByTime(250)
    vi.advanceTimersByTime(250)

    expect(hung).toStrictEqual([])

    await writeFile(file, JSON.stringify(createBeat(2, 400)))
    vi.advanceTimersByTime(250)
    vi.advanceTimersByTime(250)

    expect(hung).toStrictEqual([])

    vi.advanceTimersByTime(250)
    vi.advanceTimersByTime(1000)

    expect(hung).toStrictEqual([createBeat(2, 400)])

    await watch.stop()
    await writeFile(file, JSON.stringify(createBeat(3, 0)))
    vi.advanceTimersByTime(1000)

    expect(hung).toHaveLength(1)

    await rm(directory, { recursive: true })
  })
})
