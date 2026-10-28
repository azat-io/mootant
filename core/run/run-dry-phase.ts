import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { DryRunRequest } from '../../types/adapter/dry-run-request'
import type { DryRunResult } from '../../types/adapter/dry-run-result'
import type { SwitchedFile } from '../../types/adapter/switched-file'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { DryFile } from '../../types/adapter/dry-file'
import type { DryTest } from '../../types/adapter/dry-test'
import type { RunEvent } from '../../types/run/run-event'

import { compareDryEntries } from './compare-dry-entries'
import { compareCodeUnits } from '../compare-code-units'
import { getTestFileKey } from './get-test-file-key'
import { getDisplayPath } from './get-display-path'
import { pluralize } from '../text/pluralize'

/**
 * What the dry phase needs to know about the run.
 */
interface DryPhaseInput {
  /**
   * Absolute path of the source file of every pending mutant, by id.
   */
  mutantFiles: Map<string, string>

  /**
   * Receives `dry-start` as the dry phase starts and a `note` as each later dry
   * run starts.
   */
  report(event: RunEvent): void

  /**
   * Display paths of the mutated files, by absolute path.
   */
  displays: Map<string, string>

  /**
   * Switched files given to the adapter; files that break tests are removed in
   * place before the dry run is repeated.
   */
  switched: SwitchedFile[]

  /**
   * Whether every test is tried twice in a row, as fast mode needs to tell
   * stable mutants and repeatable tests; otherwise each test runs once.
   */
  repeat: boolean

  /**
   * Directory display paths are relative to.
   */
  root: string
}

/**
 * Outcome of the dry phase.
 */
interface DryPhase {
  /**
   * Keys (`getTestFileKey`) of the test files that failed when their tests ran
   * twice in a row and passed when each ran once; `dry` holds the results of
   * the run with each test once.
   */
  unrepeatableFiles: Set<string>

  /**
   * Messages of the files whose mutants get no verdict, by display path.
   */
  errors: Map<string, string>

  /**
   * `instrumentation-break`, `instrument-error` and `never-served` diagnostics.
   */
  diagnostics: Diagnostic[]

  /**
   * The dry run the batch and isolated phases plan from.
   */
  dry: DryRunResult

  /**
   * Runs of the test runner.
   */
  runs: number
}

/**
 * What failed in a dry run.
 */
interface DryFailures {
  /**
   * Test files that failed to load.
   */
  unloaded: DryFile[]

  /**
   * Tests whose first try failed.
   */
  failing: DryTest[]
}

/**
 * Most failures a fatal error lists.
 */
const LISTED_FAILURES = 10

/**
 * Watchdog budgets of a dry run in milliseconds, on top of the test runner's
 * own timeouts, which do not stop a synchronous loop: an attempt of a test may
 * take a minute plus its own timeout and the timeouts of the hooks around it;
 * loading a test file may take a minute, and its work between two tests a
 * minute plus the timeouts of all its suite hooks. A timeout the project turned
 * off makes the budget unlimited.
 */
const DRY_TIMEOUTS = { file: 60_000, test: 60_000 }

/**
 * Runs the tests related to the switched files without a mutant, each once, or
 * in fast mode (`repeat`) twice in a row. In fast mode, when tests fail or
 * files fail to load, their test files run again with each test once, as a
 * plain run of the test runner does: a try can leave state, such as a counter
 * or collected results, that fails the next test or a suite hook only because
 * the tests were repeated. Test files that pass then keep the results of that
 * run and are unrepeatable: every mutant their tests reach runs isolated.
 * Failures that remain run again without the switched files: failures that
 * remain are real and stop the run; the others come from the instrumentation,
 * so the switched files they reached are dropped with an
 * `instrumentation-break` error and the dry run is repeated once. Files whose
 * loaded text differed get an `instrument-error`, files never served a
 * `never-served` warning. Without related tests the dry run is empty, so every
 * mutant ends without coverage. A dry run whose worker hung past its budget
 * (`DRY_TIMEOUTS`) stops the run with the test it hung in.
 *
 * @param session - Live test runner.
 * @param input - Switched files, mutant files, display paths and progress.
 * @returns Final dry run, failed files, unrepeatable test files, diagnostics
 *   and the number of runs.
 * @throws Error - When tests fail without the switched files, when tests still
 *   fail after dropping the files that broke them, or when a test or test file
 *   hangs.
 */
