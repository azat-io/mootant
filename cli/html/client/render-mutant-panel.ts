import type { IndexedMutant } from '../../../types/html/indexed-mutant'
import type { ReportIndex } from '../../../types/html/report-index'
import type { RunStatus } from '../../../types/run/run-status'

import { pluralize } from '../../../core/text/pluralize'
import { renderMutantLink } from './render-mutant-link'
import { renderTestName } from './render-test-name'
import { describeStatus } from './describe-status'
import { renderCommand } from './render-command'
import { isOverlapping } from './is-overlapping'
import { renderChange } from './render-change'
import { getFileHref } from './get-file-href'
import { escapeHtml } from './escape-html'
import { renderDiff } from './render-diff'
import { formatTime } from './format-time'
import { getIcon } from './get-icon'
import { html } from './html'

/**
 * Most covering tests the panel lists.
 */
const MAX_TESTS = 40

/**
 * Section of the panel about the verdict, by status.
 */
const DETAILS: Record<
  RunStatus,
  (index: ReportIndex, mutant: IndexedMutant) => string
> = {
  NoCoverage: renderAdvice,
  Survived: renderAdvice,
  Ignored: renderIgnore,
  Timeout: renderKill,
  Error: renderError,
  Killed: renderKill,
}

/**
 * Renders the panel of a mutant: its id, position and status with buttons to
 * the previous and next mutant of the list; its mutator, scope, tests and time;
 * the change as a diff; for a kill the test that failed and its message; for a
 * survivor or a mutant without coverage the test files to extend, the covering
 * test to start from and every covering test; the reason of an error or of an
 * ignore comment; the other mutants and the skipped candidates at the same
 * place; and the command that runs it again with a button that copies an ignore
 * comment.
 *
 * @param index - Index of the report.
 * @param mutant - Mutant to show.
 * @param list - Mutants the buttons step through, in file order.
 * @returns HTML of the panel.
 */
