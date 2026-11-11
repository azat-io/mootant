import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeapStatistics } from 'node:v8'

import { createHeapCap } from '../../../adapters/jest/create-heap-cap'

vi.mock(import('node:v8'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, getHeapStatistics: vi.fn(actual.getHeapStatistics) }
})

/**
 * Makes the limit a process has here with no flag read as given.
 *
 * @param bytes - What V8 says.
 */
function setPlainLimit(bytes: number): void {
  let statistics = getHeapStatistics()
  Reflect.set(statistics, 'heap_size_limit', bytes)
  vi.mocked(getHeapStatistics).mockReturnValue(statistics)
}

/**
 * Bytes in a megabyte.
 */
const MEGABYTE = 1024 * 1024

/**
 * Spellings of V8's limit a project can give.
 */
let spellings = [
  '--max-old-space-size=4096',
  '--max_old_space_size=4096',
  '--max-old_space-size=4096',
  '--max_old-space_size=4096',
  '--max-old-space-size-percentage=50',
]

describe('createHeapCap', () => {
  beforeEach(() => {
    setPlainLimit(8192 * MEGABYTE)
  })

  it('starts at 512 MB', () => {
    let heap = createHeapCap({
      env: { NODE_OPTIONS: '--no-warnings' },
      nodeFlags: ['--stack-size=500'],
    })

    expect(heap.current).toBe(512)
  })

  it('starts at 512 MB with no NODE_OPTIONS', () => {
    expect(createHeapCap({ nodeFlags: [], env: {} }).current).toBe(512)
  })

  it.each(spellings)('is null for %s in the flags', flag => {
    let heap = createHeapCap({
      nodeFlags: ['--stack-size=500', flag],
      env: {},
    })

    expect(heap.current).toBeNull()
  })

  it.each(spellings)('is null for %s in NODE_OPTIONS', flag => {
    let heap = createHeapCap({
      env: { NODE_OPTIONS: `--no-warnings ${flag}` },
      nodeFlags: [],
    })

    expect(heap.current).toBeNull()
  })

  it('doubles the cap of the worker that died', () => {
    let heap = createHeapCap({ nodeFlags: [], env: {} })
    heap.raise(512)

    expect(heap.current).toBe(1024)
  })

  it('raises once for three deaths at the same cap', () => {
    let heap = createHeapCap({ nodeFlags: [], env: {} })
    heap.raise(512)
    heap.raise(512)
    heap.raise(512)

    expect(heap.current).toBe(1024)
  })

  it('stops at 4096 MB where a process has more', () => {
    let heap = createHeapCap({ nodeFlags: [], env: {} })
    for (let from of [512, 1024, 2048, 4096]) {
      heap.raise(from)
    }

    expect(heap.current).toBe(4096)
  })

  it('stops at what a process has here with no flag, in whole megabytes, read once', () => {
    setPlainLimit(2096 * MEGABYTE + 7)
    let heap = createHeapCap({ nodeFlags: [], env: {} })
    setPlainLimit(8192 * MEGABYTE)
    for (let from of [512, 1024, 2048, 2096]) {
      heap.raise(from)
    }

    expect(heap.current).toBe(2096)
  })

  it('starts at what a process has here when that is below 512 MB', () => {
    setPlainLimit(300 * MEGABYTE)
    let heap = createHeapCap({ nodeFlags: [], env: {} })

    expect(heap.current).toBe(300)

    heap.raise(300)

    expect(heap.current).toBe(300)
  })

  it('does not lower the cap for a worker that died below it', () => {
    let heap = createHeapCap({ nodeFlags: [], env: {} })
    heap.raise(512)
    heap.raise(1024)
    heap.raise(512)

    expect(heap.current).toBe(2048)
  })
})
