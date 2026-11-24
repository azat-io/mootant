import type { ChildProcess } from 'node:child_process'
import type { Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { LIVE_PROCESS_GROUPS } from '../../../adapters/shared/live-process-groups'
import { startTestProcess } from '../../../adapters/node-test/start-test-process'

/**
 * Waits until a process ended.
 *
 * @param child - The process.
 * @returns Resolves once it closed or failed to start.
 */
function waitForEnd(child: ChildProcess): Promise<void> {
  return new Promise(resolve => {
    child.once('close', () => {
      resolve()
    })
    child.once('error', () => {
      resolve()
    })
  })
}

describe('startTestProcess', () => {
  it('starts a detached process with file descriptor 3 and holds its group until it ends', async () => {
    let groups = new Set<number>()
    let child = startTestProcess({
      args: [
        '-e',
        `let { readFileSync } = require('node:fs')
        process.stdout.write(readFileSync(3, 'utf8') + ':' + process.env.A)`,
      ],
      node: process.execPath,
      cwd: process.cwd(),
      env: { A: '1' },
      output: 'pipe',
      pipe: true,
      groups,
    })
    let output = ''
    child.stdout!.setEncoding('utf8').on('data', (text: string) => {
      output += text
    })

    expect([...groups]).toStrictEqual([child.pid])
    expect(LIVE_PROCESS_GROUPS.has(child.pid!)).toBe(true)

    let pipe = child.stdio[3] as Writable
    pipe.end('unit')
    await waitForEnd(child)

    expect(output).toBe('unit:1')
    expect(child.stdin).toBeNull()
    expect(groups.size).toBe(0)
    expect(LIVE_PROCESS_GROUPS.has(child.pid!)).toBe(false)
  })

  it('starts a process without a pipe and output, and holds nothing when it cannot start', async () => {
    let groups = new Set<number>()
    let child = startTestProcess({
      node: process.execPath,
      cwd: process.cwd(),
      args: ['-e', '1'],
      output: 'ignore',
      pipe: false,
      env: {},
      groups,
    })

    expect(child.stdio).toHaveLength(3)
    expect(child.stdout).toBeNull()

    await waitForEnd(child)
    let missing = startTestProcess({
      node: '/missing/node',
      cwd: process.cwd(),
      output: 'ignore',
      pipe: false,
      args: [],
      env: {},
      groups,
    })
    await waitForEnd(missing)

    expect(missing.pid).toBeUndefined()
    expect(groups.size).toBe(0)
  })
})
