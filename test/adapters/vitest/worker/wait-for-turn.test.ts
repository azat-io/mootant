import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { captureClock } from '../../../../adapters/vitest/worker/capture-clock'
import { waitForTurn } from '../../../../adapters/vitest/worker/wait-for-turn'

/**
 * Waits 60 ms on the real clock, a few polls of the waiting unit.
 *
 * @returns Resolves after the pause.
 */
function pause(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 60)
  })
}

describe('waitForTurn', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-turn-'))
    await mkdir(path.join(directory, 'claim'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('lets the first unit of a file start at once', async () => {
    await expect(
      waitForTurn(directory, { hash: 'aaaa', index: 0 }, captureClock()),
    ).resolves.toBeUndefined()
  })

  it('waits until the worker of the unit before is gone', async () => {
    await writeFile(path.join(directory, 'claim', 'aaaa-0'), '')
    let finished = false
    let waiting = (async () => {
      await waitForTurn(directory, { hash: 'aaaa', index: 1 }, captureClock())
      finished = true
    })()
    await pause()

    expect(finished).toBe(false)

    let child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 200)'])
    await writeFile(path.join(directory, 'claim', 'aaaa-0'), String(child.pid))
    await pause()

    expect(finished).toBe(false)

    await waiting

    expect(finished).toBe(true)
    expect(child.exitCode).toBe(0)
  })

  it('stops waiting when the worker of the unit before is gone', async () => {
    let child = spawn(process.execPath, ['-e', ''])
    await new Promise(resolve => {
      child.on('exit', resolve)
    })
    await writeFile(path.join(directory, 'claim', 'aaaa-1'), String(child.pid))

    await expect(
      waitForTurn(directory, { hash: 'aaaa', index: 2 }, captureClock()),
    ).resolves.toBeUndefined()
  })

  it('lets a unit start after a unit of this very process', async () => {
    await writeFile(
      path.join(directory, 'claim', 'aaaa-0'),
      String(process.pid),
    )

    await expect(
      waitForTurn(directory, { hash: 'aaaa', index: 1 }, captureClock()),
    ).resolves.toBeUndefined()
  })
})
