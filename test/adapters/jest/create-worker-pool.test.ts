import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { WorkerPool } from '../../../adapters/jest/types/worker-pool'
import type { WorkerSlot } from '../../../adapters/jest/types/worker-slot'

import { createWorkerPool } from '../../../adapters/jest/create-worker-pool'
import { startWorker } from '../../../adapters/jest/start-worker'

/**
 * Tiny worker: it boots and waits.
 */
const WORKER = `process.on('message', () => {})
process.send({ type: 'ready' })`

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * Pools of the current test, closed after it.
 */
let pools: WorkerPool[] = []

/**
 * Creates a pool of workers that run a tiny script.
 *
 * @param input - How the pool is made.
 * @param input.script - CommonJS code of a worker.
 * @param input.size - Number of slots.
 * @param input.cwd - Working directory of a worker.
 * @returns The pool, the slots it forked for and whether each fork was told it
 *   gets no heap limit.
 */
async function createPool(
  input: { script?: string; size?: number; cwd?: string } = {},
): Promise<{ uncapped: boolean[]; pool: WorkerPool; forked: number[] }> {
  let file = path.join(directory, `${pools.length}.cjs`)
  await writeFile(file, input.script ?? WORKER)
  let uncapped: boolean[] = []
  let forked: number[] = []
  let pool = createWorkerPool({
    start: (slot, told) => {
      uncapped.push(told)
      forked.push(slot)
      return startWorker({
        env: { PATH: process.env['PATH']! },
        cwd: input.cwd ?? directory,
        session: '/s/session.json',
        onOutput: () => {},
        heapCap: null,
        nodeFlags: [],
        file,
        slot,
      })
    },
    size: input.size ?? 1,
  })
  pools.push(pool)
  return { uncapped, forked, pool }
}

/**
 * Gives the worker of a slot, with a heap limit when it forks one.
 *
 * @param pool - Workers.
 * @param slot - Slot to give a worker of.
 * @returns What the pool gives.
 */
