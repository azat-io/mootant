import {
  writeFile,
  readFile,
  realpath,
  symlink,
  mkdtemp,
  cp,
  rm,
} from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { Mutant } from '../../types/mutant/mutant'

import { applyMutant } from './apply-mutant'

/**
 * Verdicts of the reference run.
 */
interface ReferenceVerdicts {
  /**
   * Whether some test or hook failed with the mutant, by mutant id.
   */
  killed: Map<string, boolean>

  /**
   * Whether related tests ran in the copy without a mutant and all passed.
   */
  original: boolean
}

/**
 * Part of a test file in the report of Vitest's `json` reporter.
 */
interface ReportedFile {
  /**
   * `failed` when a test, a hook or loading the file failed.
   */
  status: string

  /**
   * Absolute path of the test file.
   */
  name: string
}

/**
 * Script that runs every test of one project copy in a fresh Vitest instance
 * and prints whether anything failed: a test module, or an unhandled error of
 * the whole run, those Vitest catches after the run included, such as an error
 * of a worker-scoped fixture's cleanup. Arguments: the URL of `vitest/node` and
 * the root of the copy.
 */
const PLAIN_RUN_SCRIPT = `
let { createVitest } = await import(process.argv[1])
let vitest = await createVitest('test', {
  root: process.argv[2],
  passWithNoTests: true,
  maxWorkers: 1,
  reporters: [],
  watch: false,
})
let result = await vitest.start()
await vitest.close()
let failed =
  result.testModules.some(module => !module.ok()) ||
  vitest.state.getUnhandledErrors().length > 0
process.stdout.write(JSON.stringify({ ran: result.testModules.length, failed }))
process.exit(0)
`

/**
 * Vitest configuration of the shared run of the copies, without plugins.
 */
const DEFAULT_CONFIG =
  "export default { test: { include: ['*/test/**/*.test.ts'] } }\n"

/**
 * Packages of the repository, which the copies resolve their imports from.
 */
let modules = path.resolve(import.meta.dirname, '../../node_modules')

/**
 * Fields of a mutant that the reference run needs.
 */
type ReferenceMutant = Pick<
  Mutant,
  'replacement' | 'start' | 'file' | 'kind' | 'end' | 'id'
>

/**
 * Decides mutants the plain way, as a reference for the runner: every mutant is
 * written by hand into its own copy of the project, hosted as the mutant switch
 * hosts it, next to one copy left untouched. One Vitest run, with Vitest's own
 * settings, runs the test files related to the changed file of each copy, each
 * test file in a fresh module graph as Vitest does by default. A mutant is
 * killed when some related test file of its copy failed: a test, a hook or
 * loading.
 *
 * @param root - Root of the project, whose paths the mutant files are relative
 *   to.
 * @param mutants - Mutants to decide.
 * @param options - Files of the untouched copy and how to run the copies.
 * @param options.sources - Files of the project, relative to the root, that the
 *   untouched copy relates its tests to.
 * @param options.config - Text of the Vitest configuration of the shared run,
 *   such as one with the plugin of a component framework; it must include
 *   `*\/test/**\/*.test.ts`. The copies resolve packages from the repository.
 * @param options.separate - Whether every copy runs every test in its own
 *   Vitest instance, and fails on any error of the run, including errors Vitest
 *   catches only after the run, such as in the cleanup of a worker-scoped
 *   fixture; one shared run cannot tell which copy such an error came from. The
 *   copies run one after another, as they may share a fixed port.
 * @returns Whether each mutant was killed and whether the untouched copy
 *   passed.
 */
