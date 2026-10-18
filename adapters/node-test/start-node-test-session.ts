import { availableParallelism } from 'node:os'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

import type { NodeTestAdapterOptions } from './types/node-test-adapter-options'
import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { AdapterContext } from '../../types/adapter/adapter-context'
import type { NodeTestHandle } from './types/node-test-handle'

import { stopLiveProcessGroups } from './stop-live-process-groups'
import { getNodeCacheInputs } from './get-node-cache-inputs'
import { getDefaultPatterns } from './get-default-patterns'
import { listNodeTestFiles } from './list-node-test-files'
import { checkNodeSupport } from './check-node-support'
import { readNodeRuntime } from './read-node-runtime'
import { findTestCommand } from './find-test-command'
import { readTestTimeout } from './read-test-timeout'
import { checkTypeScript } from './check-typescript'
import { filterExecArgv } from './filter-exec-argv'
import { listSetupFiles } from './list-setup-files'
import { getPreloadPath } from './get-preload-path'
import { placePreload } from './place-preload'
import { listLoaders } from './list-loaders'
import { runIsolated } from './run-isolated'
import { resolveTsx } from './resolve-tsx'
import { runDry } from './run-dry'

/**
 * Flags of legacy loaders, whose hooks run before mootant's module hooks.
 */
const LEGACY_LOADER_FLAGS = new Set(['--experimental-loader', '--loader'])

/**
 * `NODE_TEST_CONTEXT` of the test processes. A value other than node:test's own
 * `child` and `child-v8` keeps reporters as the flags set them, while node:test
 * still runs as in a child of `node --test`: from Node 24 on it honours `only`
 * there just with `--test-only`, and `run()` runs no files.
 */
const TEST_CONTEXT = 'mootant'

/**
 * Starts a node:test session: finds the test command (`findTestCommand`) and
 * the Node binary, checks its version, filters the command's flags
 * (`filterExecArgv`), adds the TypeScript flags better-node-test would add
 * (type stripping on Node 22, where it turns it on from 22.6, else tsx), lists
 * the test files and checks that the processes can load and mootant can switch
 * their TypeScript (`checkTypeScript`; dry runs check the switched files), with
 * the loaders of `NODE_OPTIONS` and of the flags; a legacy `--loader` gets a
 * warning. Every test process runs `node`, mootant's preload placed before the
 * modules the project loads first (`placePreload`), the filtered flags and the
 * extra flags of the options, mootant's reporter and the spec reporter, then
 * one test file, in the project root, with the variables of mootant's process,
 * the command and the options, and mootant's own `NODE_TEST_CONTEXT`. Closing
 * the session stops the test processes that still run.
 *
 * @param context - Switched files, work directory, concurrency and root.
 * @param options - Options of the adapter.
 * @returns Session whose methods run the tests.
 * @throws {Error} When the command does not run node:test, the Node version is
 *   not supported, no test files match, or the TypeScript files cannot be
 *   loaded or switched.
 */
