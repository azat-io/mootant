import type {
  HtmlReportSkipped,
  HtmlReportMutant,
  HtmlReportTest,
  HtmlReport,
} from '../../types/report/html-report'
import type { RunResult } from '../../types/run/run-result'

import { getDisplayPath } from '../../core/run/get-display-path'
import { buildRunReport } from '../report/build-run-report'
import { packReplacement } from './pack-replacement'

/**
 * What an HTML report holds beyond the result of the run.
 */
interface HtmlReportOptions {
  /**
   * Characters ids are cut to (`getShortIdLength`).
   */
  idLength: number

  /**
   * Command line before `--mutant` that runs mutants of the same paths again,
   * such as `mootant run src`.
   */
  recheck: string

  /**
   * Name of the project.
   */
  project: string

  /**
   * Command line of the run.
   */
  command: string

  /**
   * Version of mootant.
   */
  version: string

  /**
   * Time the report is written, as an ISO string.
   */
  date: string
}

/**
 * Values stored once and named by their index.
 */
interface Table<Value> {
  /**
   * Index of a value, added at the end when it is new.
   */
  add(value: Value): number

  /**
   * Values in the order they were added.
   */
  values: Value[]
}

/**
 * Builds the data of the HTML report: the full run report, every mutant and the
 * skipped candidates the run listed, packed so that each file, test file, test,
 * mutator and repeated text is stored once and named by its index. Each mutated
 * file keeps its source, from which the page takes positions and original
 * texts, and each test of the dry run comes with its slower try time and the
 * mutants it reached, killed first and reached as a survivor. A killed mutant
 * keeps only the number of tests that reach it, and a long replacement only
 * what differs from the original.
 *
 * @param result - Outcome of the run.
 * @param options - Project, command lines, id length, version and time.
 * @returns Data of the report.
 */
export function buildHtmlReport(
  result: RunResult,
  options: HtmlReportOptions,
): HtmlReport {
  let report = buildRunReport(result, {
    recheck: options.recheck,
    skipped: true,
    all: true,
  })
  let files = new Map(result.files.map((file, index) => [file.file, index]))
  let mutators = new Map(
    report.mutators.map((mutator, index) => [mutator.id, index]),
  )
  let texts = createTable<string>()
  let testFiles = createTable<string>()
  let testIndexes = new Map(result.tests.map((test, index) => [test.id, index]))
  let tests = result.tests.map((test): HtmlReportTest => ({
    duration:
      Math.round(Math.max(0, ...test.tries.map(entry => entry.duration)) * 10) /
      10,
    file: testFiles.add(getDisplayPath(test.file, result.root)),
    name: test.name,
    line: test.line,
    survivors: 0,
    kills: 0,
    reach: 0,
  }))
  let verdicts = new Map(result.results.map(entry => [entry.mutant.id, entry]))
  let mutants = report.mutants.map((mutant): HtmlReportMutant => {
    let verdict = verdicts.get(mutant.id)!
    let covering = verdict.coveredBy.map(id => testIndexes.get(id)!)
    for (let index of covering) {
      tests[index]!.reach += 1
      tests[index]!.survivors += Number(mutant.status === 'Survived')
    }
    let killer =
      verdict.killedBy === null ? undefined : testIndexes.get(verdict.killedBy)
    let killerFile = null
    if (killer !== undefined) {
      tests[killer]!.kills += 1
      killerFile = testFiles.values[tests[killer]!.file]
    }
    let decided = mutant.status === 'Killed' || mutant.status === 'Timeout'
    return {
      ...(mutant.testFiles && {
        testFiles: Object.entries(mutant.testFiles).map(
          ([file, count]): [number, number] => [testFiles.add(file), count],
        ),
      }),
      ...(mutant.focus && {
        focus: {
          replacement: mutant.focus.replacement,
          start: mutant.focus.start,
          end: mutant.focus.end,
        },
      }),
      ...(mutant.isolatedBecause && {
        isolatedBecause: mutant.isolatedBecause,
      }),
      ...(mutant.killedIn !== null &&
        mutant.killedIn !== killerFile && {
          killedIn: testFiles.add(mutant.killedIn),
        }),
      ...(decided ? { reach: covering.length } : { coveredBy: covering }),
      ...(mutant.message !== null && { message: texts.add(mutant.message) }),
      ...(mutant.reason !== null && { reason: texts.add(mutant.reason) }),
      ...(mutant.scope !== null && { scope: texts.add(mutant.scope) }),
      ...(mutant.ignoredBy && { ignoredBy: mutant.ignoredBy }),
      ...(killer !== undefined && { killedBy: killer }),
      ...(mutant.cause && { cause: mutant.cause }),
      ...(mutant.path !== null && { path: mutant.path }),
      ...(mutant.kind === 'block' && { kind: 'block' }),
      ...(mutant.cached && { cached: true }),
      mutator: mutators.get(mutant.mutator)!,
      ...packReplacement(mutant.original, mutant.replacement),
      file: files.get(mutant.file)!,
      duration: mutant.duration,
      status: mutant.status,
      start: mutant.start,
      end: mutant.end,
      id: mutant.id,
    }
  })
  let skipped = report.skipped!.map((entry): HtmlReportSkipped => ({
    ...(entry.by && {
      by: {
        mutator: entry.by.mutator,
        column: entry.by.column,
        line: entry.by.line,
        id: entry.by.id,
      },
    }),
    ...(entry.focus && {
      focus: {
        replacement: entry.focus.replacement,
        start: entry.focus.start,
        end: entry.focus.end,
      },
    }),
    ...(entry.heuristic && { heuristic: true }),
    mutator: mutators.get(entry.mutator)!,
    reason: texts.add(entry.reason),
    ...packReplacement(entry.original, entry.replacement),
    file: files.get(entry.file)!,
    category: entry.category,
    start: entry.start,
    rule: entry.rule,
    end: entry.end,
  }))
  return {
    meta: {
      runnerVersion: report.runnerVersion,
      idLength: options.idLength,
      recheck: options.recheck,
      command: options.command,
      project: options.project,
      version: options.version,
      runner: report.runner,
      preset: report.preset,
      since: report.since,
      cache: result.cache,
      date: options.date,
      mode: report.mode,
    },
    files: result.files.map(file => ({
      parsed: file.parsed,
      source: file.source,
      file: file.file,
    })),
    diagnostics: report.diagnostics,
    testFiles: testFiles.values,
    mutators: report.mutators,
    summary: report.summary,
    texts: texts.values,
    mutants,
    skipped,
    tests,
  }
}

/**
 * Creates an empty table of values stored once.
 *
 * @returns Table that names each value by the index it was added at.
 */
function createTable<Value>(): Table<Value> {
  let indexes = new Map<Value, number>()
  let values: Value[] = []
  return {
    add(value) {
      let index = indexes.get(value)
      if (index === undefined) {
        index = values.length
        indexes.set(value, index)
        values.push(value)
      }
      return index
    },
    values,
  }
}
