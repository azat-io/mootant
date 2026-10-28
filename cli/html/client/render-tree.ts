import type { IndexedFile } from '../../../types/html/indexed-file'

import { pluralize } from '../../../core/text/pluralize'
import { getFileHref } from './get-file-href'
import { escapeHtml } from './escape-html'
import { html } from './html'

/**
 * Renders the list of files grouped by directory, with a badge for survivors,
 * mutants without coverage and errors of each file.
 *
 * @param files - Files of the report.
 * @param current - File shown, marked as the current page.
 * @param query - Text the path must contain, ignoring case.
 * @returns HTML of the list items.
 */
export function renderTree(
  files: readonly IndexedFile[],
  current: IndexedFile | null,
  query: string,
): string {
  let directories = new Map<string, IndexedFile[]>()
  for (let file of files) {
    if (file.path.toLowerCase().includes(query.toLowerCase())) {
      directories.set(file.directory, [
        ...(directories.get(file.directory) ?? []),
        file,
      ])
    }
  }
  if (directories.size === 0) {
    return '<li class="tree-empty">No file matches.</li>'
  }
  return [...directories]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([directory, list]) => {
      let items = list
        .toSorted((first, second) => first.name.localeCompare(second.name))
        .map(file => {
          let { counts } = file
          let badges = [
            counts.Survived > 0 ?
              html`<span
                class="tally status-survived"
                title="${counts.Survived} survived"
                >${counts.Survived}</span
              >`
            : '',
            counts.NoCoverage > 0 ?
              html`<span
                class="tally status-no-coverage"
                title="${counts.NoCoverage} without coverage"
                >${counts.NoCoverage}</span
              >`
            : '',
            counts.Error > 0 ?
              html`<span
                class="tally status-error"
                title="${pluralize(counts.Error, 'error')}"
                >${counts.Error}</span
              >`
            : '',
          ].join('')
          return html`<li>
            <a
              class="tree-file${directory ? ' nested' : ''}"
              href="${getFileHref(file.path)}"
              ${file === current ? ' aria-current="page"' : ''}
              ><span class="file-name">${escapeHtml(file.name)}</span
              >${badges}</a
            >
          </li>`
        })
        .join('')
      return `${directory ? html`<li class="tree-directory">${escapeHtml(directory)}/</li>` : ''}${items}`
    })
    .join('')
}
