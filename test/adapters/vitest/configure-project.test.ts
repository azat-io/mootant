import type { TestProject } from 'vitest/node'

import { describe, expect, it } from 'vitest'

import type { VitestSessionState } from '../../../adapters/vitest/types/vitest-session-state'

import { configureProject } from '../../../adapters/vitest/configure-project'

/**
 * Creates a project with the given settings.
 *
 * @param config - Settings over a default configuration.
 * @returns Fake project.
 */
function createProject(config: Record<string, unknown> = {}): TestProject {
  return {
    config: {
      sequence: { concurrent: true, shuffle: true },
      typecheck: { enabled: false, only: false },
      snapshotOptions: { updateSnapshot: 'new' },
      browser: { enabled: false },
      includeTaskLocation: false,
      fsModuleCache: true,
      experimental: {},
      pool: 'forks',
      isolate: true,
      retry: 3,
      ...config,
    },
    globalConfig: { snapshotOptions: { updateSnapshot: 'all' } },
    vitest: { snapshot: { options: { updateSnapshot: 'new' } } },
    name: '',
  } as never
}

/**
 * Creates an empty session state.
 *
 * @returns Session state.
 */
function createState(): VitestSessionState {
  return {
    pool: { createPoolWorker: () => null as never, name: 'mootant-forks' },
    runnerPath: '/mootant/runner.ts',
    mismatched: new Set(),
    instrumented: true,
    outside: new Set(),
    served: new Set(),
    environment: {},
    keys: new Map(),
    diagnostics: [],
    files: null,
    error: null,
  }
}

describe('configureProject', () => {
  it("overrides the project's settings for mootant", () => {
    let project = createProject()
    let state = createState()
    configureProject(project, state)

    expect(project.config).toMatchObject({
      sequence: { concurrent: true, shuffle: false },
      snapshotOptions: { updateSnapshot: 'none' },
      runner: '/mootant/runner.ts',
      includeTaskLocation: true,
      poolRunner: state.pool,
      pool: 'mootant-forks',
      fsModuleCache: false,
      isolate: true,
      retry: 3,
    })
    expect(project.globalConfig.snapshotOptions.updateSnapshot).toBe('none')
    expect(project.vitest.snapshot.options.updateSnapshot).toBe('none')
    expect(state.diagnostics).toStrictEqual([])
  })

  it('warns when it changes the pool or isolation', () => {
    let project = createProject({ pool: 'threads', isolate: false })
    let state = createState()
    configureProject(project, state)

    expect(state.diagnostics).toStrictEqual([
      {
        message:
          "mootant runs the Vitest project with pool: 'forks'; tests that depend on pool: 'threads' may fail in the dry run.",
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      },
      {
        message:
          'mootant runs the Vitest project with isolate: true; tests that depend on isolate: false may fail in the dry run.',
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      },
    ])
  })

  it('records the first unsupported setting', () => {
    let state = createState()
    configureProject(createProject({ browser: { enabled: true } }), state)
    configureProject(createProject({ pool: 'vmForks' }), state)

    expect(state.error).toContain('browser mode')
  })

  it('leaves typecheck-only projects alone', () => {
    let project = createProject({
      typecheck: { enabled: true, only: true },
      pool: 'vmForks',
    })
    let state = createState()
    configureProject(project, state)
    configureProject(
      createProject({ typecheck: { enabled: true, only: false } }),
      state,
    )

    expect(project.config.pool).toBe('vmForks')
    expect(state.error).toBeNull()
  })
})
