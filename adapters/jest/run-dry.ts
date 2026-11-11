import { mkdirSync } from 'node:fs'
import path from 'node:path'

import type { DryRunRequest } from '../../types/adapter/dry-run-request'
import type { DryRunResult } from '../../types/adapter/dry-run-result'
import type { JestTimedRecord } from './types/jest-timed-record'
import type { UnitOutcome } from './types/unit-outcome'
import type { JestConsole } from './types/jest-console'
import type { JestProject } from './types/jest-project'
import type { JestHandle } from './types/jest-handle'

import { getTestFileKey } from '../../core/run/get-test-file-key'
import { compareCodeUnits } from '../../core/compare-code-units'
import { getDisplayPath } from '../../core/run/get-display-path'
import { writeSwitchPlan } from '../shared/write-switch-plan'
import { listUnservedFiles } from './list-unserved-files'
import { getDryDeadline } from './get-dry-deadline'
import { runInPool } from '../shared/run-in-pool'
import { buildDryFile } from './build-dry-file'
import { runOnWorker } from './run-on-worker'

/**
 * What the records of a dry run say of the switched files.
 */
interface FoundRecords {
  /**
   * First line of the error of each file a transformer rejected, by absolute
   * path.
   */
  rejected: Map<string, string>

  /**
   * Switched files whose loaded text differed from the original.
   */
  mismatched: Set<string>

  /**
   * Switched files whose switched text was served.
   */
  served: Set<string>
}

/**
 * An attempt of a test file in a pass of a dry run.
 */
interface DryAttempt {
  /**
   * Console of its tests.
   */
  console: JestConsole

  /**
   * The test file and its project.
   */
  target: DryTarget
}

/**
 * A test file in one project, which is one unit of a dry run.
 */
interface DryTarget {
  /**
   * Project of the test file.
   */
  project: JestProject

  /**
   * Absolute path of the test file.
   */
  file: string
}

/**
 * Runs test files without a mutant, each once, recording the sites every try
 * and every test file evaluated. With instrumentation the switched files are
 * read again from the context into a new switch plan, which is the session's;
 * without it the workers switch nothing and the session keeps its plan.
 * Selected files run as given. Otherwise the test files that may load a related
 * file run: every test file with no reads yet, which in the first dry run is
 * all of them, and those whose last reads hold a related file; of those, only
 * the files that read one, hung or died are reported, so a test file that loads
 * none of them cannot stop the run. When every file that ran failed as a whole,
 * as with a setup file that throws, all are reported: they say nothing of what
 * they would load, and leaving them out would read as every mutant not covered.
 * Every file first runs once. Then a file whose worker may have hurt it or ran
 * out of memory runs once more as a clean attempt, on a drained pool
 * (`needsRecheck`); only the last attempt counts, and the worker an attempt ran
 * on goes at once, so that it serves nothing else. A worker that ran out of
 * memory raises the cap of later workers, while its file passes as in plain
 * Jest with no limit of mootant's. A warm worker reports a switched file only
 * in the first unit that transforms it, so what was served is read from every
 * file that ran. A switched file that every kept project keeps out of the
 * transform can never be served, which the result says with the reason.
 *
 * @param handle - Live session.
 * @param request - Test files or related files, budgets and whether to serve
 *   switched texts.
 * @returns Tests with their tries, test files, the switched files served, found
 *   changed and kept out of the transform, and the sites that ran outside the
 *   vms.
 * @throws {Error} When the request asks for every test twice in a row, once
 *   everything ran when a transformer rejects a switched text, or when Jest ran
 *   a test file with a test framework mootant cannot follow, since every mutant
 *   would then read as not covered.
 */
