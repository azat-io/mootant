import { afterEach, describe, expect, it } from 'vitest'

import { dropSignalListeners } from '../../../adapters/vitest/drop-signal-listeners'

/**
 * Listeners the current test added, removed after it.
 */
let added: [event: string, listener: () => void][] = []

/**
 * Adds a listener to this process for the current test.
 *
 * @param event - Event to listen to.
 * @param once - Whether the listener runs once.
 * @returns The listener.
 */
function listen(event: string, once = false): () => void {
  /**
   * Does nothing.
   */
  function listener(): void {}
  if (once) {
    process.once(event, listener)
  } else {
    process.on(event, listener)
  }
  added.push([event, listener])
  return listener
}

describe('dropSignalListeners', () => {
  afterEach(() => {
    for (let [event, listener] of added) {
      process.off(event, listener)
    }
    added = []
  })

  it('drops the listeners of SIGINT and SIGTERM added during the start, keeping the others', async () => {
    let before = listen('SIGINT')
    let { interrupt, terminate, hangUp, exit } = await dropSignalListeners(
      async () => {
        await Promise.resolve()
        return {
          interrupt: listen('SIGINT', true),
          terminate: listen('SIGTERM'),
          exit: listen('exit', true),
          hangUp: listen('SIGHUP'),
        }
      },
    )
    let after = listen('SIGTERM')

    expect(process.listeners('SIGINT')).toContain(before)
    expect(process.listeners('SIGINT')).not.toContain(interrupt)
    expect(process.listeners('SIGTERM')).not.toContain(terminate)
    expect(process.listeners('SIGTERM')).toContain(after)
    expect(process.listeners('SIGHUP')).toContain(hangUp)
    expect(process.listeners('exit')).toContain(exit)
  })

  it('gives what the start gives and stops dropping when the start fails', async () => {
    let newListeners = process.listenerCount('newListener')

    await expect(dropSignalListeners(() => Promise.resolve(3))).resolves.toBe(3)
    await expect(
      dropSignalListeners(() => Promise.reject(new Error('No config.'))),
    ).rejects.toThrow('No config.')
    expect(process.listenerCount('newListener')).toBe(newListeners)
  })
})
