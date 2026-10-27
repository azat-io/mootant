import type { ReportIndex } from '../../../types/html/report-index'

import { getWordmark } from './get-wordmark'
import { escapeHtml } from './escape-html'
import { formatDate } from './format-date'
import { getIcon } from './get-icon'
import { html } from './html'

/**
 * Renders what every page of the report shares, as the docs lay it out: the
 * header with the wordmark, the version, the project and the command, the
 * search button, the button that downloads the report as JSON and the theme
 * toggle; the tabs with their counts; the place of the page; the footer with
 * the keys; and the search dialog.
 *
 * @param index - Index of the report.
 * @returns HTML of the frame, with an empty `main` element.
 */
export function renderFrame(index: ReportIndex): string {
  let { meta } = index.report
  let tabs = [
    { label: 'Overview', route: 'overview', href: '#/' },
    {
      count: index.files.length,
      href: '#/files',
      route: 'files',
      label: 'Files',
    },
    {
      count: index.mutants.length,
      href: '#/mutants',
      route: 'mutants',
      label: 'Mutants',
    },
    {
      count: index.mutators.filter(mutator => mutator.mutants > 0).length,
      href: '#/mutators',
      route: 'mutators',
      label: 'Mutators',
    },
    {
      count: index.report.tests.length,
      href: '#/tests',
      route: 'tests',
      label: 'Tests',
    },
  ]
  return html`<header class="header">
      <div class="bar container">
        <div class="brand">
          <a
            class="home"
            href="#/"
            aria-label="Overview"
            >${getWordmark()}</a
          >
          <span class="badge">v${escapeHtml(meta.version)}</span>
          <span class="project"
            ><span class="project-name">${escapeHtml(meta.project)}</span
            ><span class="project-command"
              >${escapeHtml(meta.command)}</span
            ></span
          >
        </div>
        <div class="tools">
          <button
            class="search-button"
            type="button"
            data-search
            aria-keyshortcuts="/ Control+K Meta+K"
          >
            ${getIcon('search')}<span class="search-label">Search</span
            ><kbd>/</kbd>
          </button>
          <button
            class="icon-button"
            type="button"
            data-download
            aria-label="Download the report as JSON"
            title="Download JSON"
          >
            ${getIcon('download')}
          </button>
          <button
            class="icon-button"
            type="button"
            data-theme-toggle
            aria-label="Toggle theme"
          >
            ${getIcon('sun')}${getIcon('moon')}
          </button>
        </div>
      </div>
      <nav
        class="tabs container"
        aria-label="Report"
      >
        ${tabs
          .map(
            tab =>
              html`<a
                class="tab"
                href="${tab.href}"
                data-tab="${tab.route}"
                >${tab.label}${tab.count === undefined ? '' : ` <span class="count">${tab.count}</span>`}</a
              >`,
          )
          .join('')}
      </nav>
    </header>
    <main id="main"></main>
    <footer class="footer">
      <div class="footer-inner container">
        <span
          >mootant ${escapeHtml(meta.version)} · ${escapeHtml(meta.project)} ·
          ${escapeHtml(formatDate(meta.date))} · one file, opens offline</span
        >
        <span class="keys"
          ><span><kbd>/</kbd> search</span
          ><span><kbd>j</kbd><kbd>k</kbd> next and previous to fix</span
          ><span><kbd>esc</kbd> close</span
          ><a href="https://mootant.org/guide/report"
            >Reading the report ${getIcon('external-link')}</a
          ></span
        >
      </div>
    </footer>
    <dialog
      class="dialog"
      id="search"
      aria-label="Search"
    >
      <div class="field">
        ${getIcon('search')}<input
          type="text"
          placeholder="Mutant id, mutator, code, file or test"
          aria-label="Search"
          aria-controls="search-results"
          autocomplete="off"
          spellcheck="false"
        /><button
          class="copy"
          type="button"
          data-close
          aria-label="Close search"
        >
          ${getIcon('cross')}
        </button>
      </div>
      <div
        class="results"
        id="search-results"
        role="listbox"
        aria-label="Results"
      ></div>
    </dialog>`
}