export async function runDry(
  handle: JestHandle,
  request: DryRunRequest,
): Promise<DryRunResult> {
  if (request.repeat) {
    throw new Error(
      'The jest adapter runs each test once; it cannot try tests twice in a row.',
    )
  }
  let { directory, state, root } = handle
  state.timeouts = request.timeouts
  let plan = writeDryPlan(handle, request.instrumented)
  mkdirSync(path.join(directory, 'out'), { recursive: true })
  let related = new Set(request.related)
  /**
   * Tells whether reads include a related file.
   *
   * @param reads - Absolute paths a unit read.
   * @returns Whether one of them is related.
   */
  function relates(reads: readonly string[]): boolean {
    return reads.some(file => related.has(file))
  }
  let targets = listTargets(handle, request, relates)
  let outcomes = await runFiles(handle, {
    timeouts: request.timeouts,
    targets,
    plan,
  })
  let result: DryRunResult = {
    unserved:
      request.instrumented ?
        listUnservedFiles(handle.projects, handle.context.files)
      : [],
    mismatched: [],
    outside: [],
    served: [],
    files: [],
    tests: [],
    hung: [],
  }
  let found: FoundRecords = {
    mismatched: new Set(),
    rejected: new Map(),
    served: new Set(),
  }
  let unfollowed: string[] = []
  let allFailed = outcomes.every(({ records }) => {
    let finish = records.find(record => record.kind === 'finish')
    return finish?.outcome === 'failure' || finish?.outcome === 'empty'
  })
  for (let [index, outcome] of outcomes.entries()) {
    let { project, file } = targets[index]!
    let finish = outcome.records.find(record => record.kind === 'finish')
    collectRecords(outcome.records, found, state.outside)
    if (
      finish?.outcome === 'result' &&
      finish.execError === null &&
      outcome.records.every(record => record.kind !== 'load')
    ) {
      unfollowed.push(getDisplayPath(file, root))
    }
    if (
      allFailed ||
      request.files !== null ||
      !outcome.done ||
      relates(finish!.reads)
    ) {
      let report = buildDryFile(outcome, { project: project.name, root, file })
      result.files.push(report.entry)
      result.tests.push(...report.tests)
      if (report.hung !== null) {
        result.hung.push({ ...report.hung, file })
      }
    }
  }
  throwOnRefusals(found.rejected, unfollowed, root)
  result.outside = [...state.outside].toSorted(compareCodeUnits)
  result.mismatched = [...found.mismatched].toSorted(compareCodeUnits)
  result.served = [...found.served].toSorted(compareCodeUnits)
  result.files = result.files.toSorted((left, right) =>
    compareCodeUnits(left.file, right.file),
  )
  result.tests = result.tests.toSorted((left, right) =>
    compareCodeUnits(left.file, right.file),
  )
  return result
}

/**
 * Runs the first attempt of every test file, then, on a drained pool, a clean
 * attempt of each that needs one. Under `freshWorkers` first attempts are clean
 * too. Tests get the console of their project in plain Jest, but for a recheck
 * of an attempt the watchdog stopped, which writes what they print at once, so
 * that a hang still shows it. A recheck of one that died, such as at mootant's
 * heap limit, is what plain Jest gives the file, console included.
 *
 * @param handle - Live session.
 * @param input - What to run.
 * @param input.timeouts - Budgets of the dry run.
 * @param input.targets - Test files and projects.
 * @param input.plan - Absolute path of the switch plan, or null.
 * @returns What the last attempt of each file left behind, in their order.
 */
async function runFiles(
  handle: JestHandle,
  input: {
    timeouts: DryRunRequest['timeouts']
    targets: DryTarget[]
    plan: string | null
  },
): Promise<UnitOutcome[]> {
  let { freshWorkers, consoles, pool } = handle
  let { timeouts, targets, plan } = input

  /**
   * Runs one attempt of each of some test files.
   *
   * @param attempts - The test files and the consoles of their tests.
   * @param kind - How they run.
   * @param kind.clean - Whether these are clean attempts.
   * @param kind.last - Whether no other attempt follows, whatever they leave.
   * @returns What each attempt left behind, in their order.
   */
  function runPass(
    attempts: readonly DryAttempt[],
    kind: { clean: boolean; last: boolean },
  ): Promise<UnitOutcome[]> {
    return runInPool(
      attempts.map(attempt => ({
        run: () => runAttempt(handle, { ...attempt, ...kind, timeouts, plan }),
        key: attempt.target.file,
      })),
      pool.size,
    )
  }

  let first = await runPass(
    targets.map(target => ({
      console: consoles.get(target.project.name)!,
      target,
    })),
    { clean: freshWorkers, last: false },
  )
  let rechecked = targets.flatMap((target, index): DryAttempt[] => {
    let outcome = first[index]!
    if (!needsRecheck(outcome, freshWorkers)) {
      return []
    }
    return [
      {
        console: outcome.hung ? 'stream' : consoles.get(target.project.name)!,
        target,
      },
    ]
  })
  if (rechecked.length === 0) {
    return first
  }
  await pool.discardAll()
  let last = await runPass(rechecked, { clean: true, last: true })
  let replaced = new Map(
    rechecked.map(({ target }, index) => [target, last[index]!]),
  )
  return targets.map((target, index) => replaced.get(target) ?? first[index]!)
}

