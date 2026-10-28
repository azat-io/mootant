import path from 'node:path'

import type { DryRunRequest } from '../../types/adapter/dry-run-request'
import type { DryRunResult } from '../../types/adapter/dry-run-result'
import type { NodeTestHandle } from './types/node-test-handle'
import type { NodeTestRecord } from './types/node-test-record'

import { collectNodeDependencies } from './collect-node-dependencies'
import { compareCodeUnits } from '../../core/compare-code-units'
import { listLoadedFiles } from './list-loaded-files'
import { writeSwitchPlan } from './write-switch-plan'
import { getDryDeadline } from './get-dry-deadline'
import { buildDryFile } from './build-dry-file'
import { runTestFile } from './run-test-file'
import { runInPool } from './run-in-pool'

/**
 * How a switched file in Node's `require` cache was never served, on Node
 * versions whose module hooks run in a thread of their own: `require()` of an
 * ES module passes neither through them nor through
 * `Module.prototype._compile`.
 */
const REQUIRED_ESM =
  'a test loads it through require() of an ES module, which Node before 22.15 runs past module hooks; use Node 22.15 or later'

/**
 * Runs test files without a mutant, each in a test process of its own, each
 * test once, with the session's processes at once (`runInPool`), recording the
 * mutant sites every try and every test file evaluated. With instrumentation
 * the switched files are checked (`NodeTestHandle.checkTypeScript`) and read
 * again from the context into the session's switch plan; without it the
 * processes switch nothing. Selected files run as given. Otherwise the test
 * files that may load a related file run: every test file whose modules in its
 * last dry run included one, and every test file that never ran, which in the
 * first dry run of a session is all of them; of those, only the files that
 * loaded a related file, or hung, are reported, so a test file that loads none
 * of them cannot fail the run. A watchdog stops a process past the request's
 * budgets (`getDryDeadline`) and reports it in `hung`. The modules and the
 * expected failures of every file that ran, and whether it reported a todo test
 * or suite, are kept for later runs. A switched file in the `require` cache of
 * a process whose module hooks run in a thread of their own, never served nor
 * found changed, is reported in `unserved`, since only `require()` of an ES
 * module loads it so. The end of every test file is reported to the context's
 * `onUnitEnd`.
 *
 * @param handle - Live session.
 * @param request - Test files or related files, budgets and whether to serve
 *   switched texts.
 * @returns Tests with their tries, test files and the switched files served and
 *   found changed.
 * @throws {Error} When the request asks for every test twice in a row, or when
 *   mootant cannot switch a switched TypeScript file (`checkTypeScript`).
 */