export async function runReferenceMutants(
  root: string,
  mutants: ReferenceMutant[],
  options: { separate?: boolean; sources: string[]; config?: string },
): Promise<ReferenceVerdicts> {
  let { sources } = options
  let directory = await realpath(
    await mkdtemp(path.join(tmpdir(), 'mootant-reference-')),
  )
  try {
    let related = [
      ...sources.map(file => path.join('original', file)),
      ...mutants.map((mutant, index) => path.join(`m${index}`, mutant.file)),
    ]
    await symlink(modules, path.join(directory, 'node_modules'), 'dir')
    await cp(root, path.join(directory, 'original'), { recursive: true })
    await Promise.all(
      mutants.map(async (mutant, index) => {
        let copy = path.join(directory, `m${index}`)
        await cp(root, copy, { recursive: true })
        let file = path.join(copy, mutant.file)
        let source = await readFile(file, 'utf8')
        await writeFile(file, applyMutant(source, mutant))
      }),
    )
    if (options.separate === true) {
      let original = await runPlainVitest(path.join(directory, 'original'))
      let killed = new Map<string, boolean>()
      await mutants.reduce(async (previous, mutant, index) => {
        await previous
        let copy = await runPlainVitest(path.join(directory, `m${index}`))
        killed.set(mutant.id, copy.failed)
      }, Promise.resolve())
      return { original: original.ran > 0 && !original.failed, killed }
    }
    await writeFile(
      path.join(directory, 'vitest.config.mjs'),
      options.config ?? DEFAULT_CONFIG,
    )
    let report = path.join(directory, 'report.json')
    await runVitest(directory, [
      'related',
      ...related,
      '--run',
      '--config=vitest.config.mjs',
      '--reporter=json',
      `--outputFile=${report}`,
      '--maxWorkers=2',
      '--passWithNoTests',
    ])
    let { testResults } = JSON.parse(await readFile(report, 'utf8')) as {
      testResults: ReportedFile[]
    }
    let ran = new Set(testResults.map(file => getCopy(directory, file)))
    let failed = new Set(
      testResults
        .filter(file => file.status !== 'passed')
        .map(file => getCopy(directory, file)),
    )
    return {
      killed: new Map(
        mutants.map((mutant, index) => [mutant.id, failed.has(`m${index}`)]),
      ),
      original: ran.has('original') && !failed.has('original'),
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * Runs every test of one project copy in its own Vitest instance.
 *
 * @param root - Root of the copy.
 * @returns Test modules that ran and whether anything failed.
 */
function runPlainVitest(
  root: string,
): Promise<{ failed: boolean; ran: number }> {
  let vitest = createRequire(import.meta.url).resolve('vitest/package.json')
  let entry = pathToFileURL(path.join(path.dirname(vitest), 'dist/node.js'))
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ['--input-type=module', '-e', PLAIN_RUN_SCRIPT, entry.href, root],
      { env: getCleanEnvironment(), cwd: root },
      (error, stdout) => {
        if (error === null) {
          resolve(JSON.parse(stdout) as { failed: boolean; ran: number })
        } else {
          reject(new Error(`Vitest failed in ${root}.`, { cause: error }))
        }
      },
    )
  })
}

/**
 * Runs the Vitest command line of the project in a directory; failing tests are
 * expected, so the exit code is ignored.
 *
 * @param cwd - Directory to run in.
 * @param flags - Command and options of Vitest.
 * @returns Resolves when Vitest exited.
 */
function runVitest(cwd: string, flags: string[]): Promise<void> {
  let vitest = createRequire(import.meta.url).resolve('vitest/package.json')
  let bin = path.join(path.dirname(vitest), 'vitest.mjs')
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [bin, ...flags],
      { env: getCleanEnvironment(), cwd },
      () => {
        resolve()
      },
    )
  })
}

/**
 * Environment of this process without the variables Vitest sets for its own
 * workers, so the reference Vitest starts like one run from a terminal.
 *
 * @returns Environment variables for the reference run.
 */
function getCleanEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith('VITEST') && name !== 'TEST',
    ),
  )
}

/**
 * Finds the copy of the project a reported test file belongs to.
 *
 * @param directory - Directory that holds the copies.
 * @param file - Test file of the report.
 * @returns Name of the copy, such as `original` or `m3`.
 */
function getCopy(directory: string, file: ReportedFile): string {
  return path.relative(directory, file.name).split(path.sep)[0]!
}
