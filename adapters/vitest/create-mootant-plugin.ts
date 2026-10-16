import type { TestProject } from 'vitest/node'
import type { Plugin } from 'vite'

import type { AdapterContext } from '../../types/adapter/adapter-context'
import type { VitestSessionState } from './types/vitest-session-state'

import { resolveSwitchedText } from '../../core/instrument/resolve-switched-text'
import { indexSwitchedFiles } from './index-switched-files'
import { getSwitchablePath } from './get-switchable-path'
import { configureProject } from './configure-project'
import { getFileKey } from './get-file-key'

/**
 * Creates the Vite plugin of a session. Before other transforms, those of
 * plugins with `enforce: 'pre'` included, it replaces the text of every
 * switched file with the switched text, as long as the loaded text is the one
 * mootant listed mutants from; it records which files it served and which it
 * found changed. Virtual modules and ids with a query, such as `?raw`, are left
 * as they are, except the external script of a Vue component. Vue and Svelte
 * components are switched before their framework plugin compiles them. Each
 * Vitest project is configured for mootant's runner when Vitest starts.
 *
 * @param context - Context of the session; its files are read on first use.
 * @param state - Session state shared with the plugin.
 * @returns Vite plugin named `mootant`.
 */
export function createMootantPlugin(
  context: AdapterContext,
  state: VitestSessionState,
): Plugin {
  return {
    transform: {
      handler(code, id) {
        let file = getSwitchablePath(id)
        if (file === null || !state.instrumented) {
          return null
        }
        state.files ??= indexSwitchedFiles(context.files, state)
        let entry = state.files.get(getFileKey(file, state.keys))
        if (entry === undefined) {
          return null
        }
        state.served.add(entry.file)
        let switched = resolveSwitchedText(entry, code)
        if (switched === null) {
          state.mismatched.add(entry.file)
          return null
        }
        return { code: switched, map: null }
      },
      order: 'pre',
    },
    configureVitest({ project }: { project: TestProject }) {
      configureProject(project, state)
    },
    name: 'mootant',
    enforce: 'pre',
  }
}