export async function startNodeTestSession(
  context: AdapterContext,
  options: NodeTestAdapterOptions,
): Promise<AdapterSession> {
  let { root } = context
  let node = options.node ?? process.execPath
  let command = await findTestCommand(root, options.command)
  let runtime = await readNodeRuntime(node)
  if (!checkNodeSupport(runtime.version)) {
    throw new Error(
      `mootant runs node:test on Node 20.19 or a later 20.x and on Node 22.12 or later, but ${node} is Node ${runtime.version}.`,
    )
  }
  let { diagnostics, execArgv } = filterExecArgv(command.flags)
  execArgv.push(...(options.execArgv ?? []))
  let strips =
    execArgv.includes('--experimental-strip-types') ||
    execArgv.includes('--experimental-transform-types') ||
    (runtime.typescript && !execArgv.includes('--no-experimental-strip-types'))
  let patterns = options.files ?? command.files
  let files = await listNodeTestFiles(
    root,
    patterns,
    getDefaultPatterns(command.tool, strips),
  )
  if (files.length === 0) {
    let given =
      patterns.length > 0 ?
        patterns.map(pattern => `"${pattern}"`).join(', ')
      : 'the default test file patterns'
    throw new Error(
      `No test files match ${given}; set nodeTestAdapter({ files }) or fix the test script.`,
    )
  }
  if (command.tool === 'bnt' && files.some(file => file.endsWith('.ts'))) {
    let tsx = resolveTsx(root)
    if (Number.parseInt(runtime.version.slice(1)) >= 22) {
      execArgv.unshift(
        '--disable-warning=ExperimentalWarning',
        '--experimental-strip-types',
      )
      strips = true
    } else if (tsx !== null) {
      execArgv.unshift('--enable-source-maps', '--import', tsx)
    }
  }
  let environment: NodeJS.ProcessEnv = {
    ...process.env,
    ...command.env,
    ...options.env,
    NODE_TEST_CONTEXT: TEST_CONTEXT,
  }
  delete environment['MOOTANT_UNIT']
  let flags = [
    ...(environment['NODE_OPTIONS'] ?? '').split(/\s+/u).filter(Boolean),
    ...execArgv,
  ]
  let loaders = listLoaders(flags)
  for (let loader of listLoaders(flags, LEGACY_LOADER_FLAGS)) {
    diagnostics.push({
      message: `The loader ${loader} runs before mootant's module hooks, so mootant cannot switch the modules it changes.`,
      code: 'config-overridden',
      severity: 'warning',
      column: null,
      line: null,
      file: null,
    })
  }
  /**
   * Checks TypeScript files with what the test processes load.
   *
   * @param checked - Absolute paths of the files.
   * @returns A sentence naming the problem, or null.
   */
  function check(checked: readonly string[]): string | null {
    return checkTypeScript({
      version: runtime.version,
      files: checked,
      loaders,
      strips,
      root,
    })
  }
  let problem = check(files)
  if (problem !== null) {
    throw new Error(problem)
  }
  let tsx = loaders.some(loader => /(?:^|[/\\])tsx(?:$|[/@\\])/u.test(loader))
  let setup = listSetupFiles(root, execArgv)
  let inputs = getNodeCacheInputs({
    set: { ...command.env, ...options.env },
    version: runtime.version,
    env: environment,
    execArgv,
    setup,
    root,
    tsx,
  })
  let preload = getPreloadPath()
  let placed = placePreload(
    preload,
    execArgv,
    environment['NODE_OPTIONS'] ?? '',
  )
  if (placed.nodeOptions !== '') {
    environment['NODE_OPTIONS'] = placed.nodeOptions
  }
  let reporter = path.join(
    path.dirname(preload),
    `reporter${path.extname(preload)}`,
  )
  let handle: NodeTestHandle = {
    args: [
      ...placed.args,
      '--test-reporter',
      pathToFileURL(reporter).href,
      '--test-reporter-destination',
      'stderr',
      '--test-reporter',
      'spec',
      '--test-reporter-destination',
      'stdout',
    ],
    state: {
      expected: new Map(),
      modules: new Map(),
      todo: new Map(),
      plan: null,
      count: 0,
    },
    workers: Math.max(1, context.concurrency ?? availableParallelism() - 1),
    testTimeout: readTestTimeout(execArgv),
    checkTypeScript: check,
    env: environment,
    preload,
    context,
    files,
    node,
    tsx,
  }
  return {
    runBatch: () =>
      Promise.reject(new Error('The node-test adapter has no batch mode.')),
    close: () => {
      stopLiveProcessGroups()
      return Promise.resolve()
    },
    listTestFiles: () => Promise.resolve([...files, ...setup]),
    runIsolated: plan => runIsolated(handle, plan),
    cacheInputs: () => Promise.resolve(inputs),
    dryRun: request => runDry(handle, request),
    version: runtime.version.slice(1),
    workers: handle.workers,
    diagnostics,
  }
}
