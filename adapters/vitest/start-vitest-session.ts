import type {
  createVitest as CreateVitest,
  ForksPoolWorker,
  Vitest,
} from 'vitest/node'

import { pathToFileURL } from 'node:url'
import path from 'node:path'

import type {
  VitestSessionState,
  VitestHandle,
} from './types/vitest-session-state'
import type { VitestAdapterOptions } from './types/vitest-adapter-options'
import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { AdapterContext } from '../../types/adapter/adapter-context'

import { installMutantRuntime } from '../../core/runtime/install-mutant-runtime'
import { createInterleavedSequencer } from './create-interleaved-sequencer'
import { createOutputReporter } from './create-output-reporter'
import { createMootantPlugin } from './create-mootant-plugin'
import { createOutputStream } from './create-output-stream'
import { createForksPool } from './create-forks-pool'
import { checkVitestCopy } from './check-vitest-copy'
import { getCacheInputs } from './get-cache-inputs'
import { getRunnerPath } from './get-runner-path'
import { detectVitest } from './detect-vitest'
import { runIsolated } from './run-isolated'
import { runBatch } from './run-batch'
import { runDry } from './run-dry'

/**
 * Starts one Vitest instance for a mootant run: the project's own Vitest,
 * resolved from the root, with the user's configuration, mootant's plugin and
 * worker runner, no coverage, result cache or module cache on disk, and no
 * reporters: what the tests print, their console calls with their test file and
 * what Vitest and its workers write, such as process warnings, goes to the
 * context's `onOutput` when there is one. Its sequencer spreads out the units
 * of one test file (`createInterleavedSequencer`). The mutant runtime of this
 * process records the mutant sites switched code evaluates here, outside the
 * workers, such as in a `globalSetup` file, until the session closes.
 *
 * @param context - Switched files, work directory, concurrency and root.
 * @param options - Options of the adapter.
 * @returns Session whose methods run the tests.
 * @throws {Error} When Vitest is missing or not version 5, when mootant would
 *   load another copy of Vitest, when a project uses an unsupported setting, or
 *   when no test file matches the include patterns, which Vitest itself would
 *   pass, since mootant runs it with `passWithNoTests` for the units it
 *   filters.
 */
export async function startVitestSession(
  context: AdapterContext,
  options: VitestAdapterOptions,
): Promise<AdapterSession> {
  let { root } = context
  let detection = await detectVitest(root)
  if (!detection.available) {
    throw new Error(
      detection.version === null ?
        `Vitest is not installed in ${root}.`
      : `mootant runs Vitest 5, but ${root} has Vitest ${detection.version}.`,
    )
  }
  let runnerPath = getRunnerPath()
  let copy = checkVitestCopy(root, runnerPath)
  if (copy !== null) {
    throw new Error(copy)
  }
  let vitestNode = (await import(pathToFileURL(detection.node!).href)) as {
    ForksPoolWorker: typeof ForksPoolWorker
    createVitest: typeof CreateVitest
  }
  let spawns = new Map<number, number>()
  let state: VitestSessionState = {
    pool: createForksPool(vitestNode.ForksPoolWorker, spawns),
    mismatched: new Set(),
    instrumented: true,
    outside: new Set(),
    served: new Set(),
    environment: {},
    keys: new Map(),
    diagnostics: [],
    error: null,
    files: null,
    runnerPath,
    spawns,
  }
  let { onOutput } = context
  let instance: Vitest | null = null
  let vitest = await vitestNode.createVitest(
    {
      ...(options.config !== undefined && {
        config: path.resolve(root, options.config),
      }),
      ...(context.concurrency !== null && { maxWorkers: context.concurrency }),
      reporters:
        onOutput === undefined ?
          []
        : [createOutputReporter(onOutput, () => instance)],
      coverage: { enabled: false },
      includeTaskLocation: true,
      passWithNoTests: true,
      fsModuleCache: false,
      watch: false,
      cache: false,
      bail: 0,
      root,
    },
    { plugins: [createMootantPlugin(context, state)] },
    onOutput === undefined ?
      {}
    : {
        stderr: createOutputStream(text => onOutput(text, null)),
        stdout: createOutputStream(text => onOutput(text, null)),
      },
  )
  instance = vitest
  if (state.error !== null) {
    await vitest.close()
    throw new Error(state.error)
  }
  if ((await vitest.globTestSpecifications()).length === 0) {
    await vitest.close()
    let patterns = new Set(
      vitest.projects.flatMap(project => project.config.include),
    )
    throw new Error(
      `No test files match the include patterns of Vitest (${[...patterns].map(pattern => `"${pattern}"`).join(', ')}); set vitestAdapter({ config }) or fix the patterns.`,
    )
  }
  let { sequence } = vitest.config
  sequence.sequencer = createInterleavedSequencer(sequence.sequencer)
  let runtime = installMutantRuntime()
  let { coverage } = runtime
  runtime.coverage = state.outside
  let handle: VitestHandle = {
    context,
    vitest,
    state,
  }
  let closed: Promise<void> | null = null
  /**
   * Closes Vitest, then gives the runtime of this process back its earlier
   * coverage set, unless something else replaced it meanwhile.
   *
   * @returns Resolves when Vitest closed.
   */
  async function closeVitest(): Promise<void> {
    try {
      await vitest.close()
    } finally {
      if (runtime.coverage === state.outside) {
        runtime.coverage = coverage
      }
    }
  }
  return {
    listTestFiles: async () => {
      let files = new Set(
        (await vitest.globTestSpecifications()).map(({ moduleId }) => moduleId),
      )
      for (let project of vitest.projects) {
        for (let file of [
          ...project.config.setupFiles,
          ...project.config.globalSetup,
        ]) {
          files.add(file)
        }
      }
      return [...files]
    },
    cacheInputs: () =>
      Promise.resolve(getCacheInputs(vitest, state.environment)),
    close: () => {
      closed ??= closeVitest()
      return closed
    },
    runIsolated: plan => runIsolated(handle, plan),
    dryRun: request => runDry(handle, request),
    runBatch: plan => runBatch(handle, plan),
    workers: vitest.config.maxWorkers,
    diagnostics: state.diagnostics,
    version: vitest.version,
  }
}
