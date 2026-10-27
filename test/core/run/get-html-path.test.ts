import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { getHtmlPath } from '../../../core/run/get-html-path'

describe('getHtmlPath', () => {
  let root = path.resolve('/project')

  it('writes no report unless the option or the configuration asks for one', () => {
    expect(
      getHtmlPath(undefined, undefined, { picked: false, root }),
    ).toBeNull()
    expect(getHtmlPath(undefined, false, { picked: false, root })).toBeNull()
  })

  it('writes the report to .mootant/report.html by default', () => {
    expect(getHtmlPath(true, undefined, { picked: false, root })).toBe(
      path.join(root, '.mootant', 'report.html'),
    )
    expect(getHtmlPath(undefined, true, { picked: false, root })).toBe(
      path.join(root, '.mootant', 'report.html'),
    )
    expect(getHtmlPath(true, false, { picked: false, root })).toBe(
      path.join(root, '.mootant', 'report.html'),
    )
  })

  it('resolves a configured path against the project root', () => {
    expect(
      getHtmlPath(undefined, 'reports/mutants.html', { picked: false, root }),
    ).toBe(path.join(root, 'reports', 'mutants.html'))
    expect(
      getHtmlPath(true, 'reports/mutants.html', { picked: false, root }),
    ).toBe(path.join(root, 'reports', 'mutants.html'))
  })

  it('lets --no-html turn off a configured report', () => {
    expect(
      getHtmlPath(false, 'reports/mutants.html', { picked: false, root }),
    ).toBeNull()
    expect(getHtmlPath(false, true, { picked: false, root })).toBeNull()
  })

  it('lets a run of single mutants write a report only with --html', () => {
    expect(getHtmlPath(undefined, true, { picked: true, root })).toBeNull()
    expect(
      getHtmlPath(true, 'reports/mutants.html', { picked: true, root }),
    ).toBe(path.join(root, 'reports', 'mutants.html'))
  })
})
