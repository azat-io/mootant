import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { LimitSettings, RunState } from '../../types/run/run-state'
import type { FakeAdapter, FakeWorld } from './create-fake-adapter'

import { createRunState } from '../../core/run/create-run-state'
import { createFakeAdapter } from './create-fake-adapter'
import { readDryRun } from '../../core/run/read-dry-run'
import { createMutant } from './create-mutant'

/**
 * Default limit settings of a run.
 */
export const TEST_LIMITS: LimitSettings = {
  hitLimit: { floor: 100_000, factor: 100 },
  timeout: { constant: 250, factor: 3 },
}

/**
 * State and session of a run over a simulated project.
 */
interface TestRun {
  /**
   * Session of the fake adapter, after the dry run.
   */
  session: AdapterSession

  /**
   * Fake adapter with its calls; the dry run is not among them.
   */
  fake: FakeAdapter

  /**
   * State created from the dry run.
   */
  state: RunState
}

/**
 * Starts a fake adapter over a simulated project, hosts the given mutants of
 * `/src/a.ts` in one switched file, runs the dry run and creates the state the
 * batch and isolated phases start from.
 *
 * @param world - Simulated project.
 * @param options - Mutants and run settings.
 * @param options.mutants - Ids of the pending mutants.
 * @param options.isolate - Whether every covered mutant runs isolated, as
 *   outside fast mode; fast mode when omitted.
 * @param options.workers - Test files expected to run at once; 1 when omitted.
 * @returns State, session and fake adapter.
 */
export async function createTestRun(
  world: FakeWorld,
  options: { isolate?: boolean; mutants: string[]; workers?: number },
): Promise<TestRun> {
  let fake = createFakeAdapter(world)
  let session = await fake.adapter.start({
    files: [
      {
        switched: options.mutants.map(id => `hit("${id}")`).join(';'),
        file: '/src/a.ts',
        original: '',
      },
    ],
    workDirectory: '/work',
    concurrency: null,
    root: '/',
  })
  let dry = await session.dryRun({
    timeouts: { file: 60_000, test: 60_000 },
    related: ['/src/a.ts'],
    instrumented: true,
    repeat: true,
    files: null,
  })
  fake.calls.dry = []
  let state = createRunState({
    mutants: options.mutants.map(id =>
      createMutant({ file: 'src/a.ts', start: 0, end: 1, id }),
    ),
    fast: options.isolate !== true,
    workers: options.workers ?? 1,
    batch: fake.adapter.batch,
    analysis: readDryRun(dry),
    limits: TEST_LIMITS,
    errors: new Map(),
    report: () => {},
    root: '/',
  })
  return { session, state, fake }
}