export async function runDryPhase(
  session: AdapterSession,
  input: DryPhaseInput,
): Promise<DryPhase> {
  let errors = new Map<string, string>()
  let diagnostics: Diagnostic[] = []
  if (input.switched.length === 0) {
    return {
      unrepeatableFiles: new Set(),
      dry: createEmptyDry(),
      diagnostics,
      runs: 0,
      errors,
    }
  }
  let related = input.switched.map(entry => entry.file)
  input.report({ files: related.length, kind: 'dry-start' })
  let checked = await runCheckedDry(session, related, input)
  let instrumented = [checked.dry]
  let failures = findFailures(checked.dry)
  if (failures.failing.length > 0 || failures.unloaded.length > 0) {
    let recovered = await recoverFromFailures(session, input, {
      diagnostics,
      failures,
      related,
      errors,
    })
    instrumented.push(recovered.dry)
    checked = { ...recovered, runs: checked.runs + recovered.runs }
  }
  diagnoseServedFiles(input, { instrumented, diagnostics, errors })
  return { ...checked, diagnostics, errors }
}

/**
 * Runs the dry run of the given switched files, each test once, or twice in a
 * row with `repeat`; then, after a repeated run, runs the test files of failed
 * tests and failed files once more with each test once. Test files that pass
 * then take the results of that run, since a plain run of the test runner
 * passes them too; the others keep their failures from it.
 *
 * @param session - Live test runner.
 * @param related - Absolute paths of the switched files.
 * @param input - Repeats, progress and the directory display paths are relative
 *   to.
 * @returns The dry run, the keys of the test files that failed only when
 *   repeated, and the number of runs.
 * @throws Error - When a test or test file hangs.
 */
async function runCheckedDry(
  session: AdapterSession,
  related: string[],
  input: DryPhaseInput,
): Promise<Pick<DryPhase, 'unrepeatableFiles' | 'runs' | 'dry'>> {
  let dry = await runDry(
    session,
    { repeat: input.repeat, instrumented: true, files: null, related },
    input.root,
  )
  let { unloaded, failing } = findFailures(dry)
  if (!input.repeat || (failing.length === 0 && unloaded.length === 0)) {
    return { unrepeatableFiles: new Set(), runs: 1, dry }
  }
  let files = listTestFiles([...failing, ...unloaded])
  input.report({
    message: `${pluralize(files.length, 'test file')} failed with each test run twice; running them again with each test once.`,
    kind: 'dry-again',
  })
  let once = await runDry(
    session,
    { instrumented: true, repeat: false, related, files },
    input.root,
  )
  let rerun = new Set(files.map(file => getTestFileKey(file)))
  let { unloaded: unloadedOnce, failing: failingOnce } = findFailures(once)
  let stillFailing = new Set(
    [...failingOnce, ...unloadedOnce].map(entry => getTestFileKey(entry)),
  )
  /**
   * Tells whether a test or test file ran again with each test once.
   *
   * @param entry - Test or test file with its path and project.
   * @returns True when its test file ran again.
   */
  function isRerun(entry: { project: string; file: string }): boolean {
    return rerun.has(getTestFileKey(entry))
  }
  return {
    dry: {
      tests: [
        ...dry.tests.filter(test => !isRerun(test)),
        ...once.tests,
      ].toSorted(compareDryEntries),
      files: [
        ...dry.files.filter(file => !isRerun(file)),
        ...once.files,
      ].toSorted(compareDryEntries),
      mismatched: mergeSorted(dry.mismatched, once.mismatched),
      outside: mergeSorted(dry.outside, once.outside),
      served: mergeSorted(dry.served, once.served),
      ...((dry.unserved ?? once.unserved) !== undefined && {
        unserved: [...(dry.unserved ?? []), ...(once.unserved ?? [])],
      }),
      hung: [],
    },
    unrepeatableFiles: new Set(
      [...rerun].filter(key => !stillFailing.has(key)),
    ),
    runs: 2,
  }
}

