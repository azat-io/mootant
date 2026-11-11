import type { ChildProcess } from 'node:child_process'

import { writeFile, readFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { setTimeout as sleep } from 'node:timers/promises'
import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestProject } from '../../../adapters/jest/types/jest-project'
import type { JestHost } from '../../../adapters/jest/types/jest-host'

import { LIVE_PROCESS_GROUPS } from '../../../adapters/shared/live-process-groups'
import { startJestHost } from '../../../adapters/jest/start-jest-host'

vi.mock(import('node:child_process'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, fork: vi.fn(actual.fork) as typeof actual.fork }
})

/**
 * Code that sends a `ready` message and ends on the first message it gets.
 */
let readyScript = `
  process.send({
    tests: [
      { project: 'kept', path: '/kept.test.js' },
      { project: 'skipped', path: '/skipped.test.js' },
    ],
    moduleMaps: { kept: { mocks: [], rootDir: '/' } },
    cwd: process.cwd(),
    type: 'ready',
    loaded: [],
    env: {},
  })
  process.on('message', () => process.exit(0))
`

/**
 * Temporary directory of the current test, with the fake binary.
 */
let directory = ''

/**
 * What the current test's host sent to its output.
 */
let output: string[] = []

/**
 * Hosts of the current test, closed after it.
 */
let hosts: JestHost[] = []

/**
 * Starts a host with a script as Jest's binary, with one kept project.
 *
 * @param script - CommonJS code of the fake binary.
 * @param options - What differs from the default input.
 * @returns What `startJestHost` returns.
 */
