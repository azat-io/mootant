import type { ReportIndex } from '../../../types/html/report-index'
import type { RunStatus } from '../../../types/run/run-status'

import { renderSkippedSummary } from './render-skipped-summary'
import { pluralize } from '../../../core/text/pluralize'
import { renderFilesTable } from './render-files-table'
import { renderStatusBar } from './render-status-bar'
import { renderAttention } from './render-attention'
import { renderSpotlight } from './render-spotlight'
import { describeStatus } from './describe-status'
import { renderCommand } from './render-command'
import { formatScore } from './format-score'
import { escapeHtml } from './escape-html'
import { formatDate } from './format-date'
import { formatTime } from './format-time'
import { html } from './html'

/**
 * Statuses of the legend, in the order of the bar.
 */
const LEGEND: RunStatus[] = [
  'Killed',
  'Timeout',
  'Survived',
  'NoCoverage',
  'Error',
  'Ignored',
]

/**
 * Renders the overview: the score with how many scored mutants were detected,
 * the threshold check of the score, what else failed the run, the covered score
 * when it differs, the weakest mutators and the files with the most test time;
 * the card of the run with the bar and legend of the statuses and the facts of
 * the run with its phases; the mutants to act on with a filter and the command
 * to run again; the table of files; the summary of the skipped candidates; and
 * the warnings.
 *
 * @param index - Index of the report.
 * @returns HTML of the page.
 */
