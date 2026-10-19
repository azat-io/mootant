import type { TimeEstimator } from './create-time-estimator'
import type { TextStyle } from '../types/cli/text-style'
import type { LinePart } from '../types/cli/line-part'
import type { RunEvent } from '../types/run/run-event'

import { isInteractiveTerminal } from './terminal/is-interactive-terminal'
import { getDisplayWidth } from './terminal/get-display-width'
import { createTimeEstimator } from './create-time-estimator'
import { formatTimeLeft } from './report/format-time-left'
import { formatDuration } from './report/format-duration'
import { createSpinner } from './terminal/create-spinner'
import { measureParts } from './terminal/measure-parts'
import { cutToWidth } from './terminal/cut-to-width'
import { getSymbols } from './terminal/get-symbols'
import { fitParts } from './terminal/fit-parts'
import { pluralize } from './report/pluralize'

/**
 * Live progress of a mutation run on standard error.
 */
export interface RunProgress {
  /**
   * Takes the next event of the run.
   *
   * @param event - Event from `runMutants`.
   */
  handle(event: RunEvent): void

  /**
   * What the tests wrote and was not printed, grouped by test file under its
   * path in bold, output without a known test file last: after tests failed
   * without mutants, only what the last dry run of their test files wrote. Each
   * test file keeps its last 100 000 characters at most.
   *
   * @returns The output, or an empty text.
   */
  output(): string

  /**
   * Ends the progress: erases the spinner, or outside an interactive terminal
   * prints the line of the phase that was running. Safe to call twice.
   */
  finish(): void
}

/**
 * Phase of the run the progress shows.
 */
interface Phase {
  /**
   * Estimate of the time left in a run of the test runner, or null.
   */
  estimator: TimeEstimator | null

  /**
   * Units of the phase, or null when unknown.
   */
  total: number | null

  /**
   * Whether the short name tells the round, so the line with it needs no mark
   * of the round on the time left.
   */
  rounded: boolean

  /**
   * When the phase started, in milliseconds of `performance.now()`.
   */
  started: number

  /**
   * Name of the phase.
   */
  label: string

  /**
   * Shorter name of the phase for a narrow terminal.
   */
  short: string

  /**
   * Units finished so far.
   */
  done: number
}

/**
 * Most characters of test output kept per test file for a failed run.
 */
const OUTPUT_LIMIT = 100_000

/**
 * Columns the animation and the space after it take.
 */
const ANIMATION_WIDTH = 2

/**
 * Text between two parts of the line of a phase.
 */
const SEPARATOR = ' · '

/**
 * Highest rank of the parts that choose the form of the line: runs, survivors,
 * the time left and kills; parts that come and go, such as errors, never change
 * the form.
 */
const CORE_RANK = 4

/**
 * Widest time left below ten minutes, which the time left is measured with.
 */
const WIDEST_LEFT = '~9m 50s'

/**
 * Creates the live progress of a run. In an interactive terminal a spinner
 * shows the phase that runs, such as `testing 569 mutants 312/569 test runs ·
 * killed 120 · survived 14 · 41.0s · ~1m 10s left in round`: the runs of one
 * test file the phase planned, the mutants decided so far, with timeouts and
 * errors once there are some, the time of the phase and the time left in it
 * (`createTimeEstimator`), marked as covering only this round. A line wider
 * than the terminal leaves out the words `test runs` first, then takes the
 * short name of the phase, such as `569 mutants` or `round 2: 14 survivors`,
 * with a shorter mark of the round; then it leaves out the elapsed time,
 * timeouts, errors, kills, the time left, survivors and the runs, and cuts the
 * name of the phase last, so it never wraps. Room is kept for the widest counts
 * and time left of the phase, so the parts stay put as the numbers grow.
 * Elsewhere nothing animates: each phase prints one line when it ends. Notes
 * and the reasons of repeated dry runs are printed as they come. What the tests
 * write is printed as it comes when `verbose`, otherwise kept, so a failed run
 * can show it.
 *
 * @param style - Colors and symbols of standard error.
 * @param verbose - Whether to print what the tests write.
 * @returns Progress to feed with the events of the run.
 */
