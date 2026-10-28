import type { VitestSessionState } from '../../adapters/vitest/types/vitest-session-state'

/**
 * Builds the state of a Vitest session that has not run yet: the plugin serves
 * switched texts but has served none, and nothing is recorded or reported.
 *
 * @returns Session state with the pool `mootant-forks` and the runner
 *   `/mootant/runner.ts`.
 */
export function createVitestSessionState(): VitestSessionState {
  return {
    pool: { createPoolWorker: () => null as never, name: 'mootant-forks' },
    runnerPath: '/mootant/runner.ts',
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
}
