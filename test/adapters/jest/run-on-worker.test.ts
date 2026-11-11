import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'
import type { UnitOutcome } from '../../../adapters/jest/types/unit-outcome'
import type { WorkerPool } from '../../../adapters/jest/types/worker-pool'

import { createWorkerPool } from '../../../adapters/jest/create-worker-pool'
import { runOnWorker } from '../../../adapters/jest/run-on-worker'
import { startWorker } from '../../../adapters/jest/start-worker'

/**
 * Start of a tiny worker: `answer` runs for each unit, and it boots.
 */
const BOOT = String.raw`let fs = require('node:fs')
function write(unit, record) {
  fs.appendFileSync(unit.out, JSON.stringify(record) + '\n')
}
process.on('message', ({ unit }) => { answer(unit) })
process.send({ type: 'ready' })
`

/**
 * Tiny worker that writes its records and says the unit ended.
 */
const CLEAN = `${BOOT}
function answer(unit) {
  write(unit, { kind: 'start', time: Date.now() })
  write(unit, { kind: 'finish', time: Date.now() })
  process.send({ type: 'done', last: false })
}`

/**
 * Tiny worker that says the unit ended a few ticks later, and leaves no
 * `finish`.
 */
const SLOW = `${BOOT}
function answer(unit) {
  setTimeout(() => {
    process.send({ type: 'done', last: false })
  }, 250)
}`

/**
 * What fills the heap of a tiny worker until it dies.
 */
const FILL_HEAP = `let kept = []
while (true) {
  kept.push(new Array(1000).fill({}))
}`

/**
 * A loop that never yields, with an end of its own, so that a worker no stop
 * reaches does not stay.
 */
const SPIN = `let end = Date.now() + 120_000
while (Date.now() < end) {}`

/**
 * Temporary directory of the current test.
 */
let directory = ''

/**
 * Pools of the current test, closed after it.
 */
let pools: WorkerPool[] = []

/**
 * Out files made so far in the current test.
 */
let units = 0

/**
 * Runs a unit on the first free slot, with no deadline unless given.
 *
 * @param pool - Workers.
 * @param fields - What differs.
 * @param fields.deadline - Deadline of the watchdog.
 * @param fields.discardWhen - Tells whether the unit's worker goes.
 * @param fields.clean - Whether this is a clean attempt.
 * @param fields.out - Out file of the unit.
 * @returns What the unit left behind.
 */
async function run(
  pool: WorkerPool,
  fields: {
    deadline?(records: readonly JestTimedRecord[], sent: number): number
    discardWhen?(outcome: UnitOutcome): boolean
    clean?: boolean
    out?: string
  } = {},
): ReturnType<typeof runOnWorker> {
  units += 1
  let slot = pool.take()
  try {
    return await runOnWorker(pool, slot, {
      unit: {
        out: fields.out ?? path.join(directory, `${units}.jsonl`),
        file: '/a.test.js',
        console: 'buffer',
        project: 'p',
        mutant: null,
        plan: null,
      },
      deadline: fields.deadline ?? (() => Number.POSITIVE_INFINITY),
      discardWhen: fields.discardWhen ?? (() => false),
      clean: fields.clean ?? false,
    })
  } finally {
    pool.release(slot)
  }
}

/**
 * Creates a pool of tiny workers.
 *
 * @param script - CommonJS code of the worker.
 * @param options - What differs from one silent slot.
 * @param options.output - Receives what the worker writes, with its test file.
 * @param options.nodeFlags - Node flags of the worker.
 * @param options.heapCap - Heap limit from mootant.
 * @param options.size - Number of slots.
 * @returns A pool with no worker yet.
 */
async function createPool(
  script: string,
  options: {
    output?(text: string, file: string | null): void
    nodeFlags?: string[]
    heapCap?: number
    size?: number
  } = {},
): Promise<WorkerPool> {
  let file = path.join(directory, `${pools.length}.cjs`)
  await writeFile(file, script)
  let pool = createWorkerPool({
    start: (slot, uncapped) =>
      startWorker({
        heapCap: uncapped ? null : (options.heapCap ?? null),
        onOutput: options.output ?? (() => {}),
        env: { PATH: process.env['PATH']! },
        nodeFlags: options.nodeFlags ?? [],
        session: '/s/session.json',
        cwd: directory,
        file,
        slot,
      }),
    size: options.size ?? 1,
  })
  pools.push(pool)
  return pool
}

