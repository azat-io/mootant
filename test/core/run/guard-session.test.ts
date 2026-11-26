import type { Mock } from 'vitest'

import { describe, expect, it, vi } from 'vitest'

import type { AdapterSession } from '../../../types/adapter/adapter-session'

import { guardSession } from '../../../core/run/guard-session'

/**
 * Builds a session whose calls resolve at once.
 *
 * @param fields - Members that differ.
 * @returns The session with mocked calls.
 */
function createSession(
  fields: Partial<AdapterSession> = {},
): Record<
  'listTestFiles' | 'runIsolated' | 'runBatch' | 'dryRun' | 'close',
  Mock
> &
  AdapterSession {
  return {
    listTestFiles: vi.fn(() => Promise.resolve(['/repo/test/a.test.ts'])),
    runIsolated: vi.fn(() => Promise.resolve({ units: [] })),
    runBatch: vi.fn(() => Promise.resolve({ units: [] })),
    dryRun: vi.fn(() => Promise.resolve({ files: [] })),
    close: vi.fn(() => Promise.resolve()),
    ...fields,
  } as never
}

/**
 * Builds the signal of a run that goes on.
 *
 * @returns A signal that is not aborted.
 */
function createSignal(): AbortSignal {
  let controller = new AbortController()
  return controller.signal
}