export function renderOverview(index: ReportIndex): string {
  let { diagnostics, summary, meta } = index.report
  let { counts } = index
  let detected = counts.Killed + counts.Timeout
  let scored = detected + counts.Survived + counts.NoCoverage
  let { duration } = summary
  let phases: [string, number][] = [
    ['start', duration.startup],
    ['dry run', duration.dryRun],
    ...(duration.batch === null ?
      []
    : [['batch', duration.batch] as [string, number]]),
    ['isolated', duration.isolated],
  ]
  let phaseText = escapeHtml(
    phases.map(([name, time]) => `${name} ${formatTime(time)}`).join(' · '),
  )
  let met =
    summary.score === null ||
    summary.threshold === null ||
    summary.score >= summary.threshold
  let threshold =
    summary.threshold === null ?
      ''
    : html`<span class="pill ${met ? 'pass' : 'fail'}"
        >${met ? '✓' : '✕'} threshold ${summary.threshold}% ·
        ${met ? 'passed' : 'failed'}</span
      >`
  let reasons = [
    summary.totalErrors > 0 ? pluralize(summary.totalErrors, 'error') : '',
    summary.totalErrorMutants > 0 ?
      `${pluralize(summary.totalErrorMutants, 'mutant')} without a verdict`
    : '',
  ].filter(Boolean)
  let failed =
    reasons.length === 0 ?
      ''
    : html`<span class="pill fail">✕ run failed · ${reasons.join(', ')}</span>`
  let covered =
    summary.coveredScore === summary.score ?
      ''
    : ` · covered ${formatScore(summary.coveredScore)}`
  let facts = [
    [
      'runner',
      meta.runnerVersion === null ?
        meta.runner
      : `${meta.runner} ${meta.runnerVersion}`,
    ],
    ['tests', String(summary.totalTests)],
    ['mode', meta.mode],
    ['preset', meta.preset],
    ['cache', meta.cache ? `on, ${summary.totalCached ?? 0} reused` : 'off'],
    ['time', formatTime(duration.total)],
    ['run', formatDate(meta.date)],
  ]
  let filters = (
    [
      ['all', 'All', index.actionable.length],
      ['Survived', 'Survived', counts.Survived],
      ['NoCoverage', 'No coverage', counts.NoCoverage],
      ['Error', 'Errors', counts.Error],
    ] as [RunStatus | 'all', string, number][]
  ).filter(([key, , count]) => key === 'all' || count > 0)
  let attention =
    index.actionable.length === 0 ?
      ''
    : html`<section
        class="section"
        aria-labelledby="attention-title"
      >
        <div class="section-head">
          <div>
            <h2
              class="title"
              id="attention-title"
            >
              Look at these first
            </h2>
            <p class="lead">${describeActionable(index)}</p>
          </div>
          <div
            class="segmented"
            role="group"
            aria-label="Show"
          >
            ${filters
              .map(
                ([key, label, count], position) =>
                  html`<button
                    class="segment-button"
                    type="button"
                    data-attention="${key}"
                    aria-pressed="${position === 0}"
                  >
                    ${key === 'all' ? '' : html`<span class="dot status-${describeStatus(key).key}"></span>`}${label}
                    <span class="count">${count}</span>
                  </button>`,
              )
              .join('')}
          </div>
        </div>
        <div
          class="card groups"
          id="attention"
        >
          ${renderAttention(index, 'all')}
        </div>
        <div class="command-note">
          <span
            >After adding tests, run again: cached verdicts are reused, so only
            mutants whose code or tests changed run.</span
          >${renderCommand(meta.command)}
        </div>
      </section>`
  return html`<div class="page container">
    <section
      class="section summary"
      aria-label="Score"
    >
      <div class="score">
        <span class="label">Mutation score</span>
        <span class="score-value"
          >${summary.score === null ? '–' : `${formatScore(summary.score).replace('%', '')}<span class="score-unit">%</span>`}</span
        >
        <span class="score-note"
          >${detected} of ${scored} detected${covered}</span
        >
        ${threshold}${failed} ${renderSpotlight(index)}
      </div>
      <div class="card totals">
        <div class="totals-head">
          <h2 class="totals-title">
            ${pluralize(summary.totalMutants, 'mutant')} in
            ${pluralize(summary.totalFiles, 'file')}
          </h2>
          ${
            index.report.skipped.length > 0 ?
              html`<a
                class="aside"
                href="#skipped"
                data-jump
                >${index.report.skipped.length} more left out on purpose</a
              >`
            : ''
          }
        </div>
        ${renderStatusBar(counts)}
        <ul class="legend">
          ${LEGEND.map(status => {
            let { label, key } = describeStatus(status)
            return html`<li
              class="legend-item legend-${key}${counts[status] === 0 ? ' is-zero' : ''}"
            >
              <span class="swatch segment status-${key}"></span>${label}
              <strong class="legend-count">${counts[status]}</strong>
            </li>`
          }).join('')}
        </ul>
        <dl class="facts">
          ${facts
            .map(
              ([term, value]) =>
                html`<div>
                  <dt>${term}</dt>
                  <dd>${escapeHtml(value!)}</dd>
                </div>`,
            )
            .join('')}
        </dl>
        <div class="timing">
          <div
            class="phases"
            role="img"
            aria-label="${phaseText}"
          >
            ${phases
              .map(
                ([name, time]) =>
                  html`<span
                    style="flex-basis: ${(time / Math.max(duration.total, 1)) * 100}%"
                    title="${name} ${escapeHtml(formatTime(time))}"
                  ></span>`,
              )
              .join('')}
          </div>
          <p class="phase-text">${phaseText}</p>
        </div>
      </div>
    </section>
    ${attention}
    <section
      class="section"
      aria-labelledby="files-title"
    >
      <div class="section-head">
        <div>
          <h2
            class="title"
            id="files-title"
          >
            Files
          </h2>
          <p class="lead">
            Lowest score first. Timeouts count as detected; errors and ignored
            mutants stay out of the score. Test time is what the isolated runs
            of a file's mutants took.
          </p>
        </div>
        <span class="aside"
          >${pluralize(index.files.length, 'file')} ·
          ${pluralize(index.mutants.length, 'mutant')}</span
        >
      </div>
      <div class="card table-wrap">${renderFilesTable(index)}</div>
    </section>
    ${renderSkippedSummary(index)}
    ${
      diagnostics.length === 0 ?
        ''
      : html`<section
          class="section"
          aria-labelledby="warnings-title"
        >
          <div class="section-head">
            <div>
              <h2
                class="title"
                id="warnings-title"
              >
                Warnings
              </h2>
            </div>
          </div>
          <ul class="card diagnostics">
            ${diagnostics.map(diagnostic => html`<li class="diagnostic"><span class="code-name ${diagnostic.severity}">${escapeHtml(diagnostic.code)}</span> ${escapeHtml(diagnostic.file === null ? '' : `${diagnostic.file}${diagnostic.line === null ? '' : `:${diagnostic.line}`} `)}${escapeHtml(diagnostic.message)}</li>`).join('')}
          </ul>
        </section>`
    }
  </div>`
}

/**
 * Describes the mutants to act on in a sentence each.
 *
 * @param index - Index of the report.
 * @returns Sentences about survivors, uncovered mutants and errors.
 */
function describeActionable(index: ReportIndex): string {
  let {
    NoCoverage: uncovered,
    Survived: survived,
    Error: errors,
  } = index.counts
  let sentences = [
    survived > 0 ?
      `${pluralize(survived, 'mutant')} survived: every test that reached ${survived === 1 ? 'it' : 'them'} passed with the change in place.`
    : '',
    uncovered > 0 ?
      `${pluralize(uncovered, 'mutant')} ${uncovered === 1 ? 'sits' : 'sit'} in code no test reaches.`
    : '',
    errors > 0 ? `${pluralize(errors, 'mutant')} got no verdict.` : '',
  ]
  return sentences.filter(Boolean).join(' ')
}
