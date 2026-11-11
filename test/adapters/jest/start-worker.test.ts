import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestWorker } from '../../../adapters/jest/types/jest-worker'

import { stopProcessGroup } from '../../../adapters/shared/stop-process-group'
import { startWorker } from '../../../adapters/jest/start-worker'

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * Workers of the current test, stopped after it.
 */
let workers: JestWorker[] = []

/**
 * Output of the workers of the current test.
 */
let output: { file: string | null; text: string }[] = []

/**
 * Forks a tiny script as a worker.
 *
 * @param script - CommonJS code.
 * @param fields - Options that differ.
 * @returns The worker.
 */
async function start(
  script: string,
  fields: Partial<Parameters<typeof startWorker>[0]> = {},
): Promise<JestWorker> {
  let file = path.join(directory, `${workers.length}.cjs`)
  await writeFile(file, script)
  let worker = startWorker({
    onOutput: (text, from) => {
      output.push({ file: from, text })
    },
    env: { PATH: process.env['PATH']! },
    session: '/s/session.json',
    cwd: directory,
    heapCap: null,
    nodeFlags: [],
    slot: 1,
    file,
    ...fields,
  })
  workers.push(worker)
  return worker
}

/**
 * Lists what a test file got of the output.
 *
 * @param file - Test file, or null.
 * @returns Its chunks, joined.
 */
function readOutput(file: string | null): string {
  return output
    .filter(entry => entry.file === file)
    .map(entry => entry.text)
    .join('')
}

/**
 * Waits for the next message of a worker's process.
 *
 * @param worker - Worker that sends it.
 * @returns What it sent.
 */
