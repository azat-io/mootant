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
   * Receives `dry-start` as the dry phase starts, a `dry-again` before each
   * later dry run, and `dry-failed` before failing tests stop the run.
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
   * `instrumentation-break`, `instrument-error` and `never-served` diagnostics,
   * and outside fast mode an `unrepeatable-test` warning for each failure of a
   * test file that passed when it ran again.
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
 * Why a switched file counts as broken by the instrumentation.
 */
interface Breakage {
  /**
   * How the failure ties to the file: it reached mutant sites of the file
   * (`sites`), its test file depends on the file (`dependency`), or no failure
   * ties to a switched file either way, so every switched file counts as broken
   * (`unknown`).
   */
  link: 'dependency' | 'unknown' | 'sites'

  /**
   * First failing test or test file that failed outside its tests that ties to
   * the file, or with `unknown` the first failure of the dry run.
   */
  failure: DryTest | DryFile
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
 * in fast mode (`repeat`) twice in a row. When tests fail or files fail to
 * load, their test files run again with the same switched files and each test
 * once, as a plain run of the test runner does. In fast mode a try can leave
 * state, such as a counter or collected results, that fails the next test or a
 * suite hook only because the tests were repeated: test files that pass then
 * keep the results of that run and are unrepeatable, so every mutant their
 * tests reach runs isolated. Outside fast mode a test file that passes then may
 * be flaky, such as one that waits for a port or a resource: it keeps the
 * results of that run, and each of its failures gets an `unrepeatable-test`
 * warning. Failures that remain run again without the switched files: failures
 * that remain are real and stop the run; the others come from the
 * instrumentation (`findBrokenFiles`). The switched files they break are
 * dropped with an `instrumentation-break` error that names a failure, and while
 * switched files are left the dry run is repeated once, with its own second run
 * of failed test files. So the phase takes one dry run when nothing fails, and
 * at most five. Files whose loaded text differed get an `instrument-error`,
 * files never served a `never-served` warning. Without related tests the dry
 * run is empty, so every mutant ends without coverage. A dry run whose worker
 * hung past its budget (`DRY_TIMEOUTS`) stops the run with the test it hung
 * in.
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
  let checked = await runCheckedDry(session, input, { diagnostics, related })
  let instrumented = [checked.dry]
  let failures = findFailures(checked.dry)
  if (failures.failing.length > 0 || failures.unloaded.length > 0) {
    let recovered = await recoverFromFailures(session, input, {
      files: checked.dry.files,
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
 * row with `repeat`; then runs the test files of failed tests and failed files
 * once more with the same switched files and each test once. Test files that
 * pass then take the results of that run, since a plain run of the test runner
 * passes them too; the others keep their failures from it, even those the first
 * run did not have. With `repeat` the test files that pass are unrepeatable;
 * without it each failure in them gets an `unrepeatable-test` warning, once, as
 * a flaky test fails and passes this way.
 *
 * @param session - Live test runner.
 * @param input - Repeats, progress and the directory display paths are relative
 *   to.
 * @param check - Switched files to run with and what the dry phase collects.
 * @param check.diagnostics - Diagnostics of the dry phase, added to.
 * @param check.related - Absolute paths of the switched files.
 * @returns The dry run, the keys of the test files that failed only when
 *   repeated, and the number of runs.
 * @throws Error - When a test or test file hangs.
 */
async function runCheckedDry(
  session: AdapterSession,
  input: DryPhaseInput,
  check: { diagnostics: Diagnostic[]; related: string[] },
): Promise<Pick<DryPhase, 'unrepeatableFiles' | 'runs' | 'dry'>> {
  let { diagnostics, related } = check
  let dry = await runDry(
    session,
    { repeat: input.repeat, instrumented: true, files: null, related },
    input.root,
  )
  let { unloaded, failing } = findFailures(dry)
  if (failing.length === 0 && unloaded.length === 0) {
    return { unrepeatableFiles: new Set(), runs: 1, dry }
  }
  let files = listTestFiles([...failing, ...unloaded])
  let pronoun = files.length === 1 ? 'it' : 'them'
  input.report({
    message:
      input.repeat ?
        `${pluralize(files.length, 'test file')} failed with each test run twice; running ${pronoun} again with each test once.`
      : `${pluralize(files.length, 'test file')} failed; running ${pronoun} again to see whether the failures repeat.`,
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
  let passed = new Set([...rerun].filter(key => !stillFailing.has(key)))
  if (!input.repeat) {
    let warnings = [...unloaded, ...failing]
      .filter(failure => passed.has(getTestFileKey(failure)))
      .map(failure => createFlakyWarning(failure, input.root))
    for (let warning of warnings) {
      let known = diagnostics.some(
        other =>
          other.message === warning.message &&
          other.file === warning.file &&
          other.line === warning.line,
      )
      if (!known) {
        diagnostics.push(warning)
      }
    }
  }
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
    unrepeatableFiles: input.repeat ? passed : new Set(),
    runs: 2,
  }
}

/**
 * Finds the switched files the instrumentation broke. A failing test breaks the
 * source files of the mutants whose sites it reached; one that reached none
 * breaks the switched files its test file depended on in the run, even when
 * another failing test of that file reached sites, as the two may fail for
 * different files. A test file that failed outside its tests breaks every
 * switched file it depended on, along with the files of the sites it reached,
 * as those sites ran in modules that loaded before the one that threw, which
 * may throw before its first site; when the adapter cannot tell what the file
 * depends on, it breaks the files of its sites alone. When no failure ties to a
 * switched file in any of these ways, every switched file counts as broken.
 *
 * @param input - Source files of the pending mutants.
 * @param outcome - Failures of the dry run, its test files and the switched
 *   files it ran with.
 * @param outcome.failures - Failing tests and unloaded files of the dry run.
 * @param outcome.related - Absolute paths of the switched files.
 * @param outcome.files - Test files of the dry run.
 * @returns The first failure that breaks each broken file and how, or with
 *   `unknown` the first failure of the dry run, by absolute path, in the order
 *   of the switched files.
 */
function findBrokenFiles(
  input: DryPhaseInput,
  outcome: { failures: DryFailures; related: string[]; files: DryFile[] },
): Map<string, Breakage> {
  let { failures, related, files } = outcome
  let switched = new Set(related)
  let dependencies = new Map(
    files.map(file => [
      getTestFileKey(file),
      (file.dependencies ?? []).filter(dependency => switched.has(dependency)),
    ]),
  )
  let found = new Map<string, Breakage>()
  /**
   * Ties a failure to each of the given files that no earlier failure broke.
   *
   * @param failure - Failing test or test file.
   * @param link - How the failure ties to the files.
   * @param reached - Absolute paths of the files.
   */
  function tie(
    failure: DryTest | DryFile,
    link: Breakage['link'],
    reached: string[],
  ): void {
    for (let file of reached) {
      if (!found.has(file)) {
        found.set(file, { failure, link })
      }
    }
  }
  for (let file of failures.unloaded) {
    let sites = file.covers.map(id => input.mutantFiles.get(id)!)
    let depended = dependencies.get(getTestFileKey(file))!
    if (depended.length > 0) {
      tie(file, 'dependency', [...sites, ...depended])
    } else {
      tie(file, 'sites', sites)
    }
  }
  for (let test of failures.failing) {
    let sites = (test.tries[0]!.covers ?? []).map(id =>
      input.mutantFiles.get(id)!,
    )
    if (sites.length > 0) {
      tie(test, 'sites', sites)
    } else {
      tie(test, 'dependency', dependencies.get(getTestFileKey(test)) ?? [])
    }
  }
  if (found.size === 0) {
    let [failure] = [...failures.unloaded, ...failures.failing]
    return new Map(
      related.map(file => [file, { failure: failure!, link: 'unknown' }]),
    )
  }
  return new Map(
    related
      .filter(file => found.has(file))
      .map(file => [file, found.get(file)!]),
  )
}

/**
 * Recovers from failures of the instrumented dry run. The failures run again
 * without the switched files first (`checkRealFailures`), and those that remain
 * stop the run; the switched files the others break (`findBrokenFiles`) get an
 * `instrumentation-break` error that names a failure and are removed from
 * `input.switched` in place, before the dry run is repeated once for the
 * switched files left.
 *
 * @param session - Live test runner.
 * @param input - Switched files, mutant files, display paths and progress.
 * @param context - Failures of the dry run and what the dry phase collects.
 * @param context.errors - Messages of the files whose mutants get no verdict,
 *   by display path, added to.
 * @param context.diagnostics - Diagnostics of the dry phase, added to.
 * @param context.failures - Failing tests and unloaded files of the dry run.
 * @param context.related - Absolute paths of the switched files it ran with.
 * @param context.files - Test files of the dry run.
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
    files: DryFile[]
  },
): Promise<Pick<DryPhase, 'unrepeatableFiles' | 'runs' | 'dry'>> {
  await checkRealFailures(session, input, context)
  let broken = findBrokenFiles(input, context)
  for (let [file, breakage] of broken) {
    let display = input.displays.get(file)!
    let message = describeBreakage(breakage, display, input.root)
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
  let again = await runCheckedDry(session, input, {
    related: kept.map(entry => entry.file),
    diagnostics: context.diagnostics,
  })
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
 * Runs the test files of the failing tests and failed files of an instrumented
 * dry run again without the switched files, each test once. Failures that
 * remain are real, not caused by the instrumentation, and stop the run. So do a
 * test file of a failing test that then fails outside its tests, and a failing
 * test of a file that failed outside its tests with the switched files, since
 * its tests did not run then.
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
  let unloadedKeys = new Set(unloaded.map(file => getTestFileKey(file)))
  let failedKeys = new Set(
    [...unloaded, ...failing].map(entry => getTestFileKey(entry)),
  )
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
  let realTests = real.failing.filter(
    test => failingIds.has(test.id) || unloadedKeys.has(getTestFileKey(test)),
  )
  let realFiles = real.unloaded.filter(file =>
    failedKeys.has(getTestFileKey(file)),
  )
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
 * Builds the message of a fatal dry-run failure: a count, up to ten lines of
 * test or file and message, and a hint when a line names snapshots.
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
      '\nSnapshots may be missing or obsolete: mootant never writes or removes them, so update them with the test runner first.'
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
 * Builds the warning of a failure that passed when its test file ran again with
 * the same switched files, as a flaky test does.
 *
 * @param failure - Failing test, or test file that failed outside its tests.
 * @param root - Directory display paths are relative to.
 * @returns `unrepeatable-test` warning at the test, or at the test file.
 */
function createFlakyWarning(
  failure: DryTest | DryFile,
  root: string,
): Diagnostic {
  let display = getDisplayPath(failure.file, root)
  if ('tries' in failure) {
    return {
      ...createDiagnostic(
        'unrepeatable-test',
        display,
        `"${failure.name}" failed${quoteError(failure.tries[0]!.message)} in a run without mutants and passed when run again; it may be flaky and kill mutants by chance.`,
      ),
      line: failure.line,
    }
  }
  return createDiagnostic(
    'unrepeatable-test',
    display,
    `${display} failed outside its tests${quoteError(failure.errors[0])} in a run without mutants and passed when run again; its tests may be flaky and kill mutants by chance.`,
  )
}

/**
 * Builds the message of a switched file the instrumentation broke.
 *
 * @param breakage - First failure that breaks the file and how.
 * @param display - Display path of the file.
 * @param root - Directory display paths are relative to.
 * @returns Sentence that names the failure and why the file is dropped.
 */
function describeBreakage(
  breakage: Breakage,
  display: string,
  root: string,
): string {
  let example = describeFailure(breakage.failure, root)
  if (breakage.link === 'sites') {
    return `Tests that reach mutant sites of ${display} fail only with mootant's switched files, such as ${example}; its mutants are not run.`
  }
  if (breakage.link === 'dependency') {
    return `Tests that depend on ${display} fail only with mootant's switched files, such as ${example}; its mutants are not run.`
  }
  return `Tests fail only with mootant's switched files, such as ${example}, and mootant cannot tell which switched file breaks them; the mutants of every switched file are not run.`
}

/**
 * Builds a diagnostic about a mutated file or a test file.
 *
 * @param code - Kind of the problem; `never-served` and `unrepeatable-test` are
 *   warnings, the others are errors.
 * @param file - Display path of the file.
 * @param message - Sentence naming the problem.
 * @returns Diagnostic without a position.
 */
function createDiagnostic(
  code:
    | 'instrumentation-break'
    | 'unrepeatable-test'
    | 'instrument-error'
    | 'never-served',
  file: string,
  message: string,
): Diagnostic {
  return {
    severity:
      code === 'never-served' || code === 'unrepeatable-test' ?
        'warning'
      : 'error',
    column: null,
    line: null,
    message,
    file,
    code,
  }
}

/**
 * Names a failure of a dry run for the middle of a sentence.
 *
 * @param failure - Failing test, or test file that failed outside its tests.
 * @param root - Directory display paths are relative to.
 * @returns Words such as `"adds" in test/a.test.ts (expected 1 to be 2)`, or
 *   `test/a.test.ts, which fails outside its tests (boom)`.
 */
function describeFailure(failure: DryTest | DryFile, root: string): string {
  let display = getDisplayPath(failure.file, root)
  return 'tries' in failure ?
      `"${failure.name}" in ${display}${quoteError(failure.tries[0]!.message)}`
    : `${display}, which fails outside its tests${quoteError(failure.errors[0])}`
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
 * Puts an error message in parentheses for the middle of a sentence.
 *
 * @param message - First line of the error, if any.
 * @returns The message without a final period, in parentheses after a space, or
 *   an empty string without a message.
 */
function quoteError(message: undefined | string | null): string {
  let text = message?.replace(/\.$/u, '') ?? ''
  return text === '' ? '' : ` (${text})`
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
