import { writeSync, closeSync, openSync } from 'node:fs'

import type { WorkerChannel } from '../types/worker-channel'

/**
 * `fs.writeSync` as this module loads: CommonJS output reads a named import on
 * the real module at each use, where a test's `jest.spyOn(fs, ...)` reaches
 * it.
 */
let writeLine = writeSync

/**
 * `fs.closeSync` as this module loads.
 */
let closeFile = closeSync

/**
 * `fs.openSync` as this module loads.
 */
let openFile = openSync

/**
 * `Date.now` of the worker's realm as this module loads, which neither fake
 * timers nor spies in a vm reach.
 */
let { now } = Date

/**
 * Creates the channel of a worker, the writer of the records of its units. A
 * record carries the token of its unit, so a leftover timer of an earlier unit
 * cannot write into this one. Writing never throws into test code: `mock-fs`
 * replaces the binding that even a captured `writeSync` goes through, so a line
 * that fails to write stays queued, with what follows it, for the next write.
 *
 * @returns The channel, with no unit yet.
 */
export function createWorkerChannel(): WorkerChannel {
  let descriptor: number | null = null
  let queue: string[] = []

  /**
   * Writes the queued lines in order and forgets each one written.
   *
   * @param target - Descriptor of the out file.
   */
  function flush(target: number): void {
    while (queue.length > 0) {
      writeLine(target, queue[0]!)
      queue.shift()
    }
  }

  let channel: WorkerChannel = {
    write(token, record) {
      if (descriptor === null || token !== channel.token) {
        return
      }
      try {
        queue.push(`${JSON.stringify({ ...record, time: now() })}\n`)
        flush(descriptor)
      } catch {}
    },
    end() {
      if (descriptor === null) {
        return
      }
      try {
        flush(descriptor)
      } catch {}
      try {
        closeFile(descriptor)
      } catch {}
      descriptor = null
      queue = []
    },
    begin(unit) {
      channel.token += 1
      channel.unit = unit
      channel.vm = null
      descriptor = openFile(unit.out, 'a')
      channel.write(channel.token, { kind: 'start' })
      return channel.token
    },
    enterEnvironment() {},
    unit: null,
    vm: null,
    token: 0,
  }
  return channel
}
