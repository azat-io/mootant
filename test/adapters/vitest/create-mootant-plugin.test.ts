import type { TestProject } from 'vitest/node'

import { describe, expect, it, vi } from 'vitest'

import type { VitestSessionState } from '../../../adapters/vitest/types/vitest-session-state'
import type { AdapterContext } from '../../../types/adapter/adapter-context'

import { createMootantPlugin } from '../../../adapters/vitest/create-mootant-plugin'
import { configureProject } from '../../../adapters/vitest/configure-project'

vi.mock(import('../../../adapters/vitest/configure-project'), () => ({
  configureProject: vi.fn<(...parameters: unknown[]) => void>(),
}))

/**
 * Creates the plugin with one switched file.
 *
 * @returns Plugin, its state and its transform hook.
 */
function setup(): {
  transform(code: string, id: string): unknown
  state: VitestSessionState
  context: AdapterContext
} {
  let context = {
    files: [{ file: '/project/src/a.ts', switched: 'B', original: 'A' }],
  } as never
  let state: VitestSessionState = {
    pool: { createPoolWorker: () => null as never, name: 'pool' },
    runnerPath: '/runner.ts',
    mismatched: new Set(),
    instrumented: true,
    outside: new Set(),
    spawns: new Map(),
    served: new Set(),
    environment: {},
    keys: new Map(),
    diagnostics: [],
    files: null,
    error: null,
  }
  let plugin = createMootantPlugin(context, state)
  let { handler } = plugin.transform as {
    handler(code: string, id: string): unknown
  }
  return { transform: handler, context, state }
}

describe('createMootantPlugin', () => {
  it('serves the switched text of a listed file', () => {
    let { transform, state } = setup()

    expect(transform('A', '/project/src/a.ts')).toStrictEqual({
      code: 'B',
      map: null,
    })
    expect(transform('changed', '/project/src/a.ts')).toBeNull()
    expect([...state.served]).toStrictEqual(['/project/src/a.ts'])
    expect([...state.mismatched]).toStrictEqual(['/project/src/a.ts'])
  })

  it('serves the switched text of the external script of a Vue component', () => {
    let { transform, state } = setup()

    expect(
      transform('A', '/project/src/a.ts?vue&type=script&src=true&lang.ts'),
    ).toStrictEqual({ code: 'B', map: null })
    expect([...state.served]).toStrictEqual(['/project/src/a.ts'])
  })

  it('runs before the transforms of other pre plugins', () => {
    let { context, state } = setup()

    expect(createMootantPlugin(context, state).transform).toMatchObject({
      order: 'pre',
    })
  })

  it('leaves other modules alone', () => {
    let { transform, state } = setup()

    expect(transform('A', '\0virtual')).toBeNull()
    expect(transform('A', '/project/src/a.ts?raw')).toBeNull()
    expect(transform('A', '/project/src/b.ts')).toBeNull()

    state.instrumented = false

    expect(transform('A', '/project/src/a.ts')).toBeNull()
    expect(state.served.size).toBe(0)
  })

  it('configures every project', () => {
    let { context, state } = setup()
    let plugin = createMootantPlugin(context, state)
    let project = {} as TestProject
    let hook = plugin.configureVitest as (context: {
      project: TestProject
    }) => void
    hook({ project })

    expect(plugin).toMatchObject({ name: 'mootant', enforce: 'pre' })
    expect(configureProject).toHaveBeenCalledWith(project, state)
  })
})