describe('guardSession', () => {
  it('passes the calls, what they give and the facts of the session through', async () => {
    let cacheInputs = vi.fn(() =>
      Promise.resolve({ settings: null, files: [] }),
    )
    let session = createSession({
      version: '5.1.1',
      diagnostics: [],
      cacheInputs,
      workers: 3,
    })
    let guarded = guardSession(session, createSignal())

    await expect(guarded.listTestFiles()).resolves.toStrictEqual([
      '/repo/test/a.test.ts',
    ])
    await expect(guarded.runIsolated({ units: [] })).resolves.toStrictEqual({
      units: [],
    })
    await expect(guarded.runBatch({ units: [] })).resolves.toStrictEqual({
      units: [],
    })
    await expect(guarded.dryRun({} as never)).resolves.toStrictEqual({
      files: [],
    })
    await expect(guarded.cacheInputs!()).resolves.toStrictEqual({
      settings: null,
      files: [],
    })
    await guarded.close()

    expect(guarded).toMatchObject({
      version: '5.1.1',
      diagnostics: [],
      workers: 3,
    })
    expect(session.runIsolated).toHaveBeenCalledExactlyOnceWith({ units: [] })
    expect(session.close).toHaveBeenCalledExactlyOnceWith()
  })

  it('leaves out the cache inputs of a session without them', () => {
    let guarded = guardSession(createSession(), createSignal())

    expect(guarded.cacheInputs).toBeUndefined()
  })

  it('makes no call once the signal aborted, but still closes', async () => {
    let controller = new AbortController()
    let cacheInputs = vi.fn()
    let session = createSession({ cacheInputs })
    let guarded = guardSession(session, controller.signal)
    controller.abort()
    let { reason } = controller.signal

    await expect(guarded.listTestFiles()).rejects.toBe(reason)
    await expect(guarded.runIsolated({ units: [] })).rejects.toBe(reason)
    await expect(guarded.runBatch({ units: [] })).rejects.toBe(reason)
    await expect(guarded.dryRun({} as never)).rejects.toBe(reason)
    await expect(guarded.cacheInputs!()).rejects.toBe(reason)
    await guarded.close()

    expect(session.listTestFiles).not.toHaveBeenCalled()
    expect(session.runIsolated).not.toHaveBeenCalled()
    expect(session.runBatch).not.toHaveBeenCalled()
    expect(session.dryRun).not.toHaveBeenCalled()
    expect(cacheInputs).not.toHaveBeenCalled()
    expect(session.close).toHaveBeenCalledExactlyOnceWith()
  })

  it('waits for a call the signal interrupts and drops what it gives', async () => {
    let controller = new AbortController()
    let ended = false
    let guarded = guardSession(
      createSession({
        runIsolated: async () => {
          controller.abort()
          await Promise.resolve()
          ended = true
          return { units: [] }
        },
      }),
      controller.signal,
    )

    await expect(guarded.runIsolated({ units: [] })).rejects.toBe(
      controller.signal.reason,
    )
    expect(ended).toBe(true)
  })

  it('rejects with the reason over the error of an interrupted call', async () => {
    let controller = new AbortController()
    let guarded = guardSession(
      createSession({
        dryRun: () => {
          controller.abort()
          return Promise.reject(new Error('The worker is gone.'))
        },
      }),
      controller.signal,
    )

    await expect(guarded.dryRun({} as never)).rejects.toBe(
      controller.signal.reason,
    )
  })

  it('lets the error of a call through while the run goes on', async () => {
    let guarded = guardSession(
      createSession({
        runBatch: () => Promise.reject(new Error('Vitest stopped.')),
      }),
      createSignal(),
    )

    await expect(guarded.runBatch({ units: [] })).rejects.toThrow(
      'Vitest stopped.',
    )
  })

  it('reads the facts and methods of a session that is an instance of a class from it', async () => {
    /**
     * Session that keeps its facts in private fields behind getters and its
     * calls in methods of its class.
     */
    class ClassSession {
      /**
       * Test files the session knows.
       */
      public files = ['/repo/test/b.test.ts']

      /**
       * Warnings of the session, read from its private state.
       *
       * @returns The collected warnings.
       */
      public get diagnostics(): readonly [] {
        return this.#warnings
      }

      /**
       * Version of the test runner, read from its private state.
       *
       * @returns A version made of the number of workers.
       */
      public get version(): string {
        return `5.${this.#workers}.0`
      }

      /**
       * Most test files at once, read from its private state.
       *
       * @returns The number of workers.
       */
      public get workers(): number {
        return this.#workers
      }

      /**
       * Warnings the session collected.
       */
      readonly #warnings: readonly [] = []

      /**
       * Most test files at once, changed by the session as it goes.
       */
      #workers = 2

      /**
       * Gives the inputs of the cache from the instance.
       *
       * @returns Inputs without settings, with the test files.
       */
      public cacheInputs(): Promise<{ files: string[]; settings: null }> {
        return Promise.resolve({ files: this.files, settings: null })
      }

      /**
       * Reads the test files from the instance.
       *
       * @returns The field of the instance.
       */
      public listTestFiles(): Promise<string[]> {
        return Promise.resolve(this.files)
      }

      /**
       * Changes the number of workers, as a session may after it started.
       */
      public grow(): void {
        this.#workers += 1
      }
    }
    let session = Object.assign(new ClassSession(), {
      runIsolated: vi.fn(),
      runBatch: vi.fn(),
      dryRun: vi.fn(),
      close: vi.fn(),
    })
    let guarded = guardSession(session, createSignal())

    expect([
      guarded.workers,
      guarded.version,
      guarded.diagnostics,
    ]).toStrictEqual([2, '5.2.0', []])

    session.grow()

    expect([guarded.workers, guarded.version]).toStrictEqual([3, '5.3.0'])
    await expect(guarded.cacheInputs!()).resolves.toStrictEqual({
      files: ['/repo/test/b.test.ts'],
      settings: null,
    })
    await expect(guarded.listTestFiles()).resolves.toStrictEqual([
      '/repo/test/b.test.ts',
    ])
  })

  it('reads the facts of a session that change after it was wrapped', () => {
    let session = createSession({ workers: 1 })
    let guarded = guardSession(session, createSignal())
    session.workers = 4
    session.version = '30.2.0'
    session.diagnostics = []

    expect(guarded).toMatchObject({
      version: '30.2.0',
      diagnostics: [],
      workers: 4,
    })
  })
})
