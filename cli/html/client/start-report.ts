import type { MutantsFilter } from '../../../types/html/mutants-filter'
import type { IndexedMutant } from '../../../types/html/indexed-mutant'
import type { IndexedSkip } from '../../../types/html/indexed-skip'
import type { TestsFilter } from '../../../types/html/tests-filter'
import type { HtmlReport } from '../../../types/report/html-report'
import type { RunStatus } from '../../../types/run/run-status'
import type { FileView } from '../../../types/html/file-view'

import { renderMutatorsView } from './render-mutators-view'
import { renderMutantsTable } from './render-mutants-table'
import { findSearchResults } from './find-search-results'
import { renderMutantsView } from './render-mutants-view'
import { renderFilesView } from './render-files-view'
import { renderTestsView } from './render-tests-view'
import { renderSidePanel } from './render-side-panel'
import { unpackRunReport } from './unpack-run-report'
import { renderAttention } from './render-attention'
import { renderFileCode } from './render-file-code'
import { filterByStatus } from './filter-by-status'
import { renderOverview } from './render-overview'
import { getTestGroups } from './get-test-groups'
import { downloadJson } from './download-json'
import { getFileHref } from './get-file-href'
import { renderFrame } from './render-frame'
import { indexReport } from './index-report'
import { escapeHtml } from './escape-html'
import { parseRoute } from './parse-route'
import { renderTree } from './render-tree'
import { setMarkup } from './set-markup'
import { copyText } from './copy-text'
import { html } from './html'

/**
 * Key the theme chosen with the toggle is stored under.
 */
const THEME_KEY = 'mootant-report-theme'

/**
 * Rows the mutants page adds at a time.
 */
const MUTANTS_PAGE = 200

/**
 * Rows the tests page adds at a time.
 */
const TESTS_PAGE = 300

/**
 * Starts the HTML report in its page: reads the data from the `#report-data`
 * element, renders the frame into `#app`, shows the page the location hash
 * names and keeps it in step with the hash, opens its own links even when they
 * name the current location, and handles the filters, the copy buttons, the
 * theme toggle, the search dialog and the keys: `/` or Ctrl+K and Cmd+K to
 * search, `j` and `k` for the next and previous mutant to act on from the
 * selected mutant or the shown file, Esc to close a mutant or a skipped
 * candidate, which a narrow screen shows in a panel over the bottom of the page
 * with a button to close it.
 *
 * @param document - Page that holds the `#report-data` and `#app` elements.
 */
