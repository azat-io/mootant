import type { ChildProcess } from 'node:child_process'

import { setTimeout as sleep } from 'node:timers/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { LIVE_PROCESS_GROUPS } from '../../../adapters/shared/live-process-groups'
import { waitForJestExit } from '../../../adapters/jest/wait-for-jest-exit'

/**
 * Processes of the current test, stopped after it.
 */
let children: ChildProcess[] = []

/**
 * Starts a detached Node process as Jest's processes start.
 *
 * @param script - Code it runs.
 * @returns The process.
 */
function start(script: string): ChildProcess {
  let child = spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  children.push(child)
  return child
}

/**
 * Tells whether a process lives.
 *
 * @param pid - Its id.
 * @returns Whether a signal can reach it.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('waitForJestExit', { timeout: 30_000 }, () => {
  afterEach(() => {
    for (let child of children) {
      child.kill('SIGKILL')
    }
    children = []
  })

  it('says how a process exited and forgets its group', async () => {
    let child = start('process.exitCode = 3')
    let exited = waitForJestExit(child)

    expect(LIVE_PROCESS_GROUPS.has(child.pid!)).toBe(true)
    await expect(exited).resolves.toStrictEqual({
      how: 'exited with code 3',
      signal: null,
      code: 3,
    })
    expect(LIVE_PROCESS_GROUPS.has(child.pid!)).toBe(false)
  })

  it('says which signal stopped a process', async () => {
    await expect(
      waitForJestExit(start(`process.kill(process.pid, 'SIGKILL')`)),
    ).resolves.toStrictEqual({
      how: 'was stopped by SIGKILL',
      signal: 'SIGKILL',
      code: null,
    })
  })

  it('stops what is left of the group when the process exits', async () => {
    let child = start(
      `let { spawn } = require('node:child_process')
      let left = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)'], { stdio: 'ignore' })
      left.unref()
      console.log(left.pid)`,
    )
    let pid = new Promise<number>(resolve => {
      child.stdout!.once('data', (text: Buffer) => {
        resolve(Number(text.toString()))
      })
    })
    await waitForJestExit(child)
    let left = await pid

    await expect.poll(() => isAlive(left), { timeout: 10_000 }).toBe(false)
  })

  it('does not wait long for output a detached process holds', async () => {
    let child = start(
      `let { spawn } = require('node:child_process')
      spawn('sleep', ['5'], { detached: true, stdio: 'inherit' }).unref()`,
    )
    let started = Date.now()

    await expect(waitForJestExit(child)).resolves.toStrictEqual({
      how: 'exited with code 0',
      signal: null,
      code: 0,
    })
    expect(Date.now() - started).toBeLessThan(4000)
    expect(child.stdout!.destroyed).toBe(true)
  })

  it('never settles for a process that could not start', async () => {
    let child = spawn(process.execPath, [], {
      cwd: path.join(tmpdir(), 'mootant-no-such-directory'),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    let failed = new Promise(resolve => {
      child.once('error', resolve)
    })
    let exited = waitForJestExit(child)
    await failed

    await expect(Promise.race([exited, sleep(100, 'pending')])).resolves.toBe(
      'pending',
    )
  })
})
