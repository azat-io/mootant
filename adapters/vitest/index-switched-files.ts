import type { VitestSessionState } from './types/vitest-session-state'
import type { SwitchedFile } from '../../types/adapter/switched-file'

import { getFileKey } from './get-file-key'

/**
 * Indexes the switched files by their real paths for the plugin.
 *
 * @param files - Switched files of the session.
 * @param state - Session state whose key cache is used and updated.
 * @returns Switched files by real path.
 */
export function indexSwitchedFiles(
  files: readonly SwitchedFile[],
  state: VitestSessionState,
): Map<string, SwitchedFile> {
  return new Map(
    files.map(entry => [getFileKey(entry.file, state.keys), entry]),
  )
}