/**
 * Recovers from failures of the instrumented dry run. The failures run again
 * without the switched files first (`checkRealFailures`), and those that remain
 * stop the run; the switched files the others reached get an
 * `instrumentation-break` error and are removed from `input.switched` in place,
 * before the dry run is repeated once for the switched files left.
 *
 * @param session - Live test runner.
 * @param input - Switched files, mutant files, display paths and progress.
 * @param context - Failures of the dry run and what the dry phase collects.
 * @param context.errors - Messages of the files whose mutants get no verdict,
 *   by display path, added to.
 * @param context.diagnostics - Diagnostics of the dry phase, added to.
 * @param context.failures - Failing tests and unloaded files of the dry run.
 * @param context.related - Absolute paths of the switched files it ran with.
 * @returns The repeated dry run, or an empty one when no switched file is left,
 *   the keys of its unrepeatable test files, and the number of runs, the one
 *   without the switched files included.
 * @throws Error - When tests fail without the switched files, when tests still
 *   fail after dropping the files that broke them, or when a test or test file
 *   hangs.
 */
async function recoverFromFailures(
  session: AdapterSession,
  input: DryPhaseInput,
  context: {
    errors: Map<string, string>
    diagnostics: Diagnostic[]
    failures: DryFailures
    related: string[]
  },
): Promise<Pick<DryPhase, 'unrepeatableFiles' | 'runs' | 'dry'>> {
  await checkRealFailures(session, input, context)
  let broken = findBrokenFiles(input, context.failures, context.related)
  for (let file of broken) {
    let display = input.displays.get(file)!
    let message = `Tests fail with the switched ${display} and pass without it; its mutants are not run.`
    context.errors.set(display, message)
    context.diagnostics.push(
      createDiagnostic('instrumentation-break', display, message),
    )
  }
  let kept = input.switched.filter(entry => !broken.has(entry.file))
  input.switched.splice(0, input.switched.length, ...kept)
  if (kept.length === 0) {
    return { unrepeatableFiles: new Set(), dry: createEmptyDry(), runs: 1 }
  }
  input.report({
    message: `Running the dry run again without ${pluralize(broken.size, 'file')} that broke tests.`,
    kind: 'dry-again',
  })
  let again = await runCheckedDry(
    session,
    kept.map(entry => entry.file),
    input,
  )
  let left = findFailures(again.dry)
  if (left.failing.length > 0 || left.unloaded.length > 0) {
    reportFailedFiles(input, [...left.failing, ...left.unloaded])
    throw new Error(
      formatFailures(
        "Tests still fail with mootant's switched files after the files that broke them were dropped",
        { files: left.unloaded, tests: left.failing },
        input.root,
      ),
    )
  }
  return { ...again, runs: again.runs + 1 }
}

/**
 * Adds an `instrument-error` for each switched file whose loaded text differed
 * in an instrumented dry run, and a `never-served` warning for each one that no
 * instrumented dry run served, with how the tests loaded it past the adapter
 * when the adapter told; a reason from a later run wins.
 *
 * @param input - Switched files left and their display paths.
 * @param outcome - The instrumented dry runs and what the dry phase collects.
 * @param outcome.instrumented - Dry runs with the switched files, in the order
 *   they ran.
 * @param outcome.errors - Messages of the files whose mutants get no verdict,
 *   by display path, added to.
 * @param outcome.diagnostics - Diagnostics of the dry phase, added to.
 */
function diagnoseServedFiles(
  input: DryPhaseInput,
  outcome: {
    instrumented: DryRunResult[]
    errors: Map<string, string>
    diagnostics: Diagnostic[]
  },
): void {
  let mismatched = new Set(outcome.instrumented.flatMap(dry => dry.mismatched))
  let served = new Set(outcome.instrumented.flatMap(dry => dry.served))
  let unserved = new Map(
    outcome.instrumented
      .flatMap(dry => dry.unserved ?? [])
      .map(entry => [entry.file, entry.reason]),
  )
  for (let { file } of input.switched) {
    let display = input.displays.get(file)!
    if (mismatched.has(file)) {
      let message = `The test runner loaded ${display} with a text that differs from the listed one; its mutants are not run.`
      outcome.errors.set(display, message)
      outcome.diagnostics.push(
        createDiagnostic('instrument-error', display, message),
      )
    } else if (!served.has(file)) {
      outcome.diagnostics.push(
        createDiagnostic(
          'never-served',
          display,
          `No test loaded ${display} through the test runner's transform: ${unserved.get(file) ?? 'no test imports it, or tests import a built copy, an external or a pre-bundled dependency'}.`,
        ),
      )
    }
  }
}