async function start(
  script: string,
  options: Partial<Parameters<typeof startJestHost>[0]> = {},
): ReturnType<typeof startJestHost> {
  let bin = path.join(directory, 'bin.cjs')
  await writeFile(bin, script)
  let host = await startJestHost({
    files: {
      results: '/work/results.cjs',
      runner: '/work/runner.host',
      worker: '/work/worker.cjs',
      noop: '/work/noop.cjs',
      directory,
    },
    projects: [{ config: { id: 'kept' } } as JestProject],
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
  hosts.push(host)
  return host
}

/**
 * Tells whether a process lives.
 *
 * @param pid - Its id, negative for a process group.
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

/**
 * Reads the child process of the last host started.
 *
 * @returns The child process.
 */
function readChild(): ChildProcess {
  return vi.mocked(fork).mock.results.at(-1)!.value as ChildProcess
}

describe('startJestHost', { timeout: 30_000 }, () => {
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-host-')),
    )
    output = []
  })

  afterEach(async () => {
    vi.useRealTimers()
    await Promise.all(hosts.map(host => host.close()))
    hosts = []
    vi.mocked(fork).mockClear()
    await rm(directory, { recursive: true, force: true })
  })

  it('forks the binary with the flags in order, in its own group and the root', async () => {
    let { ready } = await start(
      `process.send({
        env: { value: process.env.VALUE, node: process.execArgv.join(' ') },
        tests: [{ project: 'kept', path: '/kept.test.js' }],
        loaded: process.argv.slice(2),
        cwd: process.cwd(),
        type: 'ready',
        moduleMaps: {},
      })
      process.on('message', () => process.exit(0))`,
      {
        env: { ...process.env, VALUE: 'given' },
        nodeFlags: ['--stack-size=500'],
        args: ['-i', '--', 'a'],
        base: ['--ci'],
      },
    )

    expect(ready).toStrictEqual({
      loaded: [
        '-i',
        '--ci',
        '--runner=/work/runner.host',
        '--reporters=/work/noop.cjs',
        '--testResultsProcessor=/work/results.cjs',
        '--passWithNoTests',
        '--forceExit',
        '--',
        'a',
      ],
      tests: [{ path: '/kept.test.js', project: 'kept' }],
      env: { node: '--stack-size=500', value: 'given' },
      moduleMaps: {},
      cwd: directory,
      type: 'ready',
    })
    expect(isAlive(-readChild().pid!)).toBe(true)
  })

  it('keeps the test files of the kept projects only, and counts those of every project', async () => {
    let { testCount, ready } = await start(readyScript)

    expect(ready.tests).toStrictEqual([
      { path: '/kept.test.js', project: 'kept' },
    ])
    expect(ready.moduleMaps).toStrictEqual({
      kept: { rootDir: '/', mocks: [] },
    })
    expect(testCount).toBe(2)
  })

  it('takes only the ready message for ready', async () => {
    let { ready } = await start(
      `process.send('ready')
      process.send(null)
      process.send({ type: 'other' })
      process.send({ type: 'ready' })
      ${readyScript}`,
    )

    expect(ready.type).toBe('ready')
  })

  it('hands on the output without the line of --forceExit', async () => {
    let host = await start(
      String.raw`console.log('out')
      process.send({ type: 'ready', tests: [{ project: 'kept', path: '/a' }] })
      process.on('message', () => {
        process.stderr.write(
          'before\n\u001B[1mForce exiting Jest: \u001B[22mHave you considered it?\nafter\n',
          () => process.exit(0),
        )
      })`,
    )
    await host.close()

    let text = output.join('')

    expect(text).toContain('out\n')
    expect(text).toContain('before\nafter\n')
    expect(text).not.toContain('Force exiting')
  })

  it('sends nothing for a chunk that holds only the line of --forceExit', async () => {
    let host = await start(
      `process.send({ type: 'ready', tests: [{ project: 'kept', path: '/a' }] })
      process.on('message', () => {
        process.stderr.write(
          'Force exiting Jest: Have you considered it?',
          () => process.exit(0),
        )
      })`,
    )
    await host.close()

    expect(output).toStrictEqual([])
  })

  it('closes the host through the channel, once, and leaves nothing behind', async () => {
    let done = path.join(directory, 'closed')
    let host = await start(
      `process.send({ type: 'ready', tests: [{ project: 'kept', path: '/a' }] })
      process.on('message', message => {
        require('node:fs').writeFileSync(${JSON.stringify(done)}, JSON.stringify(message))
        process.exit(0)
      })`,
    )
    let child = readChild()

    expect(LIVE_PROCESS_GROUPS.has(child.pid!)).toBe(true)
    expect(host.close()).toBe(host.close())

    await expect(host.close()).resolves.toStrictEqual({
      how: 'exited with code 0',
      finished: false,
      stopped: false,
      obsolete: [],
      early: false,
      output: '',
      code: 0,
    })
    await expect(readFile(done, 'utf8')).resolves.toBe('{"type":"close"}')
    expect(isAlive(child.pid!)).toBe(false)
    expect(LIVE_PROCESS_GROUPS.has(child.pid!)).toBe(false)
    expect(child.connected).toBe(false)
  })

  it('stops what is left of the group when the host ends', async () => {
    let host = await start(
      `let { spawn } = require('node:child_process')
      let left = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)'], { stdio: 'ignore' })
      process.send({
        tests: [{ project: 'kept', path: '/a' }],
        loaded: [String(left.pid)],
        type: 'ready',
      })
      process.on('message', () => process.exit(0))`,
    )
    let left = Number(host.ready.loaded[0])

    expect(isAlive(left)).toBe(true)

    await host.close()

    await vi.waitFor(() => {
      expect(isAlive(left)).toBe(false)
    })
  })

  it('stops the group of a host that does not end in time', async () => {
    let host = await start(
      `process.send({ type: 'ready', tests: [{ project: 'kept', path: '/a' }] })
      process.on('message', () => {})
      setTimeout(() => {}, 120_000)`,
    )
    let { pid } = readChild()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let closed = host.close()
    vi.advanceTimersByTime(59_999)
    await sleep(100)

    expect(isAlive(pid!)).toBe(true)

    vi.advanceTimersByTime(1)
    vi.useRealTimers()

    await expect(closed).resolves.toMatchObject({ stopped: true, code: null })
    expect(isAlive(pid!)).toBe(false)
  })

  it('tells how a host that failed after close ended, with the tail of what it wrote', async () => {
    let host = await start(
      `process.send({ type: 'ready', tests: [{ project: 'kept', path: '/a' }] })
      process.on('message', () => {
        console.error('teardown broke')
        process.exitCode = 1
        process.disconnect()
      })`,
    )

    await expect(host.close()).resolves.toStrictEqual({
      output: 'teardown broke\n',
      how: 'exited with code 1',
      finished: false,
      stopped: false,
      obsolete: [],
      early: false,
      code: 1,
    })
  })

  it('tells that Jest reached its results processor, with the snapshot files its mark lists', async () => {
    let mark = path.join(directory, 'results-reached')
    let host = await start(
      `process.send({ type: 'ready', tests: [{ project: 'kept', path: '/a' }] })
      process.on('message', () => {
        require('node:fs').writeFileSync(${JSON.stringify(mark)}, '["/p/a.snap"]')
        process.exitCode = 1
        process.disconnect()
      })`,
    )

    await expect(host.close()).resolves.toMatchObject({
      obsolete: ['/p/a.snap'],
      finished: true,
      code: 1,
    })
  })

  it('rejects with the output of a host that fails before ready', async () => {
    await expect(
      start(`console.error('Jest says no')
      process.exitCode = 3`),
    ).rejects.toThrow(
      'Jest exited with code 3 before it reached its tests:\nJest says no',
    )
    expect(isAlive(readChild().pid!)).toBe(false)
    expect(output).toStrictEqual(['Jest says no\n'])
  })

  it('rejects with the whole output of a host that fails before ready', async () => {
    await expect(
      start(`console.error('the reason')
      console.error('x'.repeat(10_000))
      process.exitCode = 1`),
    ).rejects.toThrow(
      /^Jest exited with code 1 before it reached its tests:\nthe reason\nx{10000}\n$/u,
    )
  })

  it('rejects when a signal ends a host before ready', async () => {
    await expect(start(`process.kill(process.pid, 'SIGKILL')`)).rejects.toThrow(
      'Jest was stopped by SIGKILL before it reached its tests:',
    )
  })

  it('rejects when Jest exits with 0 before ready, as with --passWithNoTests', async () => {
    await expect(start(`process.exitCode = 0`)).rejects.toThrow(
      `Jest found no test files in ${directory}; add a test or fix the Jest configuration.`,
    )
  })

  it('closes the host and rejects when no kept project has test files', async () => {
    let done = path.join(directory, 'closed')

    await expect(
      start(
        `process.send({ type: 'ready', tests: [{ project: 'skipped', path: '/a' }] })
        process.on('message', () => {
          require('node:fs').writeFileSync(${JSON.stringify(done)}, '')
          process.exit(0)
        })`,
      ),
    ).rejects.toThrow(
      `Jest found no test files in ${directory}; add a test or fix the Jest configuration.`,
    )
    expect(existsSync(done)).toBe(true)
    expect(isAlive(readChild().pid!)).toBe(false)
  })

  it('rejects when the process cannot start', async () => {
    await expect(
      start(readyScript, { root: path.join(directory, 'missing') }),
    ).rejects.toThrow(
      /^Jest could not start in .*: .*ENOENT; check that the directory exists\.$/u,
    )
  })

  it('does not wait long for output a detached process holds', async () => {
    let started = Date.now()

    await expect(
      start(`let { spawn } = require('node:child_process')
      spawn('sleep', ['5'], { detached: true, stdio: 'inherit' }).unref()
      process.exitCode = 1`),
    ).rejects.toThrow('Jest exited with code 1')
    expect(Date.now() - started).toBeLessThan(4000)
    expect(readChild().stdout!.destroyed).toBe(true)
  })

  it('resolves died with the tail of the output when the host dies', async () => {
    let host = await start(
      `console.log('x'.repeat(5000) + 'server is up')
      ${readyScript}`,
    )
    await vi.waitFor(() => {
      expect(output.join('')).toContain('server is up')
    })
    process.kill(readChild().pid!, 'SIGKILL')

    let error = await host.died

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toMatch(
      /^The Jest process that ran global setup was stopped by SIGKILL, and what global setup started went with it; its last output:\nx+server is up\n$/u,
    )
    expect(error.message.length).toBeLessThan(4200)

    await expect(host.close()).resolves.toMatchObject({
      how: 'was stopped by SIGKILL',
      stopped: false,
      early: true,
    })
  })

  it('holds no more than the tail of what a parked host writes', async () => {
    let host = await start(
      `${readyScript}
      setTimeout(() => {
        process.stdout.write('x'.repeat(5000) + 'last words', () => {
          process.kill(process.pid, 'SIGKILL')
        })
      }, 50)`,
    )
    let error = await host.died

    expect(error.message).toContain('last words')
    expect(error.message.length).toBeLessThan(4200)
  })

  it('does not resolve died when the host ends after close', async () => {
    let host = await start(readyScript)
    await host.close()

    await expect(
      Promise.race([host.died, sleep(100, 'pending')]),
    ).resolves.toBe('pending')
  })
})
