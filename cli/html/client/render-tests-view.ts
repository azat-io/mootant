import type { HtmlReportTest } from '../../../types/report/html-report'
import type { TestsFilter } from '../../../types/html/tests-filter'
import type { ReportIndex } from '../../../types/html/report-index'

import { getTableLayout } from './get-table-layout'
import { renderTestName } from './render-test-name'
import { getTestGroups } from './get-test-groups'
import { measureColumn } from './measure-column'
import { escapeHtml } from './escape-html'
import { formatTime } from './format-time'
import { html } from './html'

/**
 * Groups of tests the page can show.
 */
type TestFilter = TestsFilter['group']

/**
 * Most characters the file column makes room for; a longer place wraps.
 */
const MAX_FILE = 40

/**
 * Fewest characters the name column keeps.
 */
const MIN_NAME = 32

/**
 * Groups in the order of the filter.
 */
const ORDER: TestFilter[] = ['all', 'survivors', 'none', 'slowest']

/**
 * Labels of the groups.
 */
const LABELS: Record<TestFilter, string> = {
  survivors: 'Reach survivors',
  none: 'Reach no mutant',
  slowest: 'Slowest',
  all: 'All',
}

/**
 * Renders the page of the tests of the dry run: a filter for every test, the
 * tests that reach survivors, the ones that reach no mutant and the slowest
 * ones, and the table of the group with each test's file, time, how many
 * mutants it reaches, kills first and reaches as survivors. Tests are listed by
 * survivors, then by mutants reached; the slowest by time. The columns take the
 * widths of every test, so a group does not move them. Past the limit a button
 * shows more; the test the search opened is marked.
 *
 * @param index - Index of the report.
 * @param shown - Group, number of rows and the test to mark.
 * @returns HTML of the page.
 */
export function renderTestsView(
  index: ReportIndex,
  shown: TestsFilter,
): string {
  let { group: filter, target, limit } = shown
  let { testFiles, tests } = index.report
  let positions = new Map(tests.map((test, position) => [test, position]))
  let groups = getTestGroups(tests)
  let buttons = ORDER.map(
    key =>
      html`<button
        class="segment-button"
        type="button"
        data-tests-filter="${key}"
        aria-pressed="${filter === key}"
      >
        ${LABELS[key]} <span class="count">${groups[key].length}</span>
      </button>`,
  ).join('')
  let widths = [
    null,
    measureColumn(
      tests.map(test => describePlace(test, testFiles)),
      'File',
      MAX_FILE,
    ),
    measureColumn(
      tests.map(test => formatTime(test.duration)),
      'Time',
    ),
    measureColumn(
      tests.map(test => String(test.reach)),
      'Reaches',
    ),
    measureColumn(
      tests.map(test => String(test.kills)),
      'Kills',
    ),
    measureColumn(
      tests.map(test => String(test.survivors)),
      'Survivors',
    ),
  ]
  let layout = getTableLayout(widths, MIN_NAME)
  let list = groups[filter]
  let count = Math.min(limit, list.length)
  let rows = list
    .slice(0, count)
    .map(
      test =>
        html`<tr
          id="test-${positions.get(test)}"
          ${positions.get(test) === target ? ' class="is-target"' : ''}
        >
          <th
            scope="row"
            class="text-cell"
          >
            ${renderTestName(test.name)}
          </th>
          <td class="left dim path-cell">
            ${escapeHtml(describePlace(test, testFiles))}
          </td>
          <td class="dim">${escapeHtml(formatTime(test.duration))}</td>
          <td>
            ${test.reach === 0 ? '<span class="zero">–</span>' : test.reach}
          </td>
          <td>
            ${test.kills === 0 ? '<span class="zero">–</span>' : test.kills}
          </td>
          <td>
            ${test.survivors === 0 ? '<span class="zero">–</span>' : html`<span class="verdict hot">${test.survivors}</span>`}
          </td>
        </tr>`,
    )
    .join('')
  let body =
    rows === '' ?
      '<p class="empty">No test in this group.</p>'
    : html`<table
        class="table fixed"
        style="${layout.style}"
      >
        ${layout.colgroup}
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th
              scope="col"
              class="left"
            >
              File
            </th>
            <th scope="col">Time</th>
            <th scope="col">Reaches</th>
            <th scope="col">Kills</th>
            <th scope="col">Survivors</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>`
  return html`<div class="page container">
    <div class="section-head">
      <div>
        <h1 class="title">Tests</h1>
        <p class="lead">
          What each test of the dry run reaches. A test that reaches survivors
          runs the changed code and still passes: its assertions are the ones to
          sharpen.
        </p>
      </div>
      <div
        class="segmented"
        role="group"
        aria-label="Show"
      >
        ${buttons}
      </div>
    </div>
    <div class="card table-wrap">
      ${body}${
        list.length > count ?
          html`<p class="table-note">
            <button
              class="text-button"
              type="button"
              data-tests-more
            >
              Show more · ${list.length - count} left
            </button>
          </p>`
        : ''
      }
      <p class="table-note">
        A kill counts for the first test that failed: each mutant stops at its
        first failure, so other tests may catch it too.
      </p>
    </div>
  </div>`
}

/**
 * Names the place of a test: its file and its line.
 *
 * @param test - Test of the dry run.
 * @param testFiles - Paths of the test files.
 * @returns Text such as `test/cart.test.ts:12`.
 */
function describePlace(
  test: HtmlReportTest,
  testFiles: readonly string[],
): string {
  return `${testFiles[test.file]!}${test.line === null ? '' : `:${test.line}`}`
}