/**
 * Reads the worker of the first free slot.
 *
 * @param pool - Workers.
 * @returns Whether the slot is empty and the process id of its worker, with the
 *   slot free again.
 */
function readSlot(pool: WorkerPool): {
  pid: undefined | number
  empty: boolean
} {
  let slot = pool.take()
  pool.release(slot)
  return { empty: slot.worker === null, pid: slot.worker?.child.pid }
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

describe('runOnWorker', { timeout: 30_000 }, () => {
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-on-worker-')),
    )
    units = 0
  })

  afterEach(async () => {
    await Promise.all(pools.map(pool => pool.close()))
    pools = []
    await rm(directory, { recursive: true, force: true })
  })

  it('runs a unit to its done, and keeps the worker for the next', async () => {
    let pool = await createPool(CLEAN)
    let first = await run(pool)
    let { empty, pid } = readSlot(pool)

    expect(first).toMatchObject({
      records: [{ kind: 'start' }, { kind: 'finish' }],
      signal: null,
      hung: false,
      done: true,
      code: null,
    })
    expect(empty).toBe(false)

    await expect(run(pool)).resolves.toMatchObject({ done: true })
    expect(readSlot(pool).pid).toBe(pid)
  })

  it('makes the out file empty before the unit is sent', async () => {
    let pool = await createPool(SLOW)
    let out = path.join(directory, 'old.jsonl')
    writeFileSync(out, '{"kind":"start","time":1}\n')
    let seen: number[] = []
    let outcome = await run(pool, {
      deadline: records => {
        seen.push(records.length)
        return Number.POSITIVE_INFINITY
      },
      out,
    })

    expect(outcome.records).toStrictEqual([])
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(count => count === 0)).toBe(true)
  })

  it('routes the output of the unit to its test file', async () => {
    let chunks: (string | null)[] = []
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        console.log('from the unit')
        process.send({ type: 'done', last: false })
      }`,
      {
        output: (_text, file) => {
          chunks.push(file)
        },
      },
    )
    await run(pool)

    await expect.poll(() => chunks, { timeout: 10_000 }).toContain('/a.test.js')
  })

  describe('a clean attempt', () => {
    /**
     * Tiny worker whose records tell its process id and how many Node flags it
     * has.
     */
    let telling = `${BOOT}
    function answer(unit) {
      write(unit, { kind: 'start', time: process.pid })
      write(unit, { kind: 'finish', time: process.execArgv.length })
      process.send({ type: 'done', last: false })
    }`

    it('forks with no cap in place of a warm worker, and discards after, with discardWhen false too', async () => {
      let pool = await createPool(telling, { heapCap: 32 })
      let warm = await run(pool)
      let asked = 0
      let clean = await run(pool, {
        discardWhen: () => {
          asked += 1
          return false
        },
        clean: true,
      })
      let [warmStart, warmFinish] = warm.records
      let [cleanStart, cleanFinish] = clean.records

      expect(warmFinish!.time).toBe(1)
      expect(cleanFinish!.time).toBe(0)
      expect(cleanStart!.time).not.toBe(warmStart!.time)
      expect(isAlive(warmStart!.time)).toBe(false)
      expect(isAlive(cleanStart!.time)).toBe(false)
      expect(readSlot(pool).empty).toBe(true)
      expect(asked).toBe(0)
    })

    it('goes on with capped workers after it', async () => {
      let pool = await createPool(telling, { heapCap: 32 })
      await run(pool, { clean: true })
      let next = await run(pool)

      expect(next.records[1]!.time).toBe(1)
      expect(readSlot(pool).pid).toBe(next.records[0]!.time)
    })

    it('reads no running out of memory, as its worker has no limit from mootant', async () => {
      let pool = await createPool(`${BOOT}function answer() { ${FILL_HEAP} }`, {
        nodeFlags: ['--max-old-space-size=32'],
        heapCap: 32,
      })

      await expect(run(pool, { clean: true })).resolves.toMatchObject({
        signal: 'SIGABRT',
        outOfMemory: null,
        done: false,
      })
      expect(readSlot(pool).empty).toBe(true)
    })
  })

  it('stops watching once the unit ended, on a worker that stays', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        setTimeout(() => {
          write(unit, { kind: 'finish', time: 1 })
          process.send({ type: 'done', last: false })
        }, 250)
      }`,
    )
    let calls = 0
    await run(pool, {
      deadline: () => {
        calls += 1
        return Number.POSITIVE_INFINITY
      },
    })
    let ended = calls
    await sleep(350)

    expect(readSlot(pool).empty).toBe(false)
    expect(ended).toBeGreaterThan(0)
    expect(calls).toBe(ended)
  })

  it('keeps no listener of a unit that ended', async () => {
    let pool = await createPool(CLEAN)
    await run(pool)
    let slot = pool.take()
    pool.release(slot)
    let { child } = slot.worker!
    let listeners = child.listenerCount('message')
    await run(pool)

    expect(child.listenerCount('message')).toBe(listeners)
  })

  it('gives the deadline the time the unit was sent', async () => {
    let pool = await createPool(SLOW)
    let seen: number[] = []
    let before = Date.now()
    await run(pool, {
      deadline: (_records, sent) => {
        seen.push(sent)
        return Number.POSITIVE_INFINITY
      },
    })
    let after = Date.now()

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(sent => sent >= before && sent <= after)).toBe(true)
  })

  it('empties the slot after a done with last', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        write(unit, { kind: 'finish', time: Date.now() })
        process.send({ type: 'done', last: true }, () => { process.exit(0) })
      }`,
    )
    let outcome = await run(pool)

    expect(outcome).toMatchObject({
      records: [{ kind: 'finish' }],
      signal: null,
      done: true,
      code: null,
    })
    expect(readSlot(pool).empty).toBe(true)
  })

  it('reads a done with no finish as not done with no exit, and empties the slot', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        write(unit, { kind: 'start', time: 1 })
        process.send({ type: 'done', last: false })
      }`,
    )

    await expect(run(pool)).resolves.toMatchObject({
      records: [{ kind: 'start', time: 1 }],
      signal: null,
      hung: false,
      done: false,
      code: null,
    })
    expect(readSlot(pool).empty).toBe(true)
  })

  it('reads a finish with an exit and no done as done, and empties the slot', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        write(unit, { kind: 'finish', time: 1 })
        process.exit(3)
      }`,
    )

    await expect(run(pool)).resolves.toMatchObject({
      records: [{ kind: 'finish', time: 1 }],
      signal: null,
      hung: false,
      done: true,
      code: 3,
    })
    expect(readSlot(pool).empty).toBe(true)
  })

  it('reads no hang from a worker stopped past finish that cannot say it ended', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        write(unit, { kind: 'finish', time: 1 })
        ${SPIN}
      }`,
    )

    await expect(
      run(pool, {
        deadline: records => (records.length > 0 ? 0 : Infinity),
      }),
    ).resolves.toMatchObject({
      records: [{ kind: 'finish', time: 1 }],
      signal: 'SIGKILL',
      hung: false,
      done: true,
      code: null,
    })
    expect(readSlot(pool).empty).toBe(true)
  })

  it('stops a sync loop past the deadline, and reads hung', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        write(unit, { kind: 'start', time: Date.now() })
        ${SPIN}
      }`,
    )
    let started = Date.now()
    let outcome = await run(pool, {
      deadline: (records, sent) => (records.length > 0 ? sent + 200 : Infinity),
    })

    expect(outcome).toMatchObject({
      records: [{ kind: 'start' }],
      signal: 'SIGKILL',
      done: false,
      hung: true,
      code: null,
    })
    expect(Date.now() - started).toBeLessThan(20_000)
    expect(readSlot(pool).empty).toBe(true)
  })

  it('still reads done when the tick that stops the worker comes with its done on the way', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        let timer = setInterval(() => {
          if (fs.existsSync(unit.out + '.tick')) {
            clearInterval(timer)
            process.send({ type: 'done', last: false })
            write(unit, { kind: 'finish', time: 1 })
            setTimeout(() => {}, 120_000)
          }
        }, 5)
      }`,
    )
    let out = path.join(directory, 'crossed.jsonl')
    let outcome = await run(pool, {
      deadline: () => {
        // Main sits in this tick until the record is there, which the script
        // writes after its message, so the message waits on the channel.
        writeFileSync(`${out}.tick`, '')
        while (readFileSync(out, 'utf8') === '') {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
        }
        return 0
      },
      out,
    })

    expect(outcome).toMatchObject({
      records: [{ kind: 'finish', time: 1 }],
      signal: null,
      hung: false,
      done: true,
      code: null,
    })
    expect(readSlot(pool).empty).toBe(true)
  })

  it('reads a hang when the done of a stopped worker comes with no finish', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        let timer = setInterval(() => {
          if (fs.existsSync(unit.out + '.tick')) {
            clearInterval(timer)
            process.send({ type: 'done', last: false })
            fs.writeFileSync(unit.out + '.sent', '')
            setTimeout(() => {}, 120_000)
          }
        }, 5)
      }`,
    )
    let out = path.join(directory, 'crossed.jsonl')
    let outcome = await run(pool, {
      deadline: () => {
        writeFileSync(`${out}.tick`, '')
        while (!existsSync(`${out}.sent`)) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
        }
        return 0
      },
      out,
    })

    expect(outcome).toMatchObject({ done: false, records: [], hung: true })
    expect(readSlot(pool).empty).toBe(true)
  })

  it('does not call a worker hung once it exited, while what it left holds the output', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        require('node:child_process').spawn('sleep', ['1'], {
          stdio: ['ignore', 'inherit', 'inherit'],
          detached: true,
        }).unref()
        write(unit, { kind: 'start', time: process.pid })
        process.exit(0)
      }`,
    )

    await expect(
      run(pool, {
        // Past the deadline only for a tick that comes after the exit, which
        // must not ask. The time of the record holds the process id.
        deadline: ([record]) =>
          record === undefined || isAlive(record.time) ? Infinity : 0,
      }),
    ).resolves.toMatchObject({ hung: false, done: false, code: 0 })
  })

  it('tolerates a torn last line', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        write(unit, { kind: 'finish', time: 1 })
        fs.appendFileSync(unit.out, '{"kind":"sta')
        process.send({ type: 'done', last: false })
      }`,
    )

    await expect(run(pool)).resolves.toMatchObject({
      records: [{ kind: 'finish', time: 1 }],
      done: true,
    })
  })

  it('reads a torn finish as no finish', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        write(unit, { kind: 'start', time: 1 })
        fs.appendFileSync(unit.out, '{"kind":"fin')
        process.exit(1)
      }`,
    )

    await expect(run(pool)).resolves.toMatchObject({
      records: [{ kind: 'start', time: 1 }],
      done: false,
      code: 1,
    })
  })

  it('ignores what a test sends on its own', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        process.send('x')
        process.send(null)
        process.send({ type: 'other', last: true })
        setTimeout(() => {
          write(unit, { kind: 'finish', time: 1 })
          process.send({ type: 'done', last: false })
        }, 150)
      }`,
    )

    await expect(run(pool)).resolves.toMatchObject({
      records: [{ kind: 'finish', time: 1 }],
      done: true,
    })
    expect(readSlot(pool).empty).toBe(false)
  })

  it('reads an exit without done, and empties the slot', async () => {
    let pool = await createPool(
      `${BOOT}
      function answer(unit) {
        write(unit, { kind: 'start', time: 1 })
        process.exit(7)
      }`,
    )

    await expect(run(pool)).resolves.toMatchObject({
      records: [{ kind: 'start', time: 1 }],
      signal: null,
      hung: false,
      done: false,
      code: 7,
    })
    expect(readSlot(pool).empty).toBe(true)
  })

  it('gives the exit of a worker that did not boot, with no records, and empties the slot', async () => {
    let pool = await createPool('process.exitCode = 5')

    await expect(run(pool)).resolves.toStrictEqual({
      startup: expect.any(Number) as number,
      outOfMemory: null,
      signal: null,
      records: [],
      hung: false,
      done: false,
      code: 5,
    })
    expect(readSlot(pool).empty).toBe(true)
  })

  it('reads the exit when the channel is closed, and rejects when the pool is closed', async () => {
    let pool = await createPool(CLEAN)
    await run(pool)
    let slot = pool.take()
    let worker = slot.worker!
    pool.release(slot)
    worker.child.disconnect()

    await expect(run(pool)).resolves.toMatchObject({ done: false, code: 0 })

    await pool.close()

    await expect(run(pool)).rejects.toThrow('mootant closed its Jest workers')
  })

  describe('out file', () => {
    it.each([
      ['a unit that ended', CLEAN],
      ['a worker that exited', `${BOOT}function answer() { process.exit(1) }`],
      ['a worker that did not boot', 'process.exitCode = 5'],
    ])('is gone after %s', async (_name, script) => {
      let pool = await createPool(script)
      let out = path.join(directory, 'gone.jsonl')
      let during: boolean[] = []
      await run(pool, {
        deadline: () => {
          during.push(existsSync(out))
          return Infinity
        },
        discardWhen: () => {
          during.push(existsSync(out))
          return false
        },
        out,
      })

      expect(existsSync(out)).toBe(false)
      expect(during.at(-1)).toBe(false)
    })

    it('is gone after a closed pool rejects the unit', async () => {
      let pool = await createPool(CLEAN)
      await pool.close()
      let out = path.join(directory, 'gone.jsonl')

      await expect(run(pool, { out })).rejects.toThrow(
        'mootant closed its Jest workers',
      )
      expect(existsSync(out)).toBe(false)
    })

    it('rejects a unit whose directory is gone', async () => {
      let pool = await createPool(CLEAN)

      await expect(
        run(pool, { out: path.join(directory, 'no/out.jsonl') }),
      ).rejects.toThrow(/ENOENT/u)
    })

    it('leaves no descriptor open', async () => {
      let pool = await createPool(CLEAN)
      await run(pool)
      let before = readdirSync('/dev/fd').length
      await run(pool)
      await run(pool)
      await run(pool)

      expect(readdirSync('/dev/fd').length - before).toBeLessThan(3)
    })

    it('still reads what a worker writes after a test removed the file, and no tick throws', async () => {
      let pool = await createPool(
        String.raw`${BOOT}
        function answer(unit) {
          let descriptor = fs.openSync(unit.out, 'a')
          fs.rmSync(unit.out)
          fs.writeSync(descriptor, '{"kind":"start","time":1}\n')
          setTimeout(() => {
            fs.writeSync(descriptor, '{"kind":"finish","time":2}\n')
            process.send({ type: 'done', last: false })
          }, 250)
        }`,
      )
      let seen: number[] = []

      await expect(
        run(pool, {
          deadline: records => {
            seen.push(records.length)
            return Infinity
          },
        }),
      ).resolves.toMatchObject({
        records: [
          { kind: 'start', time: 1 },
          { kind: 'finish', time: 2 },
        ],
        done: true,
      })
      expect(seen.length).toBeGreaterThan(0)
    })
  })

  describe('discardWhen', () => {
    it('gets what the unit left behind, and keeps the worker when it says no', async () => {
      let pool = await createPool(CLEAN, { size: 2 })
      let seen: UnitOutcome[] = []
      let outcome = await run(pool, {
        discardWhen: ended => {
          seen.push(ended)
          return false
        },
      })
      let { empty, pid } = readSlot(pool)

      expect(seen).toStrictEqual([outcome])
      expect(empty).toBe(false)
      expect(isAlive(pid!)).toBe(true)
    })

    it('empties the slot of the worker that ran the unit, while it holds the slot', async () => {
      let pool = await createPool(CLEAN, { size: 2 })
      let first = pool.take()
      await pool.obtain(first, { uncapped: false })
      let suspect = first.worker!
      pool.release(first)
      let free: number[] = []
      let live: boolean[] = []
      await run(pool, {
        discardWhen: () => {
          let other = pool.take()
          free.push(other.index)
          live.push(suspect.alive())
          pool.release(other)
          return true
        },
      })

      expect(free).toStrictEqual([2])
      expect(live).toStrictEqual([true])
      expect(first.worker).toBeNull()
      expect(suspect.alive()).toBe(false)
    })

    it('leaves the worker of another slot alone', async () => {
      let pool = await createPool(CLEAN, { size: 2 })
      let busy = pool.take()
      let free = pool.take()
      await pool.obtain(busy, { uncapped: false })
      await pool.obtain(free, { uncapped: false })
      let innocent = busy.worker!
      let suspect = free.worker!
      pool.release(free)
      await run(pool, { discardWhen: () => true })

      expect(free.worker).toBeNull()
      expect(suspect.alive()).toBe(false)
      expect(busy.worker).toBe(innocent)
      expect(innocent.alive()).toBe(true)
    })

    it('runs for a worker that did not boot, with the slot already empty', async () => {
      let pool = await createPool('process.exitCode = 5')
      let seen: boolean[] = []
      await run(pool, {
        discardWhen: outcome => {
          seen.push(outcome.done)
          return true
        },
      })

      expect(seen).toStrictEqual([false])
      expect(readSlot(pool).empty).toBe(true)
    })
  })

  describe('outOfMemory', () => {
    it('holds the cap of a worker that died in a unit, with the slot empty', async () => {
      let pool = await createPool(
        `${BOOT}
        function answer(unit) {
          write(unit, { kind: 'start', time: 1 })
          ${FILL_HEAP}
        }`,
        { heapCap: 32 },
      )

      await expect(run(pool)).resolves.toMatchObject({
        records: [{ kind: 'start', time: 1 }],
        signal: 'SIGABRT',
        outOfMemory: 32,
        hung: false,
        done: false,
        code: null,
      })
      expect(readSlot(pool).empty).toBe(true)
    })

    it('holds the cap of a worker that died before it booted, with the slot empty', async () => {
      let pool = await createPool(FILL_HEAP, { heapCap: 32 })

      await expect(run(pool)).resolves.toMatchObject({
        signal: 'SIGABRT',
        outOfMemory: 32,
        records: [],
        done: false,
      })
      expect(readSlot(pool).empty).toBe(true)
    })

    it.each<[string, string]>([
      ['died in a unit', `${BOOT}function answer() { ${FILL_HEAP} }`],
      ['died before it booted', FILL_HEAP],
    ])('is null without a cap for a worker that %s', async (_name, script) => {
      let pool = await createPool(script, {
        nodeFlags: ['--max-old-space-size=32'],
      })

      await expect(run(pool)).resolves.toMatchObject({
        signal: 'SIGABRT',
        outOfMemory: null,
        done: false,
      })
    })

    it('is null for a unit that ended', async () => {
      let pool = await createPool(CLEAN, { heapCap: 32 })

      await expect(run(pool)).resolves.toMatchObject({
        outOfMemory: null,
        done: true,
      })
    })

    it('is null for a worker that exited another way', async () => {
      let pool = await createPool(
        `${BOOT}
        function answer() {
          process.stderr.write('heap out of memory')
          process.exit(1)
        }`,
        { heapCap: 32 },
      )

      await expect(run(pool)).resolves.toMatchObject({
        outOfMemory: null,
        done: false,
        code: 1,
      })
    })
  })

  describe('startup', () => {
    it('counts what the pool took to fork, and neither a warm worker nor a discard', async () => {
      let pool = await createPool(CLEAN)
      let { discard, obtain } = pool
      let real = Date.now.bind(Date)
      let shift = 0
      let clock = vi.spyOn(Date, 'now').mockImplementation(() => real() + shift)
      pool.obtain = async (slot, options) => {
        let warm = slot.worker?.alive() === true
        let worker = await obtain(slot, options)
        shift += warm ? 0 : 1e9
        return worker
      }
      pool.discard = async slot => {
        await discard(slot)
        shift += 1e12
      }
      try {
        let forked = await run(pool)
        let warm = await run(pool)
        let replaced = await run(pool, { clean: true })

        expect(forked.startup).toBeGreaterThanOrEqual(1e9)
        expect(warm.startup).toBeLessThan(1e9)
        expect(replaced.startup).toBeGreaterThanOrEqual(1e9)
        expect(replaced.startup).toBeLessThan(1e12)
      } finally {
        clock.mockRestore()
      }
    })
  })
})
