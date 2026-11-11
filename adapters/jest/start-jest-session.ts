import { realpath } from 'node:fs/promises'

import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { AdapterContext } from '../../types/adapter/adapter-context'
import type { JestAdapterOptions } from './types/jest-adapter-options'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { JestHandle } from './types/jest-handle'
import type { JestConfig } from './types/jest-config'

import { getJestCacheDirectory } from './get-jest-cache-directory'
import { getJestBaseArguments } from './get-jest-base-arguments'
import { filterJestArguments } from './filter-jest-arguments'
import { resolveJestPackages } from './resolve-jest-packages'
import { getJestCacheInputs } from './get-jest-cache-inputs'
import { keepTransformReads } from './keep-transform-reads'
import { writeWorkerSession } from './write-worker-session'
import { listJestTestFiles } from './list-jest-test-files'
import { checkJestSupport } from './check-jest-support'
import { createWorkerPool } from './create-worker-pool'
import { writeWorkerFiles } from './write-worker-files'
import { listJestProjects } from './list-jest-projects'
import { findJestCommand } from './find-jest-command'
import { getJestConsole } from './get-jest-console'
import { readJestConfig } from './read-jest-config'
import { readHostConfig } from './read-host-config'
import { startJestHost } from './start-jest-host'
import { createHeapCap } from './create-heap-cap'
import { readTeardown } from './read-teardown'
import { TS_JEST_PATH } from './ts-jest-path'
import { runIsolated } from './run-isolated'
import { startWorker } from './start-worker'
import { runDry } from './run-dry'

/**
 * Starts a Jest session: finds the test command and the project's Jest, which
 * must be 29.7 or later before any flag reaches it, filters the flags, reads
 * the resolved configuration, checks it, picks the projects, and starts the
 * host, the project's Jest parked in mootant's runner with global setup done.
 * Variables of mootant's process, the command and the options reach Jest,
 * without those named `MOOTANT_*`. The context's concurrency reaches Jest as
 * `--maxWorkers`, so that a global setup sees it too. `detectOpenHandles` runs
 * a plain Jest serially, and such projects are the ones with shared resources,
 * so with no concurrency it reads as `-i`, while a concurrency, the user's own
 * call, wins with a warning, as it does over `-i`. Dry runs and isolated units
 * go to workers forked with the host's environment, as many at once as Jest's
 * `maxWorkers`, and their tests print to the console plain Jest gives the
 * project in a run of the whole suite, which the number of test files Jest
 * found has a say in. A kept project gets a warning when ts-jest or
 * jest-preset-angular, whose type check mootant turns off, is the first
 * transformer whose pattern matches one of its test files, as Jest picks it. A
 * host that exits before `close` stops the workers and rejects the running run
 * and every later one, since what its global setup started died with it and
 * every later failure would read as a kill. Closing the session stops the
 * workers, then ends the host, which runs global teardown. What every verdict
 * depends on beyond what a test file read is gathered when the core asks for
 * it, after its dry runs, as it holds what the transformers, the test
 * environments, the test runners and the projects' own resolvers read in them,
 * joined with what they read in earlier sessions (`keepTransformReads`,
 * `getJestCacheInputs`). Once the host is ready the session works with the
 * configuration it ran global setup with (`readHostConfig`), the workers and
 * the cache key alike.
 *
 * @param context - Work directory, concurrency, root and output.
 * @param options - Options of the adapter.
 * @returns Session that knows the version, workers, test files and cache
 *   inputs, and runs dry runs and isolated units.
 * @throws {Error} When Jest is missing, older than 29.7 or fails to start, or
 *   when its settings or the command are not supported.
 */