/**
 * Runs one attempt of a test file, with a new out file. A worker that ran out
 * of memory raises the cap of later workers. An attempt that counts is kept,
 * and one that needs a recheck leaves that to the recheck.
 *
 * @param handle - Live session.
 * @param input - What to run.
 * @param input.timeouts - Budgets of the dry run.
 * @param input.target - Test file and project.
 * @param input.plan - Absolute path of the switch plan, or null.
 * @param input.console - Console of the tests.
 * @param input.clean - Whether this is a clean attempt.
 * @param input.last - Whether no other attempt follows, whatever this one
 *   leaves.
 * @returns What the attempt left behind.
 */
async function runAttempt(
  handle: JestHandle,
  input: {
    timeouts: DryRunRequest['timeouts']
    console: JestConsole
    plan: string | null
    target: DryTarget
    clean: boolean
    last: boolean
  },
): Promise<UnitOutcome> {
  let { directory, state, heap, pool } = handle
  let { timeouts, target, clean, plan, last } = input
  state.units += 1
  let slot = pool.take()
  let outcome: UnitOutcome
  try {
    outcome = await runOnWorker(pool, slot, {
      unit: {
        out: path.join(directory, 'out', `${state.units}.jsonl`),
        project: target.project.config.id,
        console: input.console,
        file: target.file,
        mutant: null,
        plan,
      },
      deadline: (records, sent) => getDryDeadline(records, sent, timeouts),
      discardWhen: ended => needsRecheck(ended, clean),
      clean,
    })
  } finally {
    pool.release(slot)
  }
  if (outcome.outOfMemory !== null) {
    heap.raise(outcome.outOfMemory)
  }
  if (last || !needsRecheck(outcome, clean)) {
    keepLastAttempt(handle, target, outcome)
  }
  return outcome
}

/**
 * Stops a dry run with what makes every later result wrong, once everything
 * ran, so that nothing runs for hours first: switched texts a transformer
 * rejects would make the core drop the wrong files, and a test framework
 * mootant cannot follow would make every mutant read as not covered.
 *
 * @param rejected - First line of the error of each file, by absolute path.
 * @param unfollowed - Display paths of the test files that ran without a `load`
 *   record.
 * @param root - Real path of the project root.
 * @throws {Error} With one line per rejected file, sorted, or naming the first
 *   test file that ran that way.
 */
function throwOnRefusals(
  rejected: ReadonlyMap<string, string>,
  unfollowed: readonly string[],
  root: string,
): void {
  if (rejected.size > 0) {
    throw new Error(
      [...rejected]
        .map(
          ([file, message]) => [getDisplayPath(file, root), message] as const,
        )
        .toSorted(([left], [right]) => compareCodeUnits(left, right))
        .map(
          ([file, message]) =>
            `The test runner's transformer rejects the text with mutants of ${file}: ${message}; exclude the file.`,
        )
        .join('\n'),
    )
  }
  let [first] = [...unfollowed].toSorted(compareCodeUnits)
  if (first !== undefined) {
    throw new Error(
      `Jest ran ${first} with no test framework mootant can follow; jest-circus is required.`,
    )
  }
}

/**
 * Lists the test files of a dry run; one in two projects is two.
 *
 * @param handle - Live session.
 * @param request - Test files of the run, or null for those that may load a
 *   related file.
 * @param relates - Tells whether reads include a related file.
 * @returns The test files with their projects.
 */