export function startReport(document: Document): void {
  let window = document.defaultView!
  let report = JSON.parse(
    document.querySelector('#report-data')!.textContent,
  ) as HtmlReport
  let index = indexReport(report)
  setMarkup(document.querySelector('#app')!, renderFrame(index))
  let main = document.querySelector('#main')!
  let dialog = document.querySelector<HTMLDialogElement>('#search')!
  let input = dialog.querySelector('input')!
  let results = dialog.querySelector('#search-results')!
  let ranks = new Map(index.worstFiles.map((file, rank) => [file.index, rank]))
  let page: Parameters<typeof renderPage>[0] | 'files' = 'overview'
  let view: FileView | null = null
  let mutants: MutantsFilter = {
    limit: MUTANTS_PAGE,
    mutator: null,
    filter: 'all',
    query: '',
  }
  let tests: TestsFilter = { limit: TESTS_PAGE, target: null, group: 'all' }

  /**
   * Shows the files page for the current view, or only its code and panel when
   * the page is already shown, so the file list keeps its scroll.
   *
   * @param whole - Whether to render the whole page.
   */
  function showFiles(whole: boolean): void {
    let shown = view!
    let code = document.querySelector('#code')
    if (whole || !code) {
      setMarkup(main, renderFilesView(index, shown))
      return
    }
    setMarkup(code, renderFileCode(index, shown))
    setMarkup(document.querySelector('#panel')!, renderSidePanel(index, shown))
  }

  /**
   * Opens a view of a file, keeping the filter, the switch of the skipped
   * candidates and the file filter of the last one. The filter goes back to
   * every mutant when it hides the selected one or the file has no mutant of
   * its status.
   *
   * @param file - File to show.
   * @param selected - Mutant to select, or null.
   * @returns Whether the whole page must be rendered: the file or the filter
   *   changed.
   */
  function openFile(
    file: FileView['file'],
    selected: IndexedMutant | null,
  ): boolean {
    let last = view?.filter ?? 'all'
    let kept =
      last === 'all' ||
      (file.counts[last] > 0 && (selected === null || selected.status === last))
    let filter = kept ? last : 'all'
    let whole = view?.file !== file || filter !== last
    view = {
      showSkipped: view?.showSkipped ?? false,
      treeQuery: view?.treeQuery ?? '',
      skip: null,
      selected,
      filter,
      file,
    }
    return whole
  }

  /**
   * Renders the page of a route without parameters.
   *
   * @param name - Page to render.
   * @returns HTML of the page.
   */
  function renderPage(
    name: 'overview' | 'mutators' | 'mutants' | 'tests',
  ): string {
    if (name === 'mutants') {
      return renderMutantsView(index, mutants)
    }
    if (name === 'mutators') {
      return renderMutatorsView(index)
    }
    return name === 'tests' ?
        renderTestsView(index, tests)
      : renderOverview(index)
  }

  /**
   * Shows the page the location hash names and marks its tab.
   */
  function route(): void {
    let target = parseRoute(window.location.hash)
    let tab: Parameters<typeof renderPage>[0] | 'files' = 'overview'
    let anchor: string | null = null
    switch (target.name) {
      case 'mutant': {
        let mutant =
          index.byId.get(target.id) ??
          index.mutants.find(entry => entry.id.startsWith(target.id))
        if (mutant) {
          tab = 'files'
          showFiles(openFile(index.files[mutant.file]!, mutant))
          anchor = `#L${mutant.line}`
        }
        break
      }
      case 'files': {
        let file =
          index.files.find(entry => entry.path === target.path) ??
          index.worstFiles[0]
        if (file) {
          tab = 'files'
          openFile(file, null)
          showFiles(true)
          anchor = target.line === null ? null : `#L${target.line}`
        }
        break
      }
      case 'test': {
        let position = getTestGroups(report.tests).all.indexOf(
          report.tests[target.index]!,
        )
        tab = 'tests'
        tests = {
          limit: Math.max(TESTS_PAGE, position + 1),
          target: target.index,
          group: 'all',
        }
        anchor = `#test-${target.index}`
        break
      }
      default: {
        tab = target.name
        tests = { ...tests, target: null }
      }
    }
    if (tab !== 'files') {
      setMarkup(main, renderPage(tab))
    }
    let element = anchor === null ? null : document.querySelector(anchor)
    if (element) {
      element.scrollIntoView({ block: 'center' })
    } else {
      window.scrollTo(0, 0)
    }
    for (let link of document.querySelectorAll('[data-tab]')) {
      link.setAttribute(
        'aria-current',
        link.getAttribute('data-tab') === tab ? 'page' : 'false',
      )
    }
    let title =
      tab === 'files' ?
        view!.file.path
      : `${tab.charAt(0).toUpperCase()}${tab.slice(1)}`
    document.title = `${title} · ${report.meta.project} · mootant report`
    page = tab
  }

  /**
   * Opens a location, or shows its page again when it is the current one and
   * the browser does not announce a change.
   *
   * @param hash - Location hash with `#`.
   */
  function go(hash: string): void {
    let before = window.location.hash
    window.location.hash = hash
    if (window.location.hash === before) {
      route()
    }
  }

  /**
   * Shows a skipped candidate in the panel and brings its line into view, above
   * the panel that covers the bottom of a narrow screen.
   *
   * @param skip - Skipped candidate to show.
   */
  function openSkip(skip: IndexedSkip): void {
    view = { ...view!, selected: null, skip }
    showFiles(false)
    document
      .querySelector(`#L${skip.line}`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  /**
   * Closes the selected mutant or skipped candidate, keeping the code at its
   * line.
   */
  function closeDetails(): void {
    let { selected, skip, file } = view!
    let open = selected ?? skip
    if (open) {
      go(getFileHref(file.path, open.line))
    }
  }

  /**
   * Finds the mutant to act on next to the selected mutant, or next to the
   * start of the shown file when none is selected, in the order of the mutants
   * to act on. Away from the files page it is the first or the last one.
   *
   * @param step - 1 for the next mutant, -1 for the previous one.
   * @returns Mutant, or undefined past either end.
   */
  function findActionable(step: -1 | 1): IndexedMutant | undefined {
    let { actionable } = index
    if (page !== 'files') {
      return step === 1 ? actionable[0] : actionable.at(-1)
    }
    let { selected, file } = view!
    let rank = ranks.get(file.index)!
    let position = actionable.findIndex(mutant => {
      let other = ranks.get(mutant.file)!
      return (
        other > rank ||
        (other === rank && mutant.index >= (selected?.index ?? 0))
      )
    })
    if (position === -1) {
      position = actionable.length
    }
    let after = actionable[position] === selected ? position + 1 : position
    return actionable[step === 1 ? after : position - 1]
  }

  /**
   * Fills the search results for the text of the search field, the first one
   * selected.
   */
  function search(): void {
    setMarkup(
      results,
      findSearchResults(index, input.value)
        .map(
          (result, position) =>
            html`<a
              class="result"
              role="option"
              href="${escapeHtml(result.href)}"
              aria-selected="${position === 0}"
              ><span class="kind">${escapeHtml(result.kind)}</span
              ><span class="text">${escapeHtml(result.text)}</span></a
            >`,
        )
        .join(''),
    )
  }

  /**
   * Opens the search dialog with the text of the last search selected.
   */
  function openSearch(): void {
    dialog.showModal()
    input.select()
    search()
  }

  /**
   * Shows the table of the mutants page for the current filter.
   */
  function showMutantsTable(): void {
    setMarkup(
      document.querySelector('#mutants-table')!,
      renderMutantsTable(index, mutants),
    )
  }

  /**
   * Handlers of buttons and rows by the data attribute they carry.
   */
  let actions: Record<string, (element: HTMLElement) => void> = {
    line: element => {
      let { selected, filter, file } = view!
      let status = element.dataset['status'] as RunStatus
      let line = Number(element.dataset['line'])
      let candidates = filterByStatus(file.mutants, filter).filter(
        mutant =>
          mutant.line === line &&
          (mutant.status === status ||
            (status === 'Killed' && mutant.status === 'Timeout')),
      )
      let next =
        candidates[(candidates.indexOf(selected!) + 1) % candidates.length]
      go(`#/mutant/${next!.id}`)
    },
    attention: element => {
      for (let button of document.querySelectorAll('[data-attention]')) {
        button.setAttribute('aria-pressed', String(button === element))
      }
      setMarkup(
        document.querySelector('#attention')!,
        renderAttention(
          index,
          element.dataset['attention'] as RunStatus | 'all',
        ),
      )
    },
    themeToggle: () => {
      let theme =
        document.documentElement.dataset['theme'] === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset['theme'] = theme
      try {
        window.localStorage.setItem(THEME_KEY, theme)
      } catch {
        /* The theme still changes for this visit. */
      }
    },
    filter: element => {
      let filter = element.dataset['filter'] as RunStatus | 'all'
      let shown = view!
      view = {
        ...shown,
        selected:
          filter === 'all' || shown.selected?.status === filter ?
            shown.selected
          : null,
        filter,
      }
      showFiles(true)
    },
    step: element => {
      let { selected, filter, file } = view!
      let list = filterByStatus(file.mutants, filter)
      let next = list[list.indexOf(selected!) + Number(element.dataset['step'])]
      if (next) {
        go(`#/mutant/${next.id}`)
      }
    },
    lineSkip: element => {
      let { skip, file } = view!
      let line = Number(element.dataset['lineSkip'])
      let here = file.skipped.filter(entry => entry.line === line)
      openSkip(here[(here.indexOf(skip!) + 1) % here.length]!)
    },
    testsFilter: element => {
      tests = {
        group: element.dataset['testsFilter'] as TestsFilter['group'],
        limit: TESTS_PAGE,
        target: null,
      }
      setMarkup(main, renderTestsView(index, tests))
    },
    mutantsFilter: element => {
      mutants = {
        ...mutants,
        filter: element.dataset['mutantsFilter'] as RunStatus | 'all',
        limit: MUTANTS_PAGE,
      }
      route()
    },
    mutator: element => {
      mutants = {
        mutator: element.dataset['mutator']!,
        limit: MUTANTS_PAGE,
        filter: 'all',
        query: '',
      }
      go('#/mutants')
    },
    clearMutator: () => {
      mutants = { ...mutants, limit: MUTANTS_PAGE, mutator: null }
      route()
      document.querySelector<HTMLElement>('[data-mutants-query]')!.focus()
    },
    testsMore: () => {
      tests = { ...tests, limit: tests.limit + TESTS_PAGE }
      setMarkup(main, renderTestsView(index, tests))
    },
    mutant: element => {
      go(`#/mutant/${index.mutants[Number(element.dataset['mutant'])]!.id}`)
    },
    jump: element => {
      document.querySelector(element.getAttribute('href')!)?.scrollIntoView()
    },
    download: () => {
      downloadJson(document, 'mootant-report.json', unpackRunReport(report))
    },
    skip: element => {
      openSkip(view!.file.skipped[Number(element.dataset['skip'])]!)
    },
    more: () => {
      mutants.limit += MUTANTS_PAGE
      showMutantsTable()
    },
    copy: element => {
      void copyText(element, element.dataset['copy']!)
    },
    href: element => {
      go(element.dataset['href']!)
    },
    close: () => {
      dialog.close()
    },
    closePanel: closeDetails,
    search: openSearch,
  }

  document.addEventListener('click', event => {
    let element = (event.target as HTMLElement).closest<HTMLElement>(
      'a, button, [data-mutant], [data-skip], [data-href], [data-mutator]',
    )
    if (!element) {
      return
    }
    let action = Object.keys(actions).find(
      name => element.dataset[name] !== undefined,
    )
    let href = element.getAttribute('href')
    let modified =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (action) {
      event.preventDefault()
      actions[action]!(element)
    } else if (!modified && href?.startsWith('#/')) {
      event.preventDefault()
      dialog.close()
      go(href)
    }
  })

  document.addEventListener('input', event => {
    let target = event.target as HTMLInputElement
    if (target === input) {
      search()
    } else if (target.dataset['treeFilter'] !== undefined) {
      view = { ...view!, treeQuery: target.value }
      setMarkup(
        document.querySelector('#tree')!,
        renderTree(index.files, view.file, view.treeQuery),
      )
    } else if (target.dataset['mutantsQuery'] !== undefined) {
      mutants = { ...mutants, query: target.value, limit: MUTANTS_PAGE }
      showMutantsTable()
    }
  })

  document.addEventListener('change', event => {
    let target = event.target as HTMLInputElement
    if (target.dataset['showSkipped'] !== undefined) {
      view = { ...view!, showSkipped: target.checked }
      setMarkup(document.querySelector('#code')!, renderFileCode(index, view))
    }
  })

  input.addEventListener('keydown', event => {
    let options = [...results.querySelectorAll('.result')]
    let current = options.findIndex(
      option => option.getAttribute('aria-selected') === 'true',
    )
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      let next =
        (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
        options.length
      options[current]?.setAttribute('aria-selected', 'false')
      options[next]?.setAttribute('aria-selected', 'true')
      options[next]?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter' && options[current]) {
      dialog.close()
      go(options[current].getAttribute('href')!)
    }
  })

  document.addEventListener('keydown', event => {
    let target = event.target as HTMLElement
    let typing =
      target.closest('textarea, input:not([type="checkbox"])') !== null
    if (
      (!typing && event.key === '/') ||
      (event.key === 'k' && (event.metaKey || event.ctrlKey))
    ) {
      event.preventDefault()
      openSearch()
      return
    }
    if (
      typing ||
      dialog.open ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return
    }
    if (event.key === 'j' || event.key === 'k') {
      let next = findActionable(event.key === 'j' ? 1 : -1)
      if (next) {
        go(`#/mutant/${next.id}`)
      }
    } else if (page === 'files' && event.key === 'Escape') {
      closeDetails()
    }
  })

  window.addEventListener('hashchange', route)
  route()
}
