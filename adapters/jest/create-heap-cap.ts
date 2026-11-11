import { getHeapStatistics } from 'node:v8'

import type { HeapCap } from './types/heap-cap'

/**
 * A limit of the project's own, in every spelling V8 takes: it reads the last
 * flag, and `execArgv` beats `NODE_OPTIONS`, so a spelling missed here would
 * hold a project that asked for 4096 MB at the first cap.
 */
const OWN_LIMIT = /--max[-_]old[-_]space[-_]size/u

/**
 * Megabytes a worker starts with.
 */
const FIRST_CAP = 512

/**
 * Most megabytes a worker gets, on a machine where a process has more.
 */
const LAST_CAP = 4096

/**
 * Bytes in a megabyte.
 */
const MEGABYTE = 1024 * 1024

/**
 * Creates the heap limit of the workers of a session: a low one, as it holds
 * down the memory of a worker on a heavy graph at little cost, which rises when
 * a worker runs out of memory, up to what a process has here with no flag, so
 * that a warm worker never holds more than a plain run could.
 *
 * @param input - What the workers start with.
 * @param input.nodeFlags - Node flags of the test command.
 * @param input.env - Environment of the workers.
 * @returns The limit.
 */
export function createHeapCap(input: {
  env: Record<string, string>
  nodeFlags: string[]
}): HeapCap {
  let own = [...input.nodeFlags, input.env['NODE_OPTIONS'] ?? ''].some(flags =>
    OWN_LIMIT.test(flags),
  )
  let top = Math.min(
    LAST_CAP,
    Math.floor(getHeapStatistics().heap_size_limit / MEGABYTE),
  )
  let heap: HeapCap = {
    raise(from) {
      heap.current = Math.min(top, Math.max(heap.current!, 2 * from))
    },
    current: own ? null : Math.min(top, FIRST_CAP),
  }
  return heap
}
