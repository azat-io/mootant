// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import type { HtmlReport } from '../../../../types/report/html-report'

import { serializeReportData } from '../../../../cli/html/serialize-report-data'
import { downloadJson } from '../../../../cli/html/client/download-json'
import { startReport } from '../../../../cli/html/client/start-report'
import { createHtmlReport } from '../../../helpers/create-html-report'
import { setMarkup } from '../../../../cli/html/client/set-markup'

vi.mock(import('../../../../cli/html/client/download-json'), () => ({
  downloadJson: vi.fn<typeof downloadJson>(),
}))

/**
 * Removers of the listeners the started reports added to the shared document
 * and window, where they would answer the events of a later report too.
 */
let stops: (() => void)[] = []

/**
 * Keeps a remover of every listener added to a target.
 *
 * @param target - Document or window.
 */
function trackListeners(target: EventTarget): void {
  let add = target.addEventListener.bind(target)
  vi.spyOn(target, 'addEventListener').mockImplementation(
    (name, listener, options) => {
      stops.push(() => {
        target.removeEventListener(name, listener, options)
      })
      add(name, listener, options)
    },
  )
}

/**
 * Starts a report page with the given data, alone on the document.
 *
 * @param report - Data of the report.
 */
function start(report: HtmlReport = createHtmlReport()): void {
  stop()
  document.documentElement.dataset['theme'] = 'light'
  setMarkup(
    document.body,
    `<div id="app"></div><script type="application/json" id="report-data">${serializeReportData(report)}</script>`,
  )
  startReport(document)
}

/**
 * Presses a key on an element.
 *
 * @param key - Key name.
 * @param target - Element the key goes to.
 * @param modifiers - Modifier keys held.
 */
function press(
  key: string,
  target: Element = document.body,
  modifiers: KeyboardEventInit = {},
): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { ...modifiers, bubbles: true, key }),
  )
}

/**
 * Element that matches a selector, which the test expects to exist.
 *
 * @param selector - CSS selector.
 * @returns First matching element.
 */
function get(selector: string): HTMLElement {
  let element = document.querySelector<HTMLElement>(selector)
  if (!element) {
    throw new Error(`No element matches ${selector}.`)
  }
  return element
}

/**
 * Types text into a field.
 *
 * @param field - Input element.
 * @param value - Text it holds afterwards.
 */
function type(field: HTMLInputElement, value: string): void {
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Text of an element that the test expects to exist, with its white space
 * joined into single spaces.
 *
 * @param selector - CSS selector.
 * @returns Text of the first matching element.
 */
function text(selector: string): string {
  return get(selector).textContent.replaceAll(/\s+/gu, ' ').trim()
}

/**
 * Waits for the page to follow a change of the location hash, which the browser
 * announces after the current task.
 */
async function settle(): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, 0)
  })
}

/**
 * Opens a location of the report and lets it show the page.
 *
 * @param hash - Location hash without `#`.
 */
async function open(hash: string): Promise<void> {
  location.hash = hash
  await settle()
}

/**
 * Removes the listeners of the reports started so far.
 */
function stop(): void {
  for (let remove of stops) {
    remove()
  }
  stops = []
}

