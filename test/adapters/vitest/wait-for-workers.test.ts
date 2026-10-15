import type { ChildProcess } from 'node:child_process'

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { VitestHeartbeat } from '../../../adapters/vitest/types/vitest-worker'

import { waitForWorkers } from '../../../adapters/vitest/wait-for-workers'

describe('waitForWorkers', () => {
  let directory: string
  let children: ChildProcess[] = []

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-workers-'))
    await mkdir(path.join(directory, 'worker'))
    await mkdir(path.join(directory, 'beat'))
  })

  afterEach(async () => {
    for (let child of children) {
      child.kill('SIGKILL')
    }
    children = []
    await rm(directory, { recursive: true, force: true })
  })

  it('returns at once when every worker is gone', async () => {
    let child = spawn(process.execPath, ['-e', ''])
    await new Promise(resolve => {
      child.on('exit', resolve)
    })
    await writeFile(path.join(directory, 'worker', String(child.pid)), '')

    await expect(waitForWorkers(directory)).resolves.toBeUndefined()
  })

  it('waits until a worker exits', async () => {
    let child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 100)'])
    await writeFile(path.join(directory, 'worker', String(child.pid)), '')
    let exited = false
    child.on('exit', () => {
      exited = true
    })
    await waitForWorkers(directory)

    expect(exited).toBe(true)
  })

  it('gives up after the limit and stops the workers left', async () => {
    let child = startWorker()
    await writeFile(path.join(directory, 'worker', String(child.pid)), '')
    let exit = waitForExit(child)
    let started = performance.now()
    await waitForWorkers(directory, { wait: 30, grace: 0 })

    expect(performance.now() - started).toBeGreaterThanOrEqual(25)
    await expect(exit).resolves.toBe('SIGKILL')
  })

  it('leaves processes that are not its workers', async () => {
    await writeFile(path.join(directory, 'worker', String(process.pid)), '')

    await expect(
      waitForWorkers(directory, { wait: 30, grace: 0 }),
    ).resolves.toBeUndefined()
  })

  it('waits past the limit while a heartbeat is within its budget', async () => {
    let child = startWorker()
    let gone = spawn(process.execPath, ['-e', ''])
    await waitForExit(gone)
    await writeFile(path.join(directory, 'worker', String(child.pid)), '')
    await writeFile(path.join(directory, 'worker', String(gone.pid)), '')
    await writeBeat(child.pid!, 1)
    await writeBeat(gone.pid!, 1, 60_000)
    let exit = waitForExit(child)
    let started = performance.now()
    setTimeout(() => {
      void writeBeat(child.pid!, 2)
    }, 150)
    await waitForWorkers(directory, { grace: 20, wait: 30 })

    expect(performance.now() - started).toBeGreaterThanOrEqual(470)
    await expect(exit).resolves.toBe('SIGKILL')
  })

  it('ends the wait when the watchdog stops a hung worker', async () => {
    let child = startWorker()
    await writeFile(path.join(directory, 'worker', String(child.pid)), '')
    await writeBeat(child.pid!, 1, 60_000)
    setTimeout(() => {
      child.kill('SIGKILL')
    }, 100)
    let started = performance.now()
    await waitForWorkers(directory, { wait: 30, grace: 0 })

    expect(performance.now() - started).toBeLessThan(10_000)
    expect(child.signalCode).toBe('SIGKILL')
  })

  it('gives a beat being written the grace', async () => {
    let child = startWorker()
    await writeFile(path.join(directory, 'worker', String(child.pid)), '')
    await writeFile(path.join(directory, 'beat', `${child.pid}.json`), '{')
    let exit = waitForExit(child)
    let started = performance.now()
    await waitForWorkers(directory, { grace: 150, wait: 30 })

    expect(performance.now() - started).toBeGreaterThanOrEqual(145)
    await expect(exit).resolves.toBe('SIGKILL')
  })

  it('fails when the folders of the run are gone', async () => {
    await writeFile(path.join(directory, 'worker', String(process.pid)), '')
    await rm(path.join(directory, 'beat'), { recursive: true })

    await expect(waitForWorkers(directory)).rejects.toThrow('ENOENT')
  })

  /**
   * Starts a process that runs until it is stopped.
   *
   * @returns Child process.
   */
  function startWorker(): ChildProcess {
    let child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    children.push(child)
    return child
  }

  /**
   * Writes the heartbeat of a worker.
   *
   * @param pid - Process id of the worker.
   * @param sequence - Number of the beat.
   * @param budget - Milliseconds allowed from now.
   * @returns Resolves when the file is written.
   */
  function writeBeat(
    pid: number,
    sequence: number,
    budget: number = 300,
  ): Promise<void> {
    let beat: VitestHeartbeat = {
      file: '/a.test.ts',
      mutant: 'm',
      test: null,
      name: null,
      sequence,
      unit: 0,
      budget,
      pid,
    }
    return writeFile(
      path.join(directory, 'beat', `${pid}.json`),
      JSON.stringify(beat),
    )
  }
})

/**
 * Waits until a process exits.
 *
 * @param child - Child process.
 * @returns Signal that ended it, or null.
 */
function waitForExit(child: ChildProcess): Promise<NodeJS.Signals | null> {
  return new Promise(resolve => {
    child.on('exit', (_code, signal) => {
      resolve(signal)
    })
  })
}