function nextMessage(worker: JestWorker): Promise<unknown> {
  return new Promise(resolve => {
    worker.child.once('message', resolve)
  })
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

describe('startWorker', { timeout: 30_000 }, () => {
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-start-worker-')),
    )
  })

  afterEach(async () => {
    vi.useRealTimers()
    await Promise.all(
      workers.map(async worker => {
        if (worker.alive()) {
          stopProcessGroup(worker.child.pid!)
          await worker.exited
        }
      }),
    )
    workers = []
    output = []
    await rm(directory, { recursive: true, force: true })
  })

  it('forks with the working directory, the Node flags and the environment plus the two variables, with no heap flag', async () => {
    let worker = await start(
      `process.send({
        session: process.env.MOOTANT_SESSION,
        slot: process.env.MOOTANT_SLOT,
        heap: process.env.MOOTANT_HEAP_FLAG ?? null,
        flags: process.execArgv,
        own: process.env.OWN,
        cwd: process.cwd(),
      })
      process.send({ type: 'ready' })
      process.on('message', () => {})`,
      {
        env: { PATH: process.env['PATH']!, OWN: 'kept' },
        nodeFlags: ['--stack-size=500'],
        slot: 2,
      },
    )
    let message = await nextMessage(worker)

    expect(message).toStrictEqual({
      flags: ['--stack-size=500'],
      session: '/s/session.json',
      cwd: directory,
      own: 'kept',
      heap: null,
      slot: '2',
    })
    await expect(worker.ready).resolves.toBe(true)
    expect(worker.alive()).toBe(true)
    expect(worker.file).toBeNull()
  })

  it('adds the heap limit after the flags of the command, and names the flag in a variable', async () => {
    let worker = await start(
      `process.send({
        heap: process.env.MOOTANT_HEAP_FLAG,
        flags: process.execArgv,
      })
      process.on('message', () => {})`,
      { nodeFlags: ['--stack-size=500'], heapCap: 64 },
    )

    await expect(nextMessage(worker)).resolves.toStrictEqual({
      flags: ['--stack-size=500', '--max-old-space-size=64'],
      heap: '--max-old-space-size=64',
    })
    expect(worker.heapCap).toBe(64)
  })

  it('takes only a ready message for ready', async () => {
    let worker = await start(
      `process.send('x')
      process.send(null)
      process.send({ type: 'other' })
      process.on('message', () => {
        process.send({ type: 'ready' })
      })`,
    )
    let settled = false
    void worker.ready.then(() => {
      settled = true
    })
    await new Promise(resolve => {
      worker.child.on('message', message => {
        if ((message as { type?: string } | null)?.type === 'other') {
          resolve(message)
        }
      })
    })

    expect(settled).toBe(false)

    worker.child.send('go')

    await expect(worker.ready).resolves.toBe(true)
  })

  it('routes each chunk to the file of the unit last sent, a late one too', async () => {
    let worker = await start(
      String.raw`console.log('at boot')
      process.send({ type: 'ready' })
      process.on('message', text => {
        process.stdout.write(text + ' out\n')
        process.stderr.write(text + ' err\n')
        process.send('written')
      })`,
    )
    await worker.ready

    await expect
      .poll(() => readOutput(null), { timeout: 10_000 })
      .toContain('at boot')

    /**
     * Makes the worker write and waits for both chunks.
     *
     * @param text - What it writes.
     * @param file - Test file that must get it.
     */
    async function write(text: string, file: string): Promise<void> {
      worker.child.send(text)

      await expect
        .poll(() => readOutput(file), { timeout: 10_000 })
        .toMatch(new RegExp(`(?=[^]*${text} out)(?=[^]*${text} err)`, 'u'))
    }

    worker.file = '/a.test.js'
    await write('first', '/a.test.js')
    await write('late', '/a.test.js')
    worker.file = '/b.test.js'
    await write('next', '/b.test.js')

    expect(readOutput('/a.test.js')).not.toContain('next')
    expect(readOutput('/b.test.js')).not.toContain('late')
    expect(readOutput(null)).not.toContain('first')
  })

  describe('out of memory', () => {
    it('finds the words split across two chunks, with SIGABRT', async () => {
      let worker = await start(
        `process.stderr.write('JavaScript heap out of memo')
        setTimeout(() => {
          process.stderr.write('ry')
          process.kill(process.pid, 'SIGABRT')
        }, 200)`,
      )
      await worker.exited

      expect(worker.child.signalCode).toBe('SIGABRT')
      expect(output.map(entry => entry.text)).toStrictEqual([
        'JavaScript heap out of memo',
        'ry',
      ])
      expect(worker.outOfMemory()).toBe(true)
    })

    it('finds the words before a long tail of output, with code 134', async () => {
      let worker = await start(
        String.raw`process.stderr.write('JavaScript heap out of memory\n')
        process.stderr.write('native stack\n'.repeat(5000), () => {
          process.exit(134)
        })`,
      )
      await worker.exited

      expect(readOutput(null).length).toBeGreaterThan(5000)
      expect(worker.outOfMemory()).toBe(true)
    })

    it('reads the words and an ordinary exit as no such thing', async () => {
      let worker = await start(
        `process.stderr.write('heap out of memory')
        process.exit(1)`,
      )
      await worker.exited

      expect(readOutput(null)).toBe('heap out of memory')
      expect(worker.outOfMemory()).toBe(false)
    })

    it('reads SIGABRT with no words as no such thing', async () => {
      let worker = await start(`process.kill(process.pid, 'SIGABRT')`)
      await worker.exited

      expect(worker.child.signalCode).toBe('SIGABRT')
      expect(worker.outOfMemory()).toBe(false)
    })

    it('reads a real exit under a low limit, with its output still handed on', async () => {
      let worker = await start(
        `let kept = []
        while (true) {
          kept.push(new Array(1000).fill({}))
        }`,
        { nodeFlags: ['--max-old-space-size=32'] },
      )
      let { signal, code } = await worker.exited

      expect([signal, code]).toStrictEqual(['SIGABRT', null])
      expect(readOutput(null)).toContain('heap out of memory')
      expect(worker.heapCap).toBeNull()
      expect(worker.outOfMemory()).toBe(true)
    })
  })

  it('stops the group of a worker silent past the limit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let worker = await start(`setTimeout(() => {}, 120_000)`)

    vi.advanceTimersByTime(59_999)

    await expect(
      Promise.race([worker.ready, sleep(50, 'pending')]),
    ).resolves.toBe('pending')
    expect(worker.alive()).toBe(true)

    vi.advanceTimersByTime(1)

    await expect(worker.ready).resolves.toBe(false)
    await expect(worker.exited).resolves.toMatchObject({
      signal: 'SIGKILL',
      code: null,
    })
    expect(worker.alive()).toBe(false)
  })

  it('leaves a worker that said ready alone past the limit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let worker = await start(
      `process.on('message', () => {})
      process.send({ type: 'ready' })`,
    )
    await worker.ready
    vi.advanceTimersByTime(60_000)
    await sleep(100)

    expect(worker.alive()).toBe(true)
  })

  it('drops the limit of a worker that exited', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let worker = await start('process.exitCode = 3')
    await worker.exited

    expect(vi.getTimerCount()).toBe(0)
  })

  it('drops the limit of a process that cannot start', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let worker = await start('', { cwd: path.join(directory, 'missing') })

    await expect(worker.ready).rejects.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('gives false for a worker that exits before ready, and how it ended', async () => {
    let worker = await start('process.exitCode = 3')

    await expect(worker.ready).resolves.toBe(false)
    await expect(worker.exited).resolves.toMatchObject({
      signal: null,
      code: 3,
    })
    expect(worker.alive()).toBe(false)
  })

  it('rejects with a sentence when the process cannot start', async () => {
    let worker = await start('', { cwd: path.join(directory, 'missing') })

    expect(worker.alive()).toBe(false)
    await expect(worker.ready).rejects.toThrow(
      /^A Jest worker could not start: .*ENOENT.*\.$/u,
    )
    expect(worker.alive()).toBe(false)
  })

  it('leads a group whose children stop with it', async () => {
    let worker = await start(
      `let { spawn } = require('node:child_process')
      let child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)'], { stdio: 'ignore' })
      process.on('message', () => {})
      process.send({ pid: child.pid })
      process.send({ type: 'ready' })`,
    )
    let { pid } = (await nextMessage(worker)) as { pid: number }
    await worker.ready

    expect(isAlive(pid)).toBe(true)

    stopProcessGroup(worker.child.pid!)
    await worker.exited

    await expect.poll(() => isAlive(pid), { timeout: 10_000 }).toBe(false)
  })
})