function obtain(
  pool: WorkerPool,
  slot: WorkerSlot,
): ReturnType<WorkerPool['obtain']> {
  return pool.obtain(slot, { uncapped: false })
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

describe('createWorkerPool', { timeout: 30_000 }, () => {
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-pool-')),
    )
  })

  afterEach(async () => {
    await Promise.all(pools.map(pool => pool.close()))
    pools = []
    await rm(directory, { recursive: true, force: true })
  })

  it('takes free slots numbered from 1 and frees them', async () => {
    let { pool } = await createPool({ size: 2 })
    let first = pool.take()
    let second = pool.take()

    expect(pool.size).toBe(2)
    expect([first.index, second.index]).toStrictEqual([1, 2])

    pool.release(first)

    expect(pool.take()).toBe(first)
  })

  it('keeps the workers of two slots apart, each with its number', async () => {
    let { forked, pool } = await createPool({
      script: `process.on('message', () => {
        process.send(process.env.MOOTANT_SLOT)
      })
      process.send({ type: 'ready' })`,
      size: 2,
    })
    let first = pool.take()
    let second = pool.take()
    let workers = await Promise.all([obtain(pool, first), obtain(pool, second)])
    let slots = await Promise.all(
      workers.map(
        worker =>
          new Promise(resolve => {
            worker!.child.on('message', message => {
              if (typeof message === 'string') {
                resolve(message)
              }
            })
            worker!.child.send('which')
          }),
      ),
    )

    expect(forked).toStrictEqual([1, 2])
    expect(slots).toStrictEqual(['1', '2'])
    expect(first.worker).toBe(workers[0])
    expect(second.worker).toBe(workers[1])
    expect(workers[0]!.child.pid).not.toBe(workers[1]!.child.pid)
  })

  it('gives the live worker of a slot again', async () => {
    let { forked, pool } = await createPool()
    let slot = pool.take()
    let worker = await obtain(pool, slot)

    await expect(obtain(pool, slot)).resolves.toBe(worker)
    expect(forked).toStrictEqual([1])
  })

  it('tells the fork whether the worker goes without a heap limit, and gives a live one as it is', async () => {
    let { uncapped, pool } = await createPool({ size: 3 })
    let capped = pool.take()
    let clean = pool.take()
    let told = pool.take()
    await obtain(pool, capped)
    await pool.obtain(clean, { uncapped: true })
    await pool.obtain(told, { uncapped: false })

    expect(uncapped).toStrictEqual([false, true, false])

    await expect(pool.obtain(capped, { uncapped: true })).resolves.toBe(
      capped.worker,
    )
    expect(uncapped).toHaveLength(3)
  })

  it('replaces a dead idle worker', async () => {
    let { forked, pool } = await createPool()
    let slot = pool.take()
    let worker = await obtain(pool, slot)
    process.kill(worker!.child.pid!, 'SIGKILL')
    await worker!.exited
    let next = await obtain(pool, slot)

    expect(forked).toStrictEqual([1, 1])
    expect(next).not.toBe(worker)
    expect(next!.alive()).toBe(true)
  })

  it('resolves null for a worker that did not boot, and leaves it in the slot for its exit', async () => {
    let { pool } = await createPool({ script: 'process.exitCode = 4' })
    let slot = pool.take()

    await expect(obtain(pool, slot)).resolves.toBeNull()
    await expect(slot.worker!.exited).resolves.toMatchObject({ code: 4 })
  })

  it('rejects when the process cannot start, and neither discard nor close waits for it', async () => {
    let { forked, pool } = await createPool({
      cwd: path.join(directory, 'missing'),
    })
    let slot = pool.take()

    await expect(obtain(pool, slot)).rejects.toThrow(
      'A Jest worker could not start',
    )
    expect(slot.worker).not.toBeNull()
    await expect(pool.close()).resolves.toBeUndefined()
    await expect(pool.discard(slot)).resolves.toBeUndefined()
    expect(slot.worker).toBeNull()
    expect(forked).toStrictEqual([1])
  })

  it('stops the group of a worker on discard, waits for its exit and empties the slot', async () => {
    let { pool } = await createPool()
    let slot = pool.take()
    let worker = await obtain(pool, slot)
    await pool.discard(slot)

    expect(slot.worker).toBeNull()
    expect(worker!.alive()).toBe(false)
    expect(isAlive(worker!.child.pid!)).toBe(false)
    await expect(worker!.exited).resolves.toMatchObject({ signal: 'SIGKILL' })
  })

  it('discards an empty slot and a worker that already exited', async () => {
    let { pool } = await createPool({ script: 'process.exitCode = 4' })
    let slot = pool.take()

    await expect(pool.discard(slot)).resolves.toBeUndefined()

    await obtain(pool, slot)
    await pool.discard(slot)

    expect(slot.worker).toBeNull()
  })

  describe('discardAll', () => {
    it('stops the workers of every idle slot, waits for their exits and empties the slots', async () => {
      let { pool } = await createPool({ size: 2 })
      let first = pool.take()
      let second = pool.take()
      let workers = await Promise.all([
        obtain(pool, first),
        obtain(pool, second),
      ])
      pool.release(first)
      pool.release(second)
      await pool.discardAll()

      expect([first.worker, second.worker]).toStrictEqual([null, null])
      expect(workers.map(worker => worker!.alive())).toStrictEqual([
        false,
        false,
      ])
      expect(workers.map(worker => isAlive(worker!.child.pid!))).toStrictEqual([
        false,
        false,
      ])
    })

    it('leaves the worker of a slot that is taken alone', async () => {
      let { pool } = await createPool({ size: 2 })
      let busy = pool.take()
      let idle = pool.take()
      let kept = await obtain(pool, busy)
      await obtain(pool, idle)
      pool.release(idle)
      await pool.discardAll()

      expect(busy.worker).toBe(kept)
      expect(kept!.alive()).toBe(true)
      expect(idle.worker).toBeNull()
    })

    it('forks a new worker for a slot it emptied', async () => {
      let { forked, pool } = await createPool()
      let slot = pool.take()
      let worker = await obtain(pool, slot)
      pool.release(slot)
      await pool.discardAll()
      let next = await obtain(pool, pool.take())

      expect(forked).toStrictEqual([1, 1])
      expect(next).not.toBe(worker)
      expect(next!.alive()).toBe(true)
    })

    it('settles with slots that are empty, or whose process could not start', async () => {
      let { pool } = await createPool({
        cwd: path.join(directory, 'missing'),
        size: 2,
      })
      let slot = pool.take()

      await expect(obtain(pool, slot)).rejects.toThrow(
        'A Jest worker could not start',
      )

      pool.release(slot)

      await expect(pool.discardAll()).resolves.toBeUndefined()
      expect(slot.worker).toBeNull()
    })
  })

  it('forks nothing after close, which rejects with a sentence', async () => {
    let { forked, pool } = await createPool()
    let slot = pool.take()
    await pool.close()

    await expect(obtain(pool, slot)).rejects.toThrow(
      'mootant closed its Jest workers; no test can run now.',
    )
    expect(forked).toStrictEqual([])
  })

  it('stops every live group on close, with one promise', async () => {
    let { pool } = await createPool({ size: 2 })
    let workers = await Promise.all([
      obtain(pool, pool.take()),
      obtain(pool, pool.take()),
    ])
    let closed = pool.close()

    expect(pool.close()).toBe(closed)
    await closed

    expect(workers.map(worker => worker!.alive())).toStrictEqual([false, false])
  })

  it('gives null to an obtain that close overtakes', async () => {
    let { pool } = await createPool({
      script: 'setTimeout(() => {}, 120_000)',
    })
    let slot = pool.take()
    let obtaining = obtain(pool, slot)
    await sleep(10)
    await pool.close()

    await expect(obtaining).resolves.toBeNull()
    await expect(slot.worker!.exited).resolves.toMatchObject({
      signal: 'SIGKILL',
    })
  })
})
