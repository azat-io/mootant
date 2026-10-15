import { describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'

import { isProcessAlive } from '../../../../adapters/vitest/worker/is-process-alive'

describe('isProcessAlive', () => {
  it('treats a process id being written as alive', () => {
    expect(isProcessAlive('')).toBe(true)
  })

  it('tells a running process from one that exited', async () => {
    let child = spawn(process.execPath, ['-e', ''])
    await new Promise(resolve => {
      child.on('exit', resolve)
    })

    expect(isProcessAlive(String(process.pid))).toBe(true)
    expect(isProcessAlive(String(child.pid))).toBe(false)
  })

  it('treats a process it may not signal as alive', () => {
    vi.spyOn(process, 'kill').mockImplementationOnce(() => {
      throw Object.assign(new Error('denied'), { code: 'EPERM' })
    })

    expect(isProcessAlive('1')).toBe(true)
  })
})
