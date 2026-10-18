import type { TextStyle } from '../types/cli/text-style'
import type { RunEvent } from '../types/run/run-event'

import { isInteractiveTerminal } from './terminal/is-interactive-terminal'
import { formatDuration } from './report/format-duration'
import { createSpinner } from './terminal/create-spinner'
import { getSymbols } from './terminal/get-symbols'
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
   * Units of the phase, or null when unknown.
   */
  total: number | null

  /**
   * When the phase started, in milliseconds of `performance.now()`.
   */
  started: number

  /**
   * Name of the phase.
   */
  label: string

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
 * Units that must finish before the time left is estimated.
 */
const ESTIMATE_UNITS = 3

/**
 * Milliseconds a phase must run before the time left is estimated.
 */
const ESTIMATE_TIME = 2000

/**
 * Creates the live progress of a run. In an interactive terminal a spinner
 * shows the phase that runs, such as `testing 569 mutants 312/569 test runs ·
 * 41.0s · ~1m 05s left`, counting the runs of one test file the phase planned,
 * with the time left estimated from the average run once a few finished.
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
  let { check } = getSymbols(style.unicode)
  let interactive = isInteractiveTerminal()
  let phase: Phase = {
    started: performance.now(),
    label: 'preparing',
    total: null,
    done: 0,
  }
  let outputs = new Map<string | null, string>()
  let failedFiles: string[] | null = null
  let finished = false
  let spinner = createSpinner(() => describePhase(phase), colors).start()

  /**
   * Describes the running phase for the spinner.
   *
   * @param current - Running phase.
   * @returns Text next to the animation.
   */
  function describePhase(current: Phase): string {
    let elapsed = performance.now() - current.started
    let parts = [formatDuration(elapsed)]
    if (current.total !== null) {
      parts.unshift(`${current.done}/${current.total} test runs`)
      if (
        current.done >= ESTIMATE_UNITS &&
        elapsed >= ESTIMATE_TIME &&
        current.done < current.total
      ) {
        let left = (elapsed / current.done) * (current.total - current.done)
        parts.push(`~${formatDuration(left)} left`)
      }
    } else if (current.done > 0) {
      parts.unshift(pluralize(current.done, 'test file'))
    }
    return `${current.label}  ${colors.gray(parts.join(' · '))}`
  }

  /**
   * Starts a phase; outside an interactive terminal, first prints the line of
   * the phase that ends, if it counted units.
   *
   * @param label - Name of the new phase.
   * @param total - Units of the new phase, or null when unknown.
   */
  function startPhase(label: string, total: number | null): void {
    endPhase()
    phase = { started: performance.now(), done: 0, label, total }
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
          startPhase(describeRun(event), event.units)
          break
        case 'dry-start':
          startPhase('dry run', null)
          break
        case 'dry-again':
          spinner.print(colors.gray(event.message))
          outputs.clear()
          break
        case 'unit-end':
          phase.done += 1
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
            total: null,
            done: 0,
          }
          break
        case 'mutants':
          phase.label = `preparing ${pluralize(event.total, 'mutant')}`
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
 * Names a run of the test runner for people.
 *
 * @param event - Start of the run.
 * @returns Name of the phase.
 */
function describeRun(event: Extract<RunEvent, { kind: 'run-start' }>): string {
  let mutants = pluralize(event.mutants, 'mutant')
  switch (event.run) {
    case 'confirmation':
      return `confirming ${pluralize(event.mutants, 'timeout')}`
    case 'isolated':
      return event.round === 1 ?
          `testing ${mutants}`
        : `testing ${pluralize(event.mutants, 'survivor')} with more test files`
    case 'recovery':
      return `recovering ${mutants} of lost batch tries`
    case 'batch':
      return event.round === 1 ?
          `batch testing ${mutants}`
        : `batch testing ${pluralize(event.mutants, 'survivor')} with more tests`
  }
}
