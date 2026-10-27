import type { RunReportSummary, RunReport } from './run-report'
import type { ListReportMutator } from './list-report-mutator'
import type { IsolatedReason } from '../run/isolated-reason'
import type { IgnoreSource } from '../mutant/ignore-source'
import type { SkipCategory } from '../mutant/skip-category'
import type { Diagnostic } from '../mutant/diagnostic'
import type { RunStatus } from '../run/run-status'
import type { TryCause } from '../run/try-cause'

/**
 * Mutant of an HTML report: the fields of a run report mutant
 * (`RunReportMutant`) that the source does not give, with files, tests, test
 * files, mutators and texts named by index. Fields that are null or false in
 * the run report are left out.
 */
export interface HtmlReportMutant {
  /**
   * Part of the range the change amounts to, as offsets and the text written in
   * its place, when the mutator names one.
   */
  focus?: { replacement: string; start: number; end: number }

  /**
   * Test files to extend with a test that kills the mutant, the likeliest
   * first, as indexes with their numbers of covering tests; absent for a mutant
   * killed or timed out.
   */
  testFiles?: [file: number, tests: number][]

  /**
   * Lengths of the start and the end of the original that the replacement
   * keeps, when storing only the text between them is shorter.
   */
  keep?: [start: number, end: number]

  /**
   * Why it ran isolated in fast mode, or `static`.
   */
  isolatedBecause?: IsolatedReason

  /**
   * How its verdict was reached; absent when no run decided it.
   */
  path?: 'isolated' | 'batch'

  /**
   * Ignore directive comment that excluded the mutant.
   */
  ignoredBy?: IgnoreSource

  /**
   * Indexes of the tests that reach it; absent for a mutant killed or timed
   * out.
   */
  coveredBy?: number[]

  /**
   * Text written in place of the range, or with `keep` only the part between
   * the kept start and end.
   */
  replacement: string

  /**
   * Index of the test that failed on the mutant.
   */
  killedBy?: number

  /**
   * Index of the test file of the verdict when it is not the file of
   * `killedBy`.
   */
  killedIn?: number

  /**
   * Final state.
   */
  status: RunStatus

  /**
   * Index of the text of the first line of the failure or of the reason of
   * `Error`.
   */
  message?: number

  /**
   * How it was detected.
   */
  cause?: TryCause

  /**
   * Milliseconds spent on it, rounded.
   */
  duration: number

  /**
   * Index of the text of the reason of the ignore directive.
   */
  reason?: number

  /**
   * Index of its mutator.
   */
  mutator: number

  /**
   * Number of the tests that reach a mutant killed or timed out.
   */
  reach?: number

  /**
   * Index of the text of the dotted names of the declarations around it.
   */
  scope?: number

  /**
   * `block` for a mutant that replaces a block; absent for an expression.
   */
  kind?: 'block'

  /**
   * Whether the verdict came from the cache.
   */
  cached?: true

  /**
   * UTF-16 offset of the first replaced code unit.
   */
  start: number

  /**
   * Index of its file.
   */
  file: number

  /**
   * UTF-16 offset just past the last replaced code unit.
   */
  end: number

  /**
   * Stable id of the mutant.
   */
  id: string
}

/**
 * Skipped candidate of an HTML report, named by the index of its file, mutator
 * and reason.
 */
export interface HtmlReportSkipped {
  /**
   * Mutant that justifies the skip: its mutator, which may be turned off and
   * then is not in the mutators of the report, its position and its id when it
   * is listed.
   */
  by?: { id: string | null; mutator: string; column: number; line: number }

  /**
   * Part of the range the change amounts to, as offsets and the text written in
   * its place, when the mutator names one.
   */
  focus?: { replacement: string; start: number; end: number }

  /**
   * Lengths of the start and the end of the original that the replacement
   * keeps, when storing only the text between them is shorter.
   */
  keep?: [start: number, end: number]

  /**
   * Category of the skip.
   */
  category: SkipCategory