describe('startReport', () => {
  beforeEach(() => {
    location.hash = ''
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    vi.spyOn(globalThis, 'scrollTo').mockImplementation(() => {})
    trackListeners(document)
    trackListeners(globalThis)
  })

  afterEach(() => {
    stop()
    vi.restoreAllMocks()
  })

  it('shows the overview and marks its tab', () => {
    start()

    expect(text('#main')).toContain('Look at these first')
    expect(get('[data-tab="overview"]').getAttribute('aria-current')).toBe(
      'page',
    )
    expect(get('[data-tab="files"]').getAttribute('aria-current')).toBe('false')
    expect(document.title).toBe('Overview · cart · mootant report')
  })

  it('filters the mutants to act on', () => {
    start()
    get('[data-attention="NoCoverage"]').click()

    expect(document.querySelectorAll('#attention .row')).toHaveLength(1)
    expect(
      get('[data-attention="NoCoverage"]').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(get('[data-attention="all"]').getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('downloads the run report as JSON', () => {
    start()
    get('[data-download]').click()

    expect(downloadJson).toHaveBeenCalledWith(
      document,
      'mootant-report.json',
      expect.objectContaining({
        schemaVersion: 3,
        command: 'run',
        listed: 'all',
      }),
    )
  })

  it('toggles the theme and remembers it when storage allows', () => {
    start()
    get('[data-theme-toggle]').click()

    expect(document.documentElement.dataset['theme']).toBe('dark')
    expect(localStorage.getItem('mootant-report-theme')).toBe('dark')
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    get('[data-theme-toggle]').click()

    expect(document.documentElement.dataset['theme']).toBe('light')
  })

  it('shows files, lines and mutants, and steps through them', async () => {
    start()
    await open('/files')

    expect(text('#file-title')).toBe('src/cart.ts')
    expect(text('#panel')).toContain('Mutators here')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
    expect(document.title).toBe('src/cart.ts · cart · mootant report')
    await open('/file/src/cart.ts:4')

    expect(get('#L4').scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    await open('/mutant/surv')

    expect(text('#panel')).toContain('Where to add a test')
    expect(text('#code .is-selected')).toBe('size < limit')
    expect(get('[data-tab="files"]').getAttribute('aria-current')).toBe('page')
    get('[data-step="1"]').click()
    await settle()

    expect(location.hash).toBe('#/mutant/errored00001')
    get('[data-step="-1"]').click()
    await settle()

    expect(location.hash).toBe('#/mutant/survived0001')
    get('[data-filter="Survived"]').click()
    let step = document.createElement('button')
    step.dataset['step'] = '1'
    get('#panel').append(step)
    step.click()
    await settle()

    expect(location.hash).toBe('#/mutant/survived0001')
    let plain = document.createElement('button')
    document.body.append(plain)
    plain.click()
    get('[data-tree-filter]').dispatchEvent(
      new Event('change', { bubbles: true }),
    )
    get('[data-filter="all"]').click()
    get('[data-mutant="4"]').click()
    await settle()

    expect(location.hash).toBe('#/mutant/uncovered001')
  })

  it('cycles through the mutants of a line badge', async () => {
    start()
    await open('/mutant/killed000001')
    get('[data-line="2"][data-status="Killed"]').click()
    await settle()

    expect(location.hash).toBe('#/mutant/timeout00001')
    get('[data-line="2"][data-status="Killed"]').click()
    await settle()

    expect(location.hash).toBe('#/mutant/timeout00001')
    expect(text('#panel')).toContain('Timed out in')
  })

  it('cycles only through the mutants the filter shows', async () => {
    let report = createHtmlReport()
    report.mutants.push({
      ...report.mutants[0]!,
      id: 'timeout00002',
      status: 'Timeout',
    })
    start(report)
    await open('/mutant/killed000001')
    get('[data-filter="Killed"]').click()
    get('[data-line="1"][data-status="Killed"]').click()
    await settle()

    expect(location.hash).toBe('#/mutant/killed000001')
    get('[data-filter="all"]').click()
    get('[data-line="1"][data-status="Killed"]').click()
    await settle()

    expect(location.hash).toBe('#/mutant/timeout00002')
  })

  it('filters the code, keeps or drops the selection and shows skips', async () => {
    start()
    await open('/mutant/survived0001')
    get('[data-filter="Survived"]').click()

    expect(get('[data-filter="Survived"]').getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(text('#panel')).toContain('Where to add a test')
    get('[data-filter="Killed"]').click()

    expect(text('#panel')).toContain('Mutators here')
    await open('/mutant/killed000001')

    expect(get('[data-filter="Killed"]').getAttribute('aria-pressed')).toBe(
      'true',
    )
    await open('/mutant/survived0001')

    expect(get('[data-filter="all"]').getAttribute('aria-pressed')).toBe('true')
    get('[data-filter="all"]').click()
    get('#panel [data-skip="0"]').click()

    expect(text('#panel')).toContain('Left out on purpose')
    press('x')
    press('Escape')
    await settle()

    expect(location.hash).toBe('#/file/src/cart.ts:4')
    await open('/mutant/survived0001')
    get('#panel [data-skip="0"]').click()
    let toggle = get('[data-show-skipped]') as HTMLInputElement
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))

    expect(document.querySelector('#code .tally.status-skipped')).not.toBeNull()
    type(get('[data-tree-filter]') as HTMLInputElement, 'none')

    expect(text('#tree')).toBe('No file matches.')
    await open('/mutant/survived0001')

    expect((get('[data-tree-filter]') as HTMLInputElement).value).toBe('none')
  })

  it('lists, filters and pages the mutants', async () => {
    start()
    await open('/mutants')

    expect(document.querySelectorAll('#mutants-table tbody tr')).toHaveLength(6)
    get('[data-mutants-filter="Killed"]').click()

    expect(document.querySelectorAll('#mutants-table tbody tr')).toHaveLength(1)
    get('[data-mutants-filter="all"]').click()
    type(get('[data-mutants-query]') as HTMLInputElement, 'arithmetic')

    expect(document.querySelectorAll('#mutants-table tbody tr')).toHaveLength(2)
    let more = document.createElement('button')
    more.dataset['more'] = ''
    get('#mutants-table').append(more)
    more.click()

    expect(document.querySelectorAll('#mutants-table tbody tr')).toHaveLength(2)
    get('#mutants-table tbody tr').click()
    await settle()

    expect(location.hash).toBe('#/mutant/uncovered001')
  })

  it('opens its own links and leaves clicks with a modifier to the browser', async () => {
    start()
    await open('/mutants')
    let click = new MouseEvent('click', { cancelable: true, bubbles: true })
    get('#mutants-table tbody tr a').dispatchEvent(click)

    expect(click.defaultPrevented).toBe(true)
    expect(location.hash).toBe('#/mutant/killed000001')
    let modified = new MouseEvent('click', {
      cancelable: true,
      metaKey: true,
      bubbles: true,
    })
    get('[data-tab="files"]').dispatchEvent(modified)

    expect(modified.defaultPrevented).toBe(false)
  })

  it('opens a file again from its own link', async () => {
    start()
    await open('/file/src/cart.ts')
    let toggle = get('[data-show-skipped]') as HTMLInputElement
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    get('[data-filter="Killed"]').click()
    get('#code [data-skip="0"]').click()

    expect(text('#panel')).toContain('Left out on purpose')
    get('#tree [aria-current="page"]').click()

    expect(location.hash).toBe('#/file/src/cart.ts')
    expect(text('#panel')).toContain('Mutators here')
  })

  it('scrolls to the skipped candidates of the overview', () => {
    start()
    get('[data-jump]').click()

    expect(get('#skipped').scrollIntoView).toHaveBeenCalledWith()
    expect(location.hash).toBe('')
  })

  it('opens the mutants of a mutator and the groups of tests', async () => {
    start()
    await open('/mutators')
    get('[data-mutator="arithmetic-operator"]').click()
    await settle()

    expect(location.hash).toBe('#/mutants')
    expect(text('.mutator-filter code')).toBe('arithmetic-operator')
    expect((get('[data-mutants-query]') as HTMLInputElement).value).toBe('')
    expect(document.querySelectorAll('#mutants-table tbody tr')).toHaveLength(2)
    get('[data-clear-mutator]').click()

    expect(document.querySelector('.mutator-filter')).toBeNull()
    expect(document.querySelectorAll('#mutants-table tbody tr')).toHaveLength(6)
    expect(document.activeElement).toBe(get('[data-mutants-query]'))
    await open('/mutators')
    get('a[data-mutator="string-literal"]').click()
    await settle()

    expect(document.querySelectorAll('#mutants-table tbody tr')).toHaveLength(1)
    await open('/tests')
    get('[data-tests-filter="none"]').click()

    expect(text('#main')).toContain('unused')
    expect(text('#main')).not.toContain('small sizes')
  })

  it('opens a test the search found, marked among all tests', async () => {
    start()
    press('/')
    type(get('#search input') as HTMLInputElement, 'unit')
    press('Enter', get('#search input'))
    await settle()

    expect(location.hash).toBe('#/tests/1')
    expect(get('[data-tab="tests"]').getAttribute('aria-current')).toBe('page')
    expect(get('#test-1').className).toBe('is-target')
    expect(get('#test-1').scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
    })
    get('[data-tests-filter="survivors"]').click()

    expect(document.querySelector('.is-target')).toBeNull()
    let more = document.createElement('button')
    more.dataset['testsMore'] = ''
    get('#main').append(more)
    more.click()

    expect(document.querySelectorAll('#main tbody tr')).toHaveLength(2)
    await open('/tests')

    expect(document.querySelector('.is-target')).toBeNull()
  })

  it('steps through the skipped candidates of a line from its badge', async () => {
    let report = createHtmlReport()
    let [skip] = report.skipped
    report.skipped = [
      skip!,
      { ...skip!, rule: 'unused-flag' },
      { ...skip!, rule: 'anchored-global' },
    ]
    start(report)
    await open('/file/src/cart.ts')
    let toggle = get('[data-show-skipped]') as HTMLInputElement
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    let rules: string[] = []
    for (let step = 0; step < 4; step++) {
      get('[data-line-skip="4"]').click()
      rules.push(get('#panel .fields dd:nth-of-type(2) code').textContent)
    }

    expect(rules).toStrictEqual([
      'lower-bound',
      'unused-flag',
      'anchored-global',
      'lower-bound',
    ])
    expect(get('#L4').scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('adds a page of tests after a test the search opened far down', async () => {
    let report = createHtmlReport()
    report.tests = Array.from({ length: 1000 }, (_, position) => ({
      ...report.tests[0]!,
      name: `test ${position}`,
      reach: 1000 - position,
      survivors: 0,
    }))
    start(report)
    await open('/tests/500')

    expect(document.querySelectorAll('#main tbody tr')).toHaveLength(501)
    get('[data-tests-more]').click()

    expect(document.querySelectorAll('#main tbody tr')).toHaveLength(801)
  })

  it('searches with the keyboard and with clicks', async () => {
    start()
    press('/')

    let dialog = get('#search') as HTMLDialogElement
    let input = get('#search input') as HTMLInputElement

    expect(dialog.open).toBe(true)
    expect(document.querySelectorAll('#search-results .result')).toHaveLength(3)
    type(input, 'unit')

    expect(text('#search-results')).toContain('cart › unit')
    type(input, 'cart.ts')
    press('ArrowDown', input)
    press('ArrowUp', input)
    press('ArrowUp', input)

    expect(
      get('#search-results .result[aria-selected="true"]').getAttribute('href'),
    ).toBe('#/mutant/ignored00001')
    press('Enter', input)
    await settle()

    expect(dialog.open).toBe(false)
    expect(location.hash).toBe('#/mutant/ignored00001')
    press('k', document.body, { metaKey: true })

    expect(dialog.open).toBe(true)
    type(input, 'nothing at all')
    press('Enter', input)
    press('x', input)
    setMarkup(get('#search-results'), '<a class="result" href="#/files">x</a>')
    get('#search-results a').click()

    expect(dialog.open).toBe(false)
    press('k', document.body, { ctrlKey: true })
    get('[data-close]').click()

    expect(dialog.open).toBe(false)
    get('[data-search]').click()

    expect(dialog.open).toBe(true)
  })

  it('steps through the mutants to act on with j and k, and closes with Esc', async () => {
    start()
    press('k')
    await settle()

    expect(location.hash).toBe('#/mutant/uncovered001')
    press('j')
    await settle()
    press('k')
    await settle()

    expect(location.hash).toBe('#/mutant/errored00001')
    press('k')
    await settle()
    press('k')
    await settle()

    expect(location.hash).toBe('#/mutant/survived0001')
    press('Escape')
    await settle()

    expect(location.hash).toBe('#/file/src/cart.ts:4')
    press('j')
    await settle()

    expect(location.hash).toBe('#/mutant/survived0001')
    await open('/mutant/killed000001')
    press('j')
    await settle()

    expect(location.hash).toBe('#/mutant/survived0001')
    press('j', get('[data-tree-filter]'))
    press('j', document.body, { altKey: true })
    press('Escape', document.body)

    expect(location.hash).toBe('#/file/src/cart.ts:4')
    press('Escape')
    await settle()

    expect(location.hash).toBe('#/file/src/cart.ts:4')
    await open('/mutants')
    press('Escape')
    await settle()

    expect(location.hash).toBe('#/mutants')
  })

  it('steps from the overview and from a file without mutants to act on', async () => {
    let report = createHtmlReport()
    report.files.push({ file: 'a.ts', parsed: true, source: 'x' })
    start(report)
    press('j')
    await settle()

    expect(location.hash).toBe('#/mutant/survived0001')
    await open('/file/a.ts')
    press('j')
    press('Escape')
    await settle()

    expect(location.hash).toBe('#/file/a.ts')
    press('k')
    await settle()

    expect(location.hash).toBe('#/mutant/uncovered001')
  })

  it('keeps the keys working after the switch of the skipped candidates', async () => {
    start()
    await open('/file/src/cart.ts')
    let toggle = get('[data-show-skipped]') as HTMLInputElement
    toggle.checked = true
    toggle.dispatchEvent(new Event('input', { bubbles: true }))
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    press('j', toggle)
    await settle()

    expect(location.hash).toBe('#/mutant/survived0001')
  })

  it('copies commands and shows the overview for what it cannot find', async () => {
    let copy = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    start()
    get('#main .copy').click()

    expect(copy).toHaveBeenCalledWith('mootant run src --html')
    await open('/mutant/zzzz')

    expect(text('#main')).toContain('Look at these first')
    let report = createHtmlReport()
    report.files = []
    report.mutants = []
    report.skipped = []
    start(report)
    await open('/files')

    expect(get('[data-tab="overview"]').getAttribute('aria-current')).toBe(
      'page',
    )
    get('#main').click()
  })
})
