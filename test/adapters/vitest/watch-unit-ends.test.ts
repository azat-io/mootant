import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { watchUnitEnds } from '../../../adapters/vitest/watch-unit-ends'

describe('watchUnitEnds', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls back once per finished unit, on every look and at the stop', () => {
    vi.useFakeTimers()
    let directory = mkdtempSync(path.join(tmpdir(), 'mootant-done-'))
    mkdirSync(path.join(directory, 'done'))
    let ends = vi.fn<() => void>()
    let watch = watchUnitEnds(directory, ends)

    writeFileSync(path.join(directory, 'done', 'a-0'), '')
    writeFileSync(path.join(directory, 'done', 'a-1'), '')
    vi.advanceTimersByTime(200)

    expect(ends).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(200)

    expect(ends).toHaveBeenCalledTimes(2)

    writeFileSync(path.join(directory, 'done', 'b-0'), '')
    watch.stop()
    vi.advanceTimersByTime(1000)

    expect(ends).toHaveBeenCalledTimes(3)

    rmSync(directory, { recursive: true })
  })

  it('watches nothing without a callback', () => {
    let watch = watchUnitEnds('/missing', undefined)

    expect(() => {
      watch.stop()
    }).not.toThrow()
  })
})
