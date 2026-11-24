import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'

import { isGroupAlive } from '../../../adapters/node-test/is-group-alive'

describe('isGroupAlive', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tells whether a process of a group is left', async () => {
    let child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], {
      stdio: 'ignore',
      detached: true,
    })

    expect(isGroupAlive(child.pid!)).toBe(true)

    child.kill('SIGKILL')
    await new Promise(resolve => {
      child.once('exit', resolve)
    })

    expect(isGroupAlive(child.pid!)).toBe(false)
  })

  it('counts a group that cannot be looked at as alive', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('denied'), { code: 'EPERM' })
    })

    expect(isGroupAlive(1)).toBe(true)
  })
})