export function createRunProgress(
  style: TextStyle,
  verbose: boolean,
): RunProgress {
  let { colors } = style
  let { ellipsis, check } = getSymbols(style.unicode)
  let interactive = isInteractiveTerminal()
  let phase: Phase = {
    started: performance.now(),
    label: 'preparing',
    short: 'preparing',
    estimator: null,
    rounded: false,
    total: null,
    done: 0,
  }
  let verdicts: Omit<Extract<RunEvent, { kind: 'verdicts' }>, 'kind'> | null =
    null
  let mutants = 0
  let outputs = new Map<string | null, string>()
  let failedFiles: string[] | null = null
  let finished = false
  let spinner = createSpinner(() => describePhase(phase), colors).start()

  /**
   * Describes the running phase for the spinner, fit to the terminal: the first
   * of the forms of the line whose name, runs, counts and time left fit, from
   * the full one through one without the words `test runs`, one with the short
   * name of the phase and one with the short time left; when none fits, the
   * short form leaves parts out (`fitParts`), then the name is cut. Counts and
   * times are measured at their widest for the phase, so the parts on the line
   * stay the same while the numbers grow.
   *
   * @param current - Running phase.
   * @returns Text next to the animation.
   */
  function describePhase(current: Phase): string {
    let now = performance.now()
    let columns =
      process.stderr.columns > 0 ? process.stderr.columns : style.width
    let width = columns - ANIMATION_WIDTH
    let forms = [
      { label: current.label, compact: false, words: true },
      { label: current.label, compact: false, words: false },
      { label: current.short, compact: true, words: false },
    ]
    let form =
      forms.find(
        ({ label, ...shape }) =>
          getDisplayWidth(label) +
            2 +
            measureParts(
              describeParts(current, now, shape).filter(
                part => part.rank <= CORE_RANK,
              ),
              SEPARATOR,
            ) <=
          width,
      ) ?? forms.at(-1)!
    let label = cutToWidth(form.label, { ellipsis, width })
    let text = fitParts(
      describeParts(current, now, form),
      SEPARATOR,
      width - getDisplayWidth(label) - 2,
    )
    return text === '' ? label : `${label}  ${text}`
  }

  /**
   * Lists the parts of the line of a phase in the order they are shown, with
   * the ranks in which they are left out of a narrow line (`fitParts`) and room
   * for their widest numbers.
   *
   * @param current - Running phase.
   * @param now - Current time.
   * @param shape - How the parts are worded.
   * @param shape.words - Whether to count test runs with the words.
   * @param shape.compact - Whether to mark the time left of a round briefly.
   * @returns Parts of the line.
   */
  function describeParts(
    current: Phase,
    now: number,
    shape: { compact: boolean; words: boolean },
  ): LinePart[] {
    let parts: LinePart[] = []
    let words = shape.words ? ' test runs' : ''
    if (current.total !== null) {
      parts.push({
        width: getDisplayWidth(`${current.total}/${current.total}${words}`),
        text: colors.gray(`${current.done}/${current.total}${words}`),
        rank: 1,
      })
      if (verdicts !== null) {
        let { survived, timeout, killed, error } = verdicts
        let digits = String(
          Math.max(mutants, survived + timeout + killed + error),
        ).length
        parts.push(
          {
            text: colors.gray(`killed ${killed}`),
            width: 'killed '.length + digits,
            rank: 4,
          },
          {
            text: `${colors.gray('survived')} ${survived > 0 ? colors.greenBright(survived) : colors.gray('0')}`,
            width: 'survived '.length + digits,
            rank: 2,
          },
        )
        if (timeout > 0) {
          parts.push({
            text: colors.gray(`timeout ${timeout}`),
            width: 'timeout '.length + digits,
            rank: 6,
          })
        }
        if (error > 0) {
          parts.push({
            text: `${colors.gray('error')} ${colors.red(error)}`,
            width: 'error '.length + digits,
            rank: 5,
          })
        }
      }
    } else if (current.done > 0) {
      parts.push({
        text: colors.gray(pluralize(current.done, 'test file')),
        rank: 1,
      })
    }
    parts.push({
      text: colors.gray(formatDuration(now - current.started)),
      rank: 7,
    })
    if (current.estimator !== null) {
      let left = current.estimator.left(now)
      parts.push({
        text:
          left === null ? '' : (
            colors.gray(describeLeft(formatTimeLeft(left), current, shape))
          ),
        width: getDisplayWidth(describeLeft(WIDEST_LEFT, current, shape)),
        rank: 3,
      })
    }
    return parts
  }

  /**
   * Starts a phase; outside an interactive terminal, first prints the line of
   * the phase that ends, if it counted units.
   *
   * @param names - Name of the new phase and its short form.
   * @param names.label - Name of the new phase.
   * @param names.short - Shorter name for a narrow terminal.
   * @param names.rounded - Whether the short name tells the round.
   * @param plan - Start of the run of the test runner of the phase, or null for
   *   the dry run, whose units are unknown.
   */
  function startPhase(
    names: { rounded: boolean; label: string; short: string },
    plan: Extract<RunEvent, { kind: 'run-start' }> | null,
  ): void {
    endPhase()
    let started = performance.now()
    phase = {
      estimator: plan === null ? null : createTimeEstimator(plan, started),
      total: plan?.units ?? null,
      done: 0,
      started,
      ...names,
    }
  }

  /**
   * Outside an interactive terminal, prints the line of the running phase when
   * it counts units.
   */
  function endPhase(): void {
    if (!interactive && phase.total !== null) {
      let elapsed = formatDuration(performance.now() - phase.started)
      spinner.print(
        `${colors.green(check)} ${phase.label}  ${colors.gray(`${phase.done}/${phase.total} test runs in ${elapsed}`)}`,
      )
    }
  }

  return {
    handle(event) {
      switch (event.kind) {
        case 'dry-failed':
          failedFiles = event.files
          break
        case 'run-start':
          startPhase(describeRun(event), event)
          break
        case 'dry-start':
          startPhase(
            { label: 'dry run', short: 'dry run', rounded: false },
            null,
          )
          break
        case 'dry-again':
          spinner.print(colors.gray(event.message))
          outputs.clear()
          break
        case 'verdicts':
          verdicts = event
          break
        case 'unit-end':
          phase.done += 1
          phase.estimator?.end(event, performance.now())
          break
        case 'dry-end':
          if (!interactive) {
            spinner.print(
              `${colors.green(check)} dry run  ${colors.gray(`${pluralize(event.tests, 'test')} in ${formatDuration(event.duration)}`)}`,
            )
          }
          phase = {
            started: performance.now(),
            label: 'planning',
            short: 'planning',
            estimator: null,
            rounded: false,
            total: null,
            done: 0,
          }
          break
        case 'mutants':
          mutants = event.total
          phase.label = `preparing ${pluralize(event.total, 'mutant')}`
          phase.short = phase.label
          break
        case 'output':
          if (verbose) {
            spinner.print(event.text.replace(/\n$/u, ''))
          } else {
            outputs.set(
              event.file,
              `${outputs.get(event.file) ?? ''}${event.text}`.slice(
                -OUTPUT_LIMIT,
              ),
            )
          }
          break
        case 'note':
          spinner.print(colors.gray(event.message))
          break
      }
    },
    output() {
      let files =
        failedFiles ??
        [...outputs.keys()]
          .filter(file => file !== null)
          .toSorted((left, right) => left.localeCompare(right))
      return [...files, null]
        .flatMap(file => {
          let text = outputs.get(file)?.replace(/\n$/u, '') ?? ''
          if (text.trim() === '') {
            return []
          }
          return [`${colors.bold(file ?? 'other output')}\n${text}`]
        })
        .join('\n\n')
    },
    finish() {
      if (!finished) {
        finished = true
        endPhase()
        spinner.stop()
      }
    },
  }
}