export async function startJestSession(
  context: AdapterContext,
  options: JestAdapterOptions,
): Promise<AdapterSession> {
  let { concurrency, root } = context
  let started = Date.now()
  let command = await findJestCommand(root, options.command)
  let packages = await resolveJestPackages(root)
  let env = Object.fromEntries(
    Object.entries({
      ...process.env,
      ...command.env,
      ...options.env,
    }).filter(([name]) => !name.startsWith('MOOTANT_')),
  )

  /**
   * Reads what Jest resolves with a number of workers.
   *
   * @param workers - Most test files at once, or null to keep Jest's own.
   * @returns The filtered arguments, how to run Jest with them, and what it
   *   resolves.
   */
  async function resolve(workers: number | null): Promise<{
    filtered: ReturnType<typeof filterJestArguments>
    run: Parameters<typeof readJestConfig>[0]
    config: JestConfig
  }> {
    let filtered = filterJestArguments(command.args, workers)
    let run = {
      onOutput(text: string): void {
        context.onOutput?.(text, null)
      },
      base: getJestBaseArguments(root, filtered.args, workers),
      nodeFlags: command.nodeFlags,
      args: filtered.args,
      bin: packages.bin,
      root,
      env,
    }
    return { config: await readJestConfig(run), filtered, run }
  }

  let resolved = await resolve(concurrency)
  if (concurrency === null && resolved.config.globalConfig.detectOpenHandles) {
    resolved = await resolve(1)
  }
  let { filtered, config, run } = resolved
  checkJestSupport({ config, env })
  let realRoot = await realpath(root)
  let listed = listJestProjects({ root: realRoot, config })
  let files = await writeWorkerFiles(context.workDirectory)
  let host = await startJestHost({ ...run, projects: listed.projects, files })
  let { globalConfig, projects } = readHostConfig({
    globalConfig: config.globalConfig,
    projects: listed.projects,
    ready: host.ready,
  })
  let typeChecked = host.ready.tests.some(test => {
    let { transform } = projects.find(
      project => project.config.id === test.project,
    )!.config
    let entry = transform.find(([pattern]) => {
      let matcher = new RegExp(pattern)
      return matcher.test(test.path)
    })
    return entry !== undefined && TS_JEST_PATH.test(entry[1])
  })
  let serial =
    filtered.serial ??
    (globalConfig.detectOpenHandles ? 'detectOpenHandles' : null)
  let shared = { ready: host.ready, globalConfig, projects }
  let sessionFile: string
  try {
    sessionFile = await writeWorkerSession({
      ...shared,
      directory: files.directory,
      root: realRoot,
      packages,
    })
  } catch (error) {
    await host.close()
    throw error
  }
  let heap = createHeapCap({
    nodeFlags: command.nodeFlags,
    env: host.ready.env,
  })
  let pool = createWorkerPool({
    start: (slot, uncapped) =>
      startWorker({
        onOutput: (text, file) => {
          context.onOutput?.(text, file)
        },
        heapCap: uncapped ? null : heap.current,
        nodeFlags: command.nodeFlags,
        session: sessionFile,
        env: host.ready.env,
        cwd: host.ready.cwd,
        file: files.worker,
        slot,
      }),
    size: globalConfig.maxWorkers,
  })
  let handle: JestHandle = {
    state: {
      lateTransforms: new Set(),
      transforms: new Set(),
      outside: new Set(),
      noFacts: new Set(),
      reads: new Map(),
      timeouts: null,
      plan: null,
      plans: 0,
      units: 0,
    },
    consoles: new Map(
      projects.map(project => [
        project.name,
        getJestConsole({
          config: project.config,
          tests: host.testCount,
          globalConfig,
        }),
      ]),
    ),
    freshWorkers: options.freshWorkers ?? false,
    directory: files.directory,
    tests: host.ready.tests,
    root: realRoot,
    projects,
    context,
    heap,
    pool,
  }
  let died = (async (): Promise<never> => {
    let error = await host.died
    void pool.close()
    throw error
  })()
  // Nothing may be listening when the host dies between two runs.
  void died.catch(() => {})

  /**
   * Settles with a run, or rejects when the host dies first. A race leaves a
   * reaction on `died`, which stays pending for the life of the session, and
   * the reaction holds what the race settled with, so that must not be the
   * result of the run.
   *
   * @param running - The running run.
   * @returns What the run gives.
   * @throws {Error} When the run fails or the host dies first.
   */
  async function raceDeath<Result>(running: Promise<Result>): Promise<Result> {
    await Promise.race([
      died,
      (async () => {
        await running
      })(),
    ])
    return running
  }

  let closing: Promise<Diagnostic[]> | null = null
  return {
    diagnostics: [
      ...command.diagnostics,
      ...filtered.diagnostics,
      ...(serial !== null && concurrency !== null && concurrency > 1 ?
        [
          {
            message: `--concurrency overrides ${serial}, which keeps test files from running at once; tests that rely on it can fail or read as kills.`,
            code: 'config-overridden' as const,
            severity: 'warning' as const,
            column: null,
            line: null,
            file: null,
          },
        ]
      : []),
      ...listed.diagnostics,
      ...(typeChecked ?
        [
          {
            message:
              "ts-jest's type check is off under mootant, so a test file's own type error passes, and a type error alone does not kill a mutant.",
            code: 'config-overridden' as const,
            severity: 'warning' as const,
            column: null,
            line: null,
            file: null,
          },
        ]
      : []),
    ],
    cacheInputs: () =>
      Promise.resolve(
        getJestCacheInputs({
          ...shared,
          transforms: keepTransformReads({
            directory: getJestCacheDirectory(root),
            reads: handle.state.transforms,
            root: realRoot,
            started,
          }),
          directory: files.directory,
          consoles: handle.consoles,
          args: filtered.args,
          root: realRoot,
          packages,
          command,
          options,
        }),
      ),
    close: () => {
      closing ??= (async () => {
        await pool.close()
        return readTeardown(await host.close(), realRoot)
      })()
      return closing
    },
    runBatch: () =>
      Promise.reject(new Error('The jest adapter has no batch mode.')),
    runIsolated: plan => raceDeath(runIsolated(handle, plan)),
    dryRun: request => raceDeath(runDry(handle, request)),
    listTestFiles: () => listJestTestFiles(shared),
    workers: globalConfig.maxWorkers,
    version: packages.version,
  }
}
