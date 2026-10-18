import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { NodeTestRecord } from '../../../../adapters/node-test/types/node-test-record'
import type { TryContext } from '../../../../adapters/node-test/types/try-context'

import { installModuleHooks } from '../../../../adapters/node-test/preload/install-module-hooks'

vi.mock(import('node:test'), () => ({ beforeEach: vi.fn() }) as never)

vi.mock(import('node:worker_threads'), () => ({ isMainThread: true }) as never)

vi.mock(
  import('../../../../adapters/node-test/preload/install-module-hooks'),
  () => ({ installModuleHooks: vi.fn(() => 'sync' as const) }),
)

vi.mock(import('../../../../adapters/node-test/preload/track-inputs'), () => ({
  trackInputs: vi.fn(() => () => ({
    environment: ['A'],
    modified: [],
    files: [],
  })),
}))

vi.mock(import('../../../../core/runtime/install-mutant-runtime'), () => ({
  installMutantRuntime: vi.fn(() => ({
    hitLimit: Infinity,
    hit: () => false,
    coverage: null,
    reached: false,
    active: null,
    hits: 0,
  })),
}))

/**
 * Reads the records of an out file.
 *
 * @param file - Path of the out file.
 * @returns Its records.
 */
async function readRecords(file: string): Promise<NodeTestRecord[]> {
  let text = await readFile(file, 'utf8')
  return text
    .split('\n')
    .filter(line => line !== '')
    .map(line => JSON.parse(line) as NodeTestRecord)
}

/**
 * Gives the mocked root `beforeEach` of node:test.
 *
 * @returns The mock the preload registers its hook with.
 */
async function getRootBeforeEach(): Promise<
  ReturnType<typeof vi.fn<(hook: unknown) => void>>
> {
  let nodeTest = await import('node:test')
  return vi.mocked(nodeTest.beforeEach) as never
}

describe('preload', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.resetModules()
    delete process.env['MOOTANT_UNIT']
    Reflect.deleteProperty(globalThis, Symbol.for('mootant.served'))
    Reflect.deleteProperty(globalThis, Symbol.for('mootant.loaded'))
    Reflect.deleteProperty(globalThis, Symbol.for('mootant.reported'))
  })

  it('does nothing in a process that is not a unit', async () => {
    let on = vi.spyOn(process, 'on')
    await import('../../../../adapters/node-test/preload/preload')

    expect(vi.mocked(installModuleHooks)).not.toHaveBeenCalled()
    await expect(getRootBeforeEach()).resolves.not.toHaveBeenCalled()
    expect(on).not.toHaveBeenCalled()
  })

  it('wires the hooks, the tracker and the listeners of a unit', async () => {
    let directory = await mkdtemp(path.join(tmpdir(), 'mootant-preload-'))
    let plan = path.join(directory, 'plan.json')
    let out = path.join(directory, 'out.jsonl')
    await writeFile(plan, '{}')
    process.env['MOOTANT_UNIT'] = JSON.stringify({
      root: directory,
      hitLimit: null,
      mutant: null,
      expected: [],
      mode: 'dry',
      bail: false,
      plan,
      out,
    })
    let handlers = new Map<string, (value: unknown) => void>()
    vi.spyOn(process, 'on').mockImplementation((event, handler) => {
      handlers.set(String(event), handler as (value: unknown) => void)
      return process
    })
    await import('../../../../adapters/node-test/preload/preload')

    expect(process.env['MOOTANT_UNIT']).toBeUndefined()

    let [api, options] = vi.mocked(installModuleHooks).mock.calls[0]!

    expect(typeof api.register).toBe('function')
    expect(options.hooks.href).toMatch(/\/preload\/hooks\.ts$/u)
    expect(options.data).toStrictEqual({
      main: options.data.main,
      plan,
      out,
    })

    let global = globalThis as Record<
      symbol,
      ((value?: unknown) => void) | undefined
    >
    global[Symbol.for('mootant.served')]?.('/a.js')
    global[Symbol.for('mootant.loaded')]?.()
    global[Symbol.for('mootant.reported')]?.({
      kind: 'root-hook',
      message: 'm',
    })
    global[Symbol.for('mootant.reported')]?.({
      failed: false,
      kind: 'todo',
    })
    let [open] = (await getRootBeforeEach()).mock.calls[0]! as [
      (context: TryContext) => void,
    ]
    let context: TryContext = {
      after: () => {},
      fullName: 'a',
      passed: true,
      error: null,
    }
    open(context)
    handlers.get('uncaughtExceptionMonitor')!(new Error('thrown'))
    handlers.get('unhandledRejection')!(new Error('rejected'))
    handlers.get('exit')!(0)
    let records = await readRecords(out)

    expect(records[0]).toMatchObject({
      node: process.version,
      pid: process.pid,
      kind: 'start',
      hooks: 'sync',
    })
    expect(records.slice(1, -1)).toStrictEqual([
      { kind: 'served', file: '/a.js' },
      { kind: 'loaded' },
      { kind: 'root-hook', message: 'm' },
      { failed: false, kind: 'todo' },
      { occurrence: 0, kind: 'open', name: 'a', seq: 0 },
      {
        message: 'thrown',
        kind: 'error',
        load: false,
        tries: [0],
        hits: 0,
      },
      {
        message: 'rejected',
        kind: 'error',
        load: false,
        tries: [0],
        hits: 0,
      },
      expect.objectContaining({ unfinished: true, kind: 'try' }),
    ])
    expect(records.at(-1)).toMatchObject({
      required: expect.any(Array) as unknown,
      environment: ['A'],
      kind: 'end',
      code: 0,
    })

    await rm(directory, { recursive: true })
  })
})
