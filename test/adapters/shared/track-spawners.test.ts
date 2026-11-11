import { describe, expect, it } from 'vitest'
import childProcess from 'node:child_process'
import { promisify } from 'node:util'

import { trackSpawners } from '../../../adapters/shared/track-spawners'

describe('trackSpawners', () => {
  it('reports * when a child gets the variables of the process, and nothing when it gets its own', async () => {
    let names: string[] = []
    trackSpawners(process.env, name => {
      names.push(name)
    })
    let node = process.execPath
    childProcess.spawnSync(node, ['-e', '0'])
    childProcess.spawnSync(node, ['-e', '0'], { stdio: 'ignore' })
    childProcess.spawnSync(node, ['-e', '0'], { env: process.env })
    childProcess.spawnSync(node, ['-e', '0'], { env: null as never })

    expect(names).toStrictEqual(['*', '*', '*', '*'])

    names.length = 0
    childProcess.spawnSync(node, ['-e', '0'], { env: { PATH: '' } })

    // eslint-disable-next-line typescript/strict-void-return -- promisify takes the promise form the function carries.
    await promisify(childProcess.execFile)(node, ['-e', '0'])

    expect(names).toStrictEqual(['*'])
  })

  it('wraps once and reports to the latest receiver alone', () => {
    let first: string[] = []
    let second: string[] = []
    trackSpawners(process.env, name => {
      first.push(name)
    })
    let { spawnSync } = childProcess
    trackSpawners(process.env, name => {
      second.push(name)
    })
    childProcess.spawnSync(process.execPath, ['-e', '0'])

    expect(childProcess.spawnSync).toBe(spawnSync)
    expect([first, second]).toStrictEqual([[], ['*']])

    trackSpawners(process.env, null)
    childProcess.spawnSync(process.execPath, ['-e', '0'])

    expect(second).toStrictEqual(['*'])
  })

  it('says whether a promisified execFile or exec was made before the first call, which no wrapper sees', () => {
    expect(trackSpawners(process.env, null)).toBe(false)
  })
})
