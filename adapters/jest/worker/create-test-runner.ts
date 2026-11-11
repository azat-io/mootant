import { existsSync } from 'node:fs'

import type { WorkerProject } from '../types/worker-project'
import type { WorkerChannel } from '../types/worker-channel'
import type { WorkerCalls } from '../types/worker-calls'
import type { CircusEvent } from '../types/circus-event'
import type { CircusState } from '../types/circus-state'
import type { JestRecord } from '../types/jest-record'

import { createCircusTracker } from './create-circus-tracker'
import { readErrorFacts } from './read-error-facts'

/**
 * Key of what `expect` keeps on the global object of a vm, with its state.
 */
const MATCHERS_SLOT = Symbol.for('$$jest-matchers-object')

/**
 * `Date.now` of the worker's realm as this module loads, which neither fake
 * timers nor spies in a vm reach.
 */
let { now } = Date

/**
 * `existsSync` as this module loads, which a test's spy does not reach.
 */
let exists = existsSync

/**
 * What the wrapper of the test framework works with.
 */
interface TestRunnerInput {
  /**
   * Jest's own loader of the real test framework.
   */
  requireOrImportModule(file: string): Promise<unknown>

  /**
   * Projects of the session by id.
   */
  projects: ReadonlyMap<string, WorkerProject>

  /**
   * Channel of the worker.
   */
  channel: WorkerChannel

  /**
   * `Error` of the vm of every unit that ended.
   */
  dead: WeakSet<object>

  /**
   * Calls of the worker that tell what they read apart from what tests read.
   */
  calls: WorkerCalls

  /**
   * Called when an error of a unit that ended shows up.
   */
  onStale(): void
}

/**
 * What the stand-in for `save` reads of Jest's state of the snapshots of a test
 * file, the same on Jest 29.7 and 30.
 */
interface SnapshotState {
  /**
   * Writes what changed and tells what it did to the file.
   */
  save(): { deleted: boolean; saved: boolean }

  /**
   * Inline snapshots to write into the test file.
   */
  _inlineSnapshots: unknown[]

  /**
   * Entries of the snapshot file, which tests may have added to.
   */
  _snapshotData: object

  /**
   * Path of the snapshot file.
   */
  _snapshotPath: string

  /**
   * Whether something is to be written.
   */
  _dirty: boolean
}

/**
 * What mootant reads of a test environment.
 */
interface TestEnvironment {
  /**
   * Handler of circus's events. Circus binds it inside `initialize`, after this
   * wrapper assigned it on the instance.
   */
  handleTestEvent?(event: CircusEvent, state: CircusState): unknown

  /**
   * Global object of the vm.
   */
  global: object
}

/**
 * Arguments Jest calls a test framework with; the rest goes through unread.
 */
type TestRunnerParameters = [
  globalConfig: unknown,
  config: { id: string },
  environment: TestEnvironment,
  ...others: unknown[],
]

/**
 * Creates the `testRunner` function of the project copies. It reads the token,
 * the unit and the vm's side once, so a leftover of this unit writes under this
 * unit's token and no later one; the vm's side is always set here, since
 * `setupFiles` ran before Jest calls a test framework. The real test framework
 * runs out of the store of the test environment's calls
 * (`WorkerCalls.environment`), which the last setup file may have entered for
 * `environment.setup()` and the load of the real test framework, and what
 * follows it, `environment.teardown()` among it, is back in it.
 *
 * @param input - What the wrapper works with.
 * @returns The function Jest calls as `(globalConfig, config, environment,
 *   runtime, testPath, send)`, which runs the real test framework with the
 *   tracker of the unit and returns its result.
 */