export function renderMutantPanel(
  index: ReportIndex,
  mutant: IndexedMutant,
  list: readonly IndexedMutant[],
): string {
  let { report } = index
  let { texts } = report
  let file = index.files[mutant.file]!
  let mutator = report.mutators[mutant.mutator]!
  let { label, key } = describeStatus(mutant.status)
  let position = list.indexOf(mutant)
  let reach = mutant.coveredBy?.length ?? mutant.reach!
  let reached = pluralize(reach, 'test')
  let testsText =
    {
      Survived: `${reached} reached it, all passed`,
      NoCoverage: 'no test reaches it',
      Ignored: 'not run',
    }[mutant.status as string] ?? `${reached} reach it`
  let flags = [
    mutant.isolatedBecause === 'static' ?
      'static: reached while a test file loads'
    : '',
    mutant.cached ? 'cached verdict' : '',
    mutant.path === 'batch' ? 'batch verdict, may be false' : '',
  ].filter(Boolean)
  let sections = [
    html`<div class="panel-section">
      <div class="panel-head">
        <span class="label">Mutant</span
        ><span class="status status-${key}">${label}</span>
        <div class="nav-buttons">
          <button
            class="icon-button"
            type="button"
            data-step="-1"
            aria-label="Previous mutant"
            ${position <= 0 ? ' disabled' : ''}
          >
            ${getIcon('arrow-left')}</button
          ><button
            class="icon-button"
            type="button"
            data-step="1"
            aria-label="Next mutant"
            ${position === -1 || position === list.length - 1 ? ' disabled' : ''}
          >
            ${getIcon('arrow-right')}</button
          ><button
            class="icon-button panel-close"
            type="button"
            data-close-panel
            aria-label="Close details"
          >
            ${getIcon('cross')}
          </button>
        </div>
      </div>
      <span class="where"
        >line ${mutant.line}:${mutant.column} ·
        ${mutant.id.slice(0, report.meta.idLength)}</span
      >
    </div>`,
    html`<div class="panel-section">
      <dl class="fields">
        <dt>mutator</dt>
        <dd>
          <code>${escapeHtml(mutator.id)}</code><br /><span class="muted"
            >${escapeHtml(mutator.description)}</span
          >
        </dd>
        ${
          mutant.scope === undefined ?
            ''
          : html`<dt>in</dt>
              <dd><code>${escapeHtml(texts[mutant.scope]!)}</code></dd>`
        }
        <dt>tests</dt>
        <dd>${testsText}</dd>
        <dt>time</dt>
        <dd>
          ${escapeHtml(formatTime(mutant.duration))}${flags.map(flag => ` · ${flag}`).join('')}
        </dd>
      </dl>
    </div>`,
    html`<div class="panel-section">
      <span class="label">Change</span>
      <div class="diff">
        <div class="diff-lines">
          ${renderDiff(file.source, file.lineStarts, mutant)}
        </div>
      </div>
    </div>`,
    DETAILS[mutant.status](index, mutant),
  ]
  let near = file.mutants.filter(
    other => other !== mutant && isOverlapping(other, mutant),
  )
  if (near.length > 0) {
    sections.push(
      html`<div class="panel-section">
        <span class="label">Also here</span>
        <ul class="also">
          ${near.map(other => renderMutantLink(index, other)).join('')}
        </ul>
      </div>`,
    )
  }
  let skipped = file.skipped.filter(entry => isOverlapping(entry, mutant))
  if (skipped.length > 0) {
    sections.push(
      html`<div class="panel-section">
        <span class="label">Left out here</span>
        <ul class="also">
          ${skipped
            .map(
              entry =>
                html`<li>
                  <a
                    class="also-link"
                    href="${getFileHref(file.path, entry.line)}"
                    data-skip="${entry.index}"
                    ><span class="dot status-skipped"></span
                    ><span class="grow"
                      ><code
                        >${escapeHtml(report.mutators[entry.mutator]!.id)}</code
                      >
                      ${renderChange(file.source, entry)}</span
                    ><span class="muted">${entry.category}</span></a
                  >
                </li>`,
            )
            .join('')}
        </ul>
      </div>`,
    )
  }
  if (mutant.status !== 'Ignored') {
    let ignore = `// mootant-ignore-next-line ${mutator.id}: `
    sections.push(
      html`<div class="panel-section">
        <span class="label">Run it again</span>
        <div class="actions">
          ${renderCommand(`${report.meta.recheck} --mutant ${mutant.id.slice(0, report.meta.idLength)}`)}<button
            class="text-button"
            type="button"
            data-copy="${escapeHtml(ignore)}"
          >
            ${getIcon('copy')}${getIcon('copy-check')}Copy ignore comment
          </button>
        </div>
      </div>`,
    )
  }
  return html`<div class="card panel-card is-detail">${sections.join('')}</div>`
}

/**
 * Renders where to add a test that kills a survivor or a mutant without
 * coverage: the test files to extend with their covering tests, the covering
 * test to start from, and every covering test.
 *
 * @param index - Index of the report.
 * @param mutant - Survived mutant or one without coverage.
 * @returns HTML of the section.
 */