function listTargets(
  handle: JestHandle,
  request: DryRunRequest,
  relates: (reads: readonly string[]) => boolean,
): DryTarget[] {
  let { projects, tests, state } = handle
  if (request.files !== null) {
    return request.files.map(({ project, file }) => ({
      project: projects.find(({ name }) => name === project)!,
      file,
    }))
  }
  return tests
    .map(test => ({
      project: projects.find(({ config }) => config.id === test.project)!,
      file: test.path,
    }))
    .filter(({ project, file }) => {
      let reads = state.reads.get(
        getTestFileKey({ project: project.name, file }),
      )
      return reads === undefined || relates(reads)
    })
}

/**
 * Keeps what later dry runs read of a test file and tells of its end, once per
 * file, from the attempt that counts. A file with no `finish` has no reads, so
 * the next dry run runs it again. What the transformers read joins what they
 * read in other units. What tests printed to a console that kept it goes to the
 * output with the failure of the file, in the order Jest's reporters show
 * them.
 *
 * @param handle - Live session.
 * @param target - Test file and project.
 * @param outcome - What its last attempt left behind.
 */
function keepLastAttempt(
  handle: JestHandle,
  target: DryTarget,
  outcome: UnitOutcome,
): void {
  let { context, state } = handle
  let { project, file } = target
  context.onUnitEnd?.()
  let finish = outcome.records.find(record => record.kind === 'finish')
  let key = getTestFileKey({ project: project.name, file })
  if (finish === undefined) {
    state.reads.delete(key)
  } else {
    state.reads.set(key, finish.reads)
    for (let read of finish.transforms) {
      state.transforms.add(read)
    }
    for (let text of [finish.consoleOutput, finish.failureMessage]) {
      if (text !== null) {
        context.onOutput?.(text, file)
      }
    }
  }
}

/**
 * Collects what a file that ran says, whether it is reported or not.
 *
 * @param records - Records of its last attempt.
 * @param found - Receives what they say of the switched files.
 * @param outside - Receives the ids of the sites that ran outside the vm.
 */
function collectRecords(
  records: readonly JestTimedRecord[],
  found: FoundRecords,
  outside: Set<string>,
): void {
  for (let record of records) {
    if (record.kind === 'served') {
      found.served.add(record.file)
    } else if (record.kind === 'mismatched') {
      found.mismatched.add(record.file)
    } else if (record.kind === 'rejected' && !found.rejected.has(record.file)) {
      found.rejected.set(record.file, record.message)
    } else if (record.kind === 'finish') {
      for (let id of record.outside) {
        outside.add(id)
      }
    }
  }
}

/**
 * Tells whether a dry unit must run once more as a clean attempt before
 * anything is reported, since a false failure here would drop whole source
 * files or stop the run: it left no `finish`, which is also how running out of
 * memory looks, the tracker lost a record, a failure is a leftover of an
 * earlier unit, or, on an attempt that was not clean, a failure could come from
 * what a warm worker on any slot holds in core modules or in its handles.
 *
 * @param outcome - What the attempt left behind.
 * @param clean - Whether it was a clean attempt.
 * @returns Whether to run it again.
 */
function needsRecheck(outcome: UnitOutcome, clean: boolean): boolean {
  let { records, done } = outcome
  let finish = records.find(record => record.kind === 'finish')
  let realms = new Set(
    records.flatMap(record =>
      record.kind === 'try' || record.kind === 'finish' ? [record.realm] : [],
    ),
  )
  return (
    !done ||
    realms.has('stale') ||
    records.some(
      record => record.kind === 'stale' || record.kind === 'tracker-error',
    ) ||
    (!clean && (realms.has('host') || finish!.execError !== null))
  )
}

/**
 * Writes the switch plan of a dry run into a new directory, since each plan
 * path gets its own entry in Jest's in-memory transforms, and keeps it as the
 * session's.
 *
 * @param handle - Live session.
 * @param instrumented - Whether the run serves switched texts.
 * @returns Absolute path of the plan, or null for a run that switches nothing.
 */
function writeDryPlan(
  handle: JestHandle,
  instrumented: boolean,
): string | null {
  if (!instrumented) {
    return null
  }
  let { state } = handle
  state.plans += 1
  state.plan = writeSwitchPlan(
    path.join(handle.directory, 'plans', String(state.plans)),
    handle.context.files,
  )
  return state.plan
}
