import { writeFile, realpath, readFile, mkdtemp, rm } from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { LIVE_PROCESS_GROUPS } from '../../../adapters/shared/live-process-groups'
import { readJestConfig } from '../../../adapters/jest/read-jest-config'

/**
 * Temporary directory of the current test, with the fake binary.
 */
let directory = ''

/**
 * What the current test's run sent to its output.
 */
let output: string[] = []

/**
 * Runs `readJestConfig` with a script as Jest's binary.
 *
 * @param script - CommonJS code of the fake binary.
 * @param options - What differs from the default input.
 * @returns What `readJestConfig` returns.
 */
async function read(
  script: string,
  options: Partial<Parameters<typeof readJestConfig>[0]> = {},
): ReturnType<typeof readJestConfig> {
  let bin = path.join(directory, 'bin.cjs')
  await writeFile(bin, script)
  return readJestConfig({
    onOutput: text => {
      output.push(text)
    },
    env: process.env,
    root: directory,
    nodeFlags: [],
    args: [],
    base: [],
    bin,
    ...options,
  })
}

describe('readJestConfig', () => {
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-config-')),
    )
    output = []
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('runs Jest in the root with the flags in order and the environment', async () => {
    let config = await read(
      `console.log(JSON.stringify({
        configs: process.argv.slice(2),
        globalConfig: { cwd: process.cwd(), value: process.env.VALUE, node: process.execArgv },
      }, null, '  '))`,
      {
        env: { ...process.env, VALUE: 'given' },
        nodeFlags: ['--stack-size=500'],
        args: ['-i', '--', 'a'],
        base: ['--ci'],
      },
    )

    expect(config).toStrictEqual({
      globalConfig: {
        node: ['--stack-size=500'],
        cwd: directory,
        value: 'given',
      },
      configs: ['-i', '--showConfig', '--ci', '--', 'a'],
    })
    expect(output).toStrictEqual([])
  })

  it('reads the JSON after what a configuration logs and hands that text on', async () => {
    let config = await read(
      `console.log('{ logged }')
      console.log(JSON.stringify({ configs: [], globalConfig: {} }, null, '  '))`,
    )

    expect(config).toStrictEqual({ globalConfig: {}, configs: [] })
    expect(output).toStrictEqual(['{ logged }\n'])
  })

  it('takes a log shaped like the JSON for a log', async () => {
    let config = await read(
      String.raw`console.log('{\n  "configs": ["mine"]\n}')
      console.log(JSON.stringify({ configs: [], globalConfig: {} }, null, '  '))`,
    )

    expect(config).toStrictEqual({ globalConfig: {}, configs: [] })
    expect(output).toStrictEqual(['{\n  "configs": ["mine"]\n}\n'])
  })

  it('does not wait for a process the configuration leaves on the output', async () => {
    let started = Date.now()

    await read(
      `let { spawn } = require('node:child_process')
      spawn('sleep', ['5'], { detached: true, stdio: 'inherit' }).unref()
      console.log(JSON.stringify({ configs: [], globalConfig: {} }, null, '  '))`,
    )

    expect(Date.now() - started).toBeLessThan(4000)
  })

  it('runs Jest as the leader of a process group mootant tracks', async () => {
    let file = path.join(directory, 'pid')
    let reading = read(
      `require('node:fs').writeFileSync(${JSON.stringify(file)}, String(process.pid))
      setTimeout(() => {}, 120_000)`,
    )
    let pid = await vi.waitFor(async () => {
      let written = await readFile(file, 'utf8')

      expect(written).not.toBe('')

      return Number(written)
    })

    expect(LIVE_PROCESS_GROUPS.has(pid)).toBe(true)

    process.kill(-pid, 'SIGKILL')

    await expect(reading).rejects.toThrow(
      'Jest was stopped by SIGKILL before it printed its configuration:\n',
    )
    expect(LIVE_PROCESS_GROUPS.has(pid)).toBe(false)
  })

  it('rejects with the output of a failed run', async () => {
    await expect(
      read(`console.log('on stdout')
      console.error('on stderr')
      process.exitCode = 1`),
    ).rejects.toThrow(
      /^Jest exited with code 1 before it printed its configuration:\n(?=[\s\S]*on stdout)(?=[\s\S]*on stderr)/u,
    )
    expect(output).toStrictEqual([])
  })

  it('says how a run without output ended', async () => {
    await expect(read('process.exit(1)')).rejects.toThrow(
      /^Jest exited with code 1 before it printed its configuration:\n$/u,
    )
    await expect(read('process.exit(0)')).rejects.toThrow(
      /^Jest printed no configuration mootant can read:\n$/u,
    )
    await expect(read(`process.kill(process.pid, 'SIGKILL')`)).rejects.toThrow(
      /^Jest was stopped by SIGKILL before it printed its configuration:\n$/u,
    )
  })

  it('rejects with the output of a run that prints no configuration', async () => {
    await expect(read(`console.log('no JSON here')`)).rejects.toThrow(
      'Jest printed no configuration mootant can read:\nno JSON here',
    )
  })

  it('rejects with the output of a run that prints broken JSON', async () => {
    await expect(
      read(String.raw`console.log('{\n  "configs": [')`),
    ).rejects.toThrow(
      'Jest printed no configuration mootant can read:\n{\n  "configs": [',
    )
  })

  it('rejects when the process cannot start', async () => {
    await expect(
      read('', { root: path.join(directory, 'missing') }),
    ).rejects.toThrow(
      /^Jest could not start in .*: .*ENOENT; check that the directory exists\.$/u,
    )
  })
})