/**
 * Runs the test files of the failing tests and failed files of an instrumented
 * dry run again without the switched files, each test once. Failures that
 * remain are real, not caused by the instrumentation, and stop the run.
 *
 * @param session - Live test runner.
 * @param input - Progress and the directory display paths are relative to.
 * @param check - Failures of the dry run and the switched files it ran with.
 * @param check.failures - Failing tests and unloaded files of the dry run.
 * @param check.related - Absolute paths of the switched files.
 * @throws Error - When tests fail without the switched files, or when a test or
 *   test file hangs.
 */
async function checkRealFailures(
  session: AdapterSession,
  input: DryPhaseInput,
  check: { failures: DryFailures; related: string[] },
): Promise<void> {
  let { failures, related } = check
  let { unloaded, failing } = failures
  let failingIds = new Set(failing.map(test => test.id))
  let unloadedFiles = new Set(unloaded.map(file => file.file))
  input.report({
    message: 'Some tests failed; running them again without mutants to check.',
    kind: 'dry-again',
  })
  let plain = await runDry(
    session,
    {
      files: listTestFiles([...failing, ...unloaded]),
      instrumented: false,
      repeat: false,
      related,
    },
    input.root,
  )
  let real = findFailures(plain)
  let realTests = real.failing.filter(test => failingIds.has(test.id))
  let realFiles = real.unloaded.filter(file => unloadedFiles.has(file.file))
  if (realTests.length > 0 || realFiles.length > 0) {
    reportFailedFiles(input, [...realTests, ...realFiles])
    throw new Error(
      formatFailures(
        'Tests fail without mutants; fix them first',
        { files: realFiles, tests: realTests },
        input.root,
      ),
    )
  }
}

/**
 * Builds the message of a fatal dry-run failure: a count, up to ten lines of
 * test or file and message, and a hint when a snapshot assertion failed.
 *
 * @param heading - Sentence that names what the tests do.
 * @param failures - Failing tests and test files that failed to load.
 * @param failures.tests - Tests whose first try failed.
 * @param failures.files - Test files that failed to load.
 * @param root - Directory display paths are relative to.
 * @returns Message of several lines.
 */
function formatFailures(
  heading: string,
  failures: { files: DryFile[]; tests: DryTest[] },
  root: string,
): string {
  let { files, tests } = failures
  let lines = [
    ...files.map(
      file =>
        `  ${getDisplayPath(file.file, root)}: fails to load: ${file.errors[0] ?? 'unknown error'}`,
    ),
    ...tests.map(
      test =>
        `  ${getDisplayPath(test.file, root)} > ${test.name}: ${test.tries[0]!.message ?? 'failed'}`,
    ),
  ]
  let counts = [
    tests.length > 0 && pluralize(tests.length, 'test'),
    files.length > 0 && pluralize(files.length, 'test file'),
  ].filter(Boolean)
  let message = `${heading} (${counts.join(', ')}):\n${lines.slice(0, LISTED_FAILURES).join('\n')}`
  if (lines.length > LISTED_FAILURES) {
    message += `\n  and ${lines.length - LISTED_FAILURES} more`
  }
  if (lines.some(line => /snapshot/iu.test(line))) {
    message +=
      '\nSnapshots may be missing: mootant never writes them, so write them with the test runner first.'
  }
  return message
}

/**
 * Runs one dry run with the watchdog budgets and stops the run when a worker
 * hung: a test that loops or never settles without mutants leaves nothing to
 * compare mutants with.
 *
 * @param session - Live test runner.
 * @param request - Related files, tests and whether to serve switched texts.
 * @param root - Directory display paths are relative to.
 * @returns Result of the dry run.
 * @throws Error - When the adapter stopped a hung worker, naming the test or
 *   test file.
 */