export async function runDry(
  handle: NodeTestHandle,
  request: DryRunRequest,
): Promise<DryRunResult> {
  if (request.repeat) {
    throw new Error(
      'The node-test adapter runs each test once; it cannot try tests twice in a row.',
    )
  }
  let { context, state } = handle
  let plan = writeDryPlan(handle, request.instrumented)
  let related = new Set(request.related)
  /**
   * Tells whether modules include a related file.
   *
   * @param modules - Absolute paths of modules.
   * @returns Whether one of them is related.
   */
  function relates(modules: Set<string>): boolean {
    return [...related].some(file => modules.has(file))
  }
  let files =
    request.files?.map(entry => entry.file) ??
    handle.files.filter(file => {
      let modules = state.modules.get(file)
      return modules === undefined || relates(modules)
    })
  let outcomes = await runInPool(
    files.map(file => ({
      run: async () => {
        let outcome = await runTestFile(handle, {
          deadline: watch =>
            getDryDeadline(watch, request.timeouts, handle.testTimeout),
          hitLimit: null,
          expected: [],
          mutant: null,
          mode: 'dry',
          bail: false,
          plan,
          file,
        })
        context.onUnitEnd?.()
        return outcome
      },
      key: file,
    })),
    handle.workers,
  )
  let result: DryRunResult = {
    mismatched: [],
    outside: [],
    served: [],
    files: [],
    tests: [],
    hung: [],
  }
  let found = {
    mismatched: new Set<string>(),
    required: new Set<string>(),
    served: new Set<string>(),
  }
  let switched = new Set(context.files.map(entry => entry.file))
  let cache = { tsconfigs: new Map(), packages: new Map() }
  for (let [index, outcome] of outcomes.entries()) {
    let file = files[index]!
    let modules = listLoadedFiles(outcome.records)
    state.modules.set(file, modules)
    let report = buildDryFile(outcome, { root: context.root, file })
    state.expected.set(file, report.expected)
    state.todo.set(
      file,
      outcome.records.some(record => record.kind === 'todo'),
    )
    if (request.files === null && !report.hung && !relates(modules)) {
      continue
    }
    collectSwitchRecords(outcome.records, switched, found)
    report.entry.dependencies = collectNodeDependencies({
      records: outcome.records,
      preload: handle.preload,
      tsx: handle.tsx,
      cache,
      file,
    })
    result.files.push(report.entry)
    result.tests.push(...report.tests)
    if (report.hung !== null) {
      result.hung.push({ ...report.hung, file })
    }
  }
  let { mismatched, required, served } = found
  result.files.sort((left, right) => compareCodeUnits(left.file, right.file))
  result.tests = result.tests.toSorted((left, right) =>
    compareCodeUnits(left.file, right.file),
  )
  result.served = [...served].toSorted(compareCodeUnits)
  result.mismatched = [...mismatched].toSorted(compareCodeUnits)
  result.unserved = [...required]
    .filter(file => !served.has(file) && !mismatched.has(file))
    .toSorted(compareCodeUnits)
    .map(file => ({ reason: REQUIRED_ESM, file }))
  return result
}

/**
 * Collects the switched files the records of a test process name: those it
 * served, those whose loaded text differed from the original and, when its
 * module hooks run in a thread of their own, those in its `require` cache at
 * the exit.
 *
 * @param records - Records of the process.
 * @param switched - Absolute paths of the switched files.
 * @param found - Receives the paths, each kind in its own set.
 * @param found.mismatched - Switched files whose loaded text differed from the
 *   original.
 * @param found.required - Switched files in the `require` cache of a process
 *   whose module hooks run in a thread of their own.
 * @param found.served - Switched files whose switched text ran.
 */
function collectSwitchRecords(
  records: readonly NodeTestRecord[],
  switched: ReadonlySet<string>,
  found: {
    mismatched: Set<string>
    required: Set<string>
    served: Set<string>
  },
): void {
  let async = records.some(
    record => record.kind === 'start' && record.hooks === 'async',
  )
  for (let record of records) {
    if (record.kind === 'served') {
      found.served.add(record.file)
    } else if (record.kind === 'mismatched') {
      found.mismatched.add(record.file)
    } else if (async && record.kind === 'end') {
      for (let module of record.required) {
        if (switched.has(module)) {
          found.required.add(module)
        }
      }
    }
  }
}

/**
 * Writes the switch plan of a dry run: with instrumentation, checks the
 * switched files (`NodeTestHandle.checkTypeScript`) and writes them from the
 * context into the session's switch plan (`NodeTestState.plan`); without it, a
 * plan that switches nothing, which the session does not keep.
 *
 * @param handle - Live session.
 * @param instrumented - Whether the run serves switched texts.
 * @returns Absolute path of the plan's `plan.json`.
 * @throws {Error} When mootant cannot switch a switched TypeScript file
 *   (`checkTypeScript`).
 */
function writeDryPlan(handle: NodeTestHandle, instrumented: boolean): string {
  let { context, state } = handle
  if (!instrumented) {
    return writeSwitchPlan(path.join(context.workDirectory, 'plain'), [])
  }
  let problem = handle.checkTypeScript(context.files.map(entry => entry.file))
  if (problem !== null) {
    throw new Error(problem)
  }
  let plan = writeSwitchPlan(
    path.join(context.workDirectory, 'switched'),
    context.files,
  )
  state.plan = plan
  return plan
}
