import { describe, expect, it } from 'vitest'

import { installExitGuards } from '../../../../adapters/jest/worker/install-exit-guards'

/**
 * What a guard listens with.
 */
type Listener = (error: unknown) => void

/**
 * Creates a process with listeners, and a stderr and an exit that note their
 * calls in one list, since a real exit does not return and what follows it
 * never runs.
 *
 * @returns The process and what it recorded.
 */
function createProcess(): {
  target: Parameters<typeof installExitGuards>[0]
  emit(event: string, value: unknown): void
  listeners: Map<string, Listener[]>
  calls: unknown[][]
} {
  let listeners = new Map<string, Listener[]>()
  let calls: unknown[][] = []
  return {
    target: {
      on(event, listener) {
        listeners.set(event, [...(listeners.get(event) ?? []), listener])
      },
      stderr: {
        write(text) {
          calls.push(['write', text])
        },
      },
      removeAllListeners(event) {
        listeners.delete(event)
      },
      exit(code) {
        calls.push(['exit', code])
      },
    },
    emit(event, value) {
      for (let listener of listeners.get(event)!) {
        listener(value)
      }
    },
    listeners,
    calls,
  }
}

describe('installExitGuards', () => {
  it('removes the listeners a unit left on the three events and no others', () => {
    let { listeners, target } = createProcess()

    /**
     * Listener a unit left.
     */
    function left(): void {}

    target.on('uncaughtException', left)
    target.on('unhandledRejection', left)
    target.on('rejectionHandled', left)
    target.on('beforeExit', left)
    installExitGuards(target)

    expect(listeners.get('uncaughtException')).not.toContain(left)
    expect(listeners.get('unhandledRejection')).not.toContain(left)
    expect(listeners.has('rejectionHandled')).toBe(false)
    expect(listeners.get('beforeExit')).toStrictEqual([left])
  })

  it.each(['uncaughtException', 'unhandledRejection'])(
    'writes the error, then exits with 1, on %s',
    event => {
      let { target, calls, emit } = createProcess()
      installExitGuards(target)
      emit(event, new Error('boom\nmore'))

      expect(calls).toStrictEqual([
        ['write', 'mootant: an error outside any test: boom\n'],
        ['exit', 1],
      ])
    },
  )

  it('leaves one guard on each event after it ran twice', () => {
    let { listeners, target, calls, emit } = createProcess()
    installExitGuards(target)
    installExitGuards(target)
    emit('uncaughtException', 'text')

    expect(listeners.get('uncaughtException')).toHaveLength(1)
    expect(listeners.get('unhandledRejection')).toHaveLength(1)
    expect(calls.filter(([name]) => name === 'exit')).toStrictEqual([
      ['exit', 1],
    ])
  })
})