async function runDry(
  session: AdapterSession,
  request: Omit<DryRunRequest, 'timeouts'>,
  root: string,
): Promise<DryRunResult> {
  let dry = await session.dryRun({ ...request, timeouts: DRY_TIMEOUTS })
  let [hung] = dry.hung
  if (hung !== undefined) {
    let display = getDisplayPath(hung.file, root)
    throw new Error(
      hung.name === null ?
        `Tests hang without mutants: ${display} did not finish loading or its suite hooks within ${DRY_TIMEOUTS.file / 1000} s plus the timeouts of its suite hooks, and its worker was stopped.`
      : `Tests hang without mutants: "${hung.name}" in ${display} did not finish within ${DRY_TIMEOUTS.test / 1000} s plus its own timeout and the timeouts of its hooks, and its worker was stopped.`,
    )
  }
  return dry
}

/**
 * Finds the switched files the instrumentation broke: the source files of the
 * mutants whose sites the failing tests and failed files reached. When they
 * reached none, every switched file counts as broken.
 *
 * @param input - Source files of the pending mutants.
 * @param failures - Failing tests and unloaded files of the dry run.
 * @param related - Absolute paths of the switched files it ran with.
 * @returns Absolute paths of the broken files.
 */
function findBrokenFiles(
  input: DryPhaseInput,
  failures: DryFailures,
  related: readonly string[],
): Set<string> {
  let broken = new Set(
    [
      ...failures.failing.flatMap(test => test.tries[0]!.covers ?? []),
      ...failures.unloaded.flatMap(file => file.covers),
    ].map(id => input.mutantFiles.get(id)!),
  )
  return broken.size === 0 ? new Set(related) : broken
}

/**
 * Builds a diagnostic about a mutated file.
 *
 * @param code - Kind of the problem; `never-served` is a warning, the others
 *   are errors.
 * @param file - Display path of the file.
 * @param message - Sentence naming the problem.
 * @returns Diagnostic without a position.
 */
function createDiagnostic(
  code: 'instrumentation-break' | 'instrument-error' | 'never-served',
  file: string,
  message: string,
): Diagnostic {
  return {
    severity: code === 'never-served' ? 'warning' : 'error',
    column: null,
    line: null,
    message,
    file,
    code,
  }
}

/**
 * Lists the test files of failed tests and failed files once each.
 *
 * @param entries - Failed tests and test files.
 * @returns Paths and projects of their test files.
 */
function listTestFiles(
  entries: { project: string; file: string }[],
): { project: string; file: string }[] {
  let files = new Map(
    entries.map(({ project, file }) => [
      getTestFileKey({ project, file }),
      { project, file },
    ]),
  )
  return [...files.values()]
}

/**
 * Reports the test files of tests that fail without mutants, so the command
 * line can show what they wrote.
 *
 * @param input - Progress and the directory display paths are relative to.
 * @param failures - Failed tests and test files.
 */
function reportFailedFiles(
  input: DryPhaseInput,
  failures: { file: string }[],
): void {
  input.report({
    files: [
      ...new Set(failures.map(({ file }) => getDisplayPath(file, input.root))),
    ].toSorted(compareCodeUnits),
    kind: 'dry-failed',
  })
}

/**
 * Finds the tests whose first try failed and the test files that failed to
 * load.
 *
 * @param dry - Result of a dry run.
 * @returns Failing tests and unloaded files.
 */
function findFailures(dry: DryRunResult): DryFailures {
  return {
    failing: dry.tests.filter(test => test.tries[0]!.failed),
    unloaded: dry.files.filter(file => file.loadFailed),
  }
}

/**
 * Builds the result of a dry run that ran no test, the one the batch and
 * isolated phases plan from when no switched file is left.
 *
 * @returns Dry run without tests, test files, served files or hung workers.
 */
function createEmptyDry(): DryRunResult {
  return {
    mismatched: [],
    outside: [],
    served: [],
    files: [],
    tests: [],
    hung: [],
  }
}

/**
 * Joins two sorted lists of paths without repeats.
 *
 * @param left - Sorted paths.
 * @param right - Sorted paths.
 * @returns Paths of both, sorted.
 */
function mergeSorted(left: string[], right: string[]): string[] {
  return [...new Set([...left, ...right])].toSorted(compareCodeUnits)
}
