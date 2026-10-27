import type { ReportRoute } from '../../../types/html/report-route'

/**
 * Pages without parameters besides the overview.
 */
const PAGES = ['mutators', 'mutants', 'tests'] as const

/**
 * Reads the page a location hash names: `#/` for the overview, `#/files`,
 * `#/file/<path>` or `#/file/<path>:<line>` for a file, `#/mutant/<id>` for a
 * mutant, `#/tests/<index>` for a test, and `#/mutants`, `#/mutators` or
 * `#/tests`. Anything else is the overview. The line is read before the escapes
 * of the path, so an escaped `:` stays in the path; a path or id with a broken
 * escape is read as it is.
 *
 * @param hash - Location hash, with or without `#`.
 * @returns Page to show.
 */
export function parseRoute(hash: string): ReportRoute {
  let path = hash.replace(/^#/u, '')
  if (path.startsWith('/mutant/')) {
    return { id: decode(path.slice('/mutant/'.length)), name: 'mutant' }
  }
  if (path.startsWith('/file/')) {
    let match = /^(?<file>.+?)(?::(?<line>\d+))?$/u.exec(
      path.slice('/file/'.length),
    )
    return {
      line: match?.groups?.['line'] ? Number(match.groups['line']) : null,
      path: match?.groups?.['file'] ? decode(match.groups['file']) : null,
      name: 'files',
    }
  }
  let test = /^\/tests\/(?<index>\d+)$/u.exec(path)
  if (test) {
    return { index: Number(test.groups!['index']), name: 'test' }
  }
  if (path === '/files') {
    return { name: 'files', path: null, line: null }
  }
  let name = PAGES.find(page => path === `/${page}`)
  return { name: name ?? 'overview' }
}

/**
 * Decodes the escapes of a part of a location hash.
 *
 * @param part - Path or id from the hash.
 * @returns Decoded text, or the text as it is when an escape is broken.
 */
function decode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}