  /**
   * Text that would have been written in place of the range, or with `keep`
   * only the part between the kept start and end.
   */
  replacement: string

  /**
   * Whether the skip rests on a guess rather than on a proof.
   */
  heuristic?: true

  /**
   * Index of its mutator.
   */
  mutator: number

  /**
   * Index of the text of the plain-English reason of the skip.
   */
  reason: number

  /**
   * UTF-16 offset of the first replaced code unit.
   */
  start: number

  /**
   * Id of the skip rule, such as `O3` or `lower-bound`.
   */
  rule: string

  /**
   * Index of its file.
   */
  file: number

  /**
   * UTF-16 offset just past the last replaced code unit.
   */
  end: number
}

/**
 * Data of the HTML report: the full run report (`RunReport` with every mutant
 * and the skipped candidates) packed into one file, which `unpackRunReport`
 * restores, plus what only the HTML report shows: the source of every mutated
 * file and the tests of the dry run. Files, test files, tests, mutators and
 * repeated texts are stored once and named by their index; what the source
 * gives, such as positions and the original text, is left out.
 */
export interface HtmlReport {
  /**
   * Mutators the preset turned on, as the run report lists them.
   */
  mutators: ListReportMutator[]

  /**
   * Candidates that were considered and not emitted, in canonical order per
   * file.
   */
  skipped: HtmlReportSkipped[]

  /**
   * Mutants of the mutated files, in file and canonical order.
   */
  mutants: HtmlReportMutant[]

  /**
   * Counts, scores and durations of the run report.
   */
  summary: RunReportSummary

  /**
   * Problems found while listing or running.
   */
  diagnostics: Diagnostic[]

  /**
   * Tests of the dry run, in its order.
   */
  tests: HtmlReportTest[]

  /**
   * Mutated files with their text.
   */
  files: HtmlReportFile[]

  /**
   * Run, project and command the report is about.
   */
  meta: HtmlReportMeta

  /**
   * Paths of the test files, relative to the project root.
   */
  testFiles: string[]

  /**
   * Messages, scopes and reasons, each once.
   */
  texts: string[]
}

/**
 * Run, project and command of an HTML report.
 */
export interface HtmlReportMeta extends Pick<
  RunReport,
  'runnerVersion' | 'runner' | 'preset' | 'since' | 'mode'
> {
  /**
   * Characters ids are cut to: the shortest that tells apart every listed
   * mutant.
   */
  idLength: number

  /**
   * Name of the project: the name of its `package.json`, else the name of its
   * directory.
   */
  project: string

  /**
   * Command line before `--mutant` that runs one mutant again, such as `mootant
   * run src`.
   */
  recheck: string

  /**
   * Command line of the run, which runs it again.
   */
  command: string

  /**
   * Version of mootant.
   */
  version: string

  /**
   * Whether verdicts were reused from and saved to the cache.
   */
  cache: boolean

  /**
   * Time the report was written, as an ISO string.
   */
  date: string
}

/**
 * Test of the dry run with what the mutants say about it.
 */
export interface HtmlReportTest {
  /**
   * 1-based line of the test, or null.
   */
  line: number | null

  /**
   * Survived mutants it reached.
   */
  survivors: number

  /**
   * Milliseconds of its slower dry try, rounded to a tenth.
   */
  duration: number

  /**
   * Mutants whose kill it is: it was the first test to fail on them.
   */
  kills: number

  /**
   * Mutants it reached.
   */
  reach: number

  /**
   * Full name, suites joined by `>`.
   */
  name: string

  /**
   * Index of its test file.
   */
  file: number
}

/**
 * Mutated file of an HTML report.
 */
export interface HtmlReportFile {
  /**
   * Text of the file as read, or null when it could not be read.
   */
  source: string | null

  /**
   * Whether the file parsed.
   */
  parsed: boolean

  /**
   * Path relative to the project root, with `/` separators.
   */
  file: string
}