function renderAdvice(index: ReportIndex, mutant: IndexedMutant): string {
  let { testFiles, tests } = index.report
  let files = mutant.testFiles!
  let covering = mutant.coveredBy!
  let first = covering[0] === undefined ? undefined : tests[covering[0]]
  let filesList =
    files.length === 0 ?
      '<p class="advice">No test file is related to this module yet.</p>'
    : html`<ul class="test-files">
        ${files.map(([testFile, count]) => html`<li><span>${escapeHtml(testFiles[testFile]!)}</span><span class="dim">${count === 0 ? 'related' : pluralize(count, 'test')}</span></li>`).join('')}
      </ul>`
  let start =
    first ?
      html`<p class="advice">
        Start from ${renderTestName(first.name)}
        <span class="test-path"
          >${escapeHtml(testFiles[first.file]!)}${first.line === null ? '' : `:${first.line}`}</span
        >
      </p>`
    : ''
  let all =
    covering.length > 1 ?
      html`<details>
        <summary>
          ${getIcon('chevron-down')} All ${covering.length} tests that reach it
        </summary>
        <ul class="test-list">
          ${covering
            .slice(0, MAX_TESTS)
            .map(
              test =>
                html`<li class="test-item">
                  <span class="dot"></span
                  >${renderTestName(tests[test]!.name)}<span class="where"
                    >passed</span
                  >
                </li>`,
            )
            .join('')}
        </ul>
        ${covering.length > MAX_TESTS ? html`<p class="test-path">and ${covering.length - MAX_TESTS} more</p>` : ''}
      </details>`
    : ''
  return html`<div class="panel-section">
    <span class="label">Where to add a test</span>${filesList}${start}${all}
  </div>`
}

/**
 * Renders the test that killed a mutant or timed out on it, with its message; a
 * verdict without a test names its test file and how it failed.
 *
 * @param index - Index of the report.
 * @param mutant - Killed or timed-out mutant.
 * @returns HTML of the section.
 */
function renderKill(index: ReportIndex, mutant: IndexedMutant): string {
  let { testFiles, tests } = index.report
  let test = mutant.killedBy === undefined ? undefined : tests[mutant.killedBy]
  let where =
    mutant.killedIn === undefined ?
      'A test file'
    : escapeHtml(testFiles[mutant.killedIn]!)
  let killer =
    test ?
      html`<ul class="test-list">
          <li class="test-item is-killer">
            <span class="dot"></span>${renderTestName(test.name)}<span
              class="where"
              >${escapeHtml(formatTime(test.duration))}</span
            >
          </li>
        </ul>
        <p class="test-path">
          ${escapeHtml(testFiles[test.file]!)}${test.line === null ? '' : `:${test.line}`}
        </p>`
    : html`<p class="advice">
        ${where} failed outside its tests
        (${escapeHtml(mutant.cause ?? 'no cause')}).
      </p>`
  return html`<div class="panel-section">
    <span class="label"
      >${mutant.status === 'Timeout' ? 'Timed out in' : 'Killed by'}</span
    >${killer}${renderMessage(index, mutant)}
  </div>`
}

/**
 * Renders the ignore comment that excluded a mutant and its reason.
 *
 * @param index - Index of the report.
 * @param mutant - Ignored mutant.
 * @returns HTML of the section.
 */
function renderIgnore(index: ReportIndex, mutant: IndexedMutant): string {
  let comment =
    mutant.ignoredBy ?
      `${mutant.ignoredBy.directive} on line ${mutant.ignoredBy.line}`
    : 'an ignore comment'
  let reason =
    mutant.reason === undefined ?
      ''
    : `: ${escapeHtml(index.report.texts[mutant.reason]!)}`
  return html`<div class="panel-section">
    <span class="label">Ignored by</span>
    <p class="advice"><code>${escapeHtml(comment)}</code>${reason}</p>
  </div>`
}

/**
 * Renders why a mutant has no verdict.
 *
 * @param index - Index of the report.
 * @param mutant - Mutant with status `Error`.
 * @returns HTML of the section.
 */
function renderError(index: ReportIndex, mutant: IndexedMutant): string {
  return html`<div class="panel-section">
    <span class="label">No verdict</span
    >${renderMessage(index, mutant) || '<p class="advice">See the warnings of the run.</p>'}
  </div>`
}

/**
 * Renders the message of the verdict of a mutant.
 *
 * @param index - Index of the report.
 * @param mutant - Mutant shown.
 * @returns HTML of the first line of the failure, or an empty string.
 */
function renderMessage(index: ReportIndex, mutant: IndexedMutant): string {
  return mutant.message === undefined ?
      ''
    : html`<p class="message">
        ${escapeHtml(index.report.texts[mutant.message]!)}
      </p>`
}