/**
 * Names a run of the test runner for people, with a shorter name for a narrow
 * terminal.
 *
 * @param event - Start of the run.
 * @returns Name of the phase and its short form.
 */
function describeRun(event: Extract<RunEvent, { kind: 'run-start' }>): {
  rounded: boolean
  label: string
  short: string
} {
  let mutants = pluralize(event.mutants, 'mutant')
  let survivors = pluralize(event.mutants, 'survivor')
  switch (event.run) {
    case 'confirmation':
      return {
        label: `confirming ${pluralize(event.mutants, 'timeout')}`,
        short: `confirming ${event.mutants}`,
        rounded: false,
      }
    case 'isolated':
      return event.round === 1 ?
          { label: `testing ${mutants}`, short: mutants, rounded: false }
        : {
            label: `testing ${survivors} with more test files`,
            short: `round ${event.round}: ${survivors}`,
            rounded: true,
          }
    case 'recovery':
      return {
        label: `recovering ${mutants} of lost batch tries`,
        short: `recovering ${mutants}`,
        rounded: false,
      }
    case 'batch':
      return event.round === 1 ?
          {
            label: `batch testing ${mutants}`,
            short: `batch ${mutants}`,
            rounded: false,
          }
        : {
            label: `batch testing ${survivors} with more tests`,
            short: `batch round ${event.round}: ${survivors}`,
            rounded: true,
          }
  }
}

/**
 * Words the time left of a phase, marked as covering only this round, as later
 * runs may test its mutants again; the compact form marks it briefly, or not at
 * all when the short name of the phase tells the round.
 *
 * @param time - Formatted time left, such as `~1m 10s`.
 * @param phase - Running phase.
 * @param phase.rounded - Whether the short name tells the round.
 * @param shape - How the line is worded.
 * @param shape.compact - Whether the line shows the short name.
 * @returns Text such as `~1m 10s left in round`, `~1m 10s in round` or `~1m 10s
 *   left`.
 */
function describeLeft(
  time: string,
  phase: { rounded: boolean },
  shape: { compact: boolean },
): string {
  if (shape.compact && phase.rounded) {
    return `${time} left`
  }
  return shape.compact ? `${time} in round` : `${time} left in round`
}