export function createTestRunner(
  input: TestRunnerInput,
): (...parameters: TestRunnerParameters) => Promise<unknown> {
  let { requireOrImportModule, projects, channel, onStale, calls, dead } = input
  return async (...parameters) => {
    let [, config, environment] = parameters
    let real = (await requireOrImportModule(
      projects.get(config.id)!.config.testRunner,
    )) as (...runnerParameters: TestRunnerParameters) => unknown
    let { token } = channel
    let unit = channel.unit!
    let side = channel.vm!
    let realms = { current: side.realmError, dead }

    /**
     * Writes a record of this unit.
     *
     * @param record - Record to write.
     */
    function write(record: JestRecord): void {
      channel.write(token, record)
    }

    let tracker = createCircusTracker({
      freezeSnapshots: () => {
        freezeSnapshots(environment.global)
      },
      dry: unit.mutant === null,
      onStale,
      realms,
      write,
      side,
      now,
    })
    let previous = environment.handleTestEvent

    /**
     * Runs the tracker, which must not fail the user's file.
     *
     * @param event - Event of circus.
     * @param state - State of circus.
     */
    function track(event: CircusEvent, state: CircusState): void {
      try {
        tracker(event, state)
      } catch (error) {
        write({
          message: readErrorFacts(error, realms).message,
          kind: 'tracker-error',
          event: event.name,
        })
      }
    }

    /**
     * Runs the tracker, then the handler the environment had, which may fail
     * the user's file, as in plain Jest. On `run_finish` the tracker runs once
     * that handler settled, thrown or not: circus reads what the tests hold
     * right after that event, and the handler may give a test an error then.
     *
     * @param event - Event of circus.
     * @param state - State of circus.
     * @returns What the environment's handler returns, which circus awaits.
     */
    function handleTestEvent(
      this: unknown,
      event: CircusEvent,
      state: CircusState,
    ): unknown {
      if (event.name === 'run_finish') {
        return trackAfter(
          () => callEnvironment(this, event, state),
          event,
          state,
        )
      }
      track(event, state)
      return callEnvironment(this, event, state)
    }

    /**
     * Calls the handler the environment had, if any, inside the store of its
     * calls, so a read in it or in what it goes on with is the session's, as an
     * environment may keep what it read across units. Without a handler the
     * store stays off, which on Node 22 would slow every promise of the unit.
     *
     * @param self - What circus calls the handler on.
     * @param event - Event of circus.
     * @param state - State of circus.
     * @returns What the handler returns.
     */
    function callEnvironment(
      self: unknown,
      event: CircusEvent,
      state: CircusState,
    ): unknown {
      if (previous === undefined) {
        return undefined
      }
      return calls.environment.run(true, () =>
        previous.call(self, event, state),
      )
    }

    /**
     * Runs the tracker once a call settled, thrown or not.
     *
     * @param call - Call of the environment's handler.
     * @param event - Event of circus.
     * @param state - State of circus.
     * @returns What the call returned, awaited.
     */
    async function trackAfter(
      call: () => unknown,
      event: CircusEvent,
      state: CircusState,
    ): Promise<unknown> {
      try {
        return await call()
      } finally {
        track(event, state)
      }
    }

    environment.handleTestEvent = handleTestEvent
    return await calls.environment.exit(() => real(...parameters))
  }
}

/**
 * Keeps Jest from writing the snapshot file of a test file. `updateSnapshot:
 * 'none'` holds back new values only: with an unchecked entry `save` still
 * rewrites the file, with its entries in Jest's order and the header of this
 * major, in the user's tree. The stand-in writes nothing and says what `save`
 * says of a snapshot file with no entry, which Jest calls obsolete and which
 * fails a plain run with every test passing: deleted, though only `-u` removes
 * it.
 *
 * @param global - Global object of the vm, whose `expect` holds the state of
 *   the snapshots by the time the tests run.
 */
function freezeSnapshots(global: object): void {
  let { state } = Reflect.get(global, MATCHERS_SLOT) as {
    state: { snapshotState: SnapshotState }
  }
  let { snapshotState } = state
  snapshotState.save = () => ({
    deleted:
      Object.keys(snapshotState._snapshotData).length === 0 &&
      (!snapshotState._dirty || snapshotState._inlineSnapshots.length === 0) &&
      exists(snapshotState._snapshotPath),
    saved: false,
  })
}
