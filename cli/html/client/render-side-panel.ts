import type { ReportIndex } from '../../../types/html/report-index'
import type { FileView } from '../../../types/html/file-view'

import { renderMutantPanel } from './render-mutant-panel'
import { renderFilePanel } from './render-file-panel'
import { renderSkipPanel } from './render-skip-panel'
import { filterByStatus } from './filter-by-status'

/**
 * Renders the panel next to the code: of the selected mutant, with buttons
 * through the mutants the filter shows; of the selected skipped candidate; or
 * of the file.
 *
 * @param index - Index of the report.
 * @param view - What the files page shows.
 * @returns HTML of the panel.
 */
export function renderSidePanel(index: ReportIndex, view: FileView): string {
  let { selected, filter, file, skip } = view
  if (selected) {
    return renderMutantPanel(
      index,
      selected,
      filterByStatus(file.mutants, filter),
    )
  }
  return skip ?
      renderSkipPanel(index, file, skip)
    : renderFilePanel(index, file)
}
