import path from 'node:path'

import type { NodeTestEnd } from '../types/node-test-record'

import { trackEnvironment } from '../../shared/track-environment'
import { trackFileReads } from '../../shared/track-file-reads'

/**
 * Variables node:test reads on its own, which say nothing about the tests.
 */
const NODE_TEST_VARIABLES = ['NODE_TEST_CONTEXT', 'FORCE_COLOR']

/**
 * Starts recording what the code of a test process reads: the project files and
 * directories read through `node:fs`, those it changed itself, and the
 * environment variables, apart from those node:test reads on its own.
 *
 * @param root - Project root; only files in it, outside `node_modules`, count.
 * @returns Function that stops recording and returns what was read, sorted.
 */
export function trackInputs(
  root: string,
): () => Pick<NodeTestEnd, 'environment' | 'modified' | 'files'> {
  let environment = new Set<string>()
  let written = new Set<string>()
  let touched = new Set<string>()
  let files = new Set<string>()
  trackFileReads({
    read: file => {
      if (
        (file === root || file.startsWith(root + path.sep)) &&
        !file.includes(`${path.sep}node_modules${path.sep}`) &&
        !written.has(file)
      ) {
        files.add(file)
      }
    },
    write: file => {
      written.add(file)
      touched.add(file)
      touched.add(path.dirname(file))
    },
  })
  trackEnvironment({ ignored: NODE_TEST_VARIABLES }, name => {
    environment.add(name)
  })
  return () => {
    trackFileReads(null)
    trackEnvironment({ ignored: NODE_TEST_VARIABLES }, null)
    return {
      modified: [...files].filter(file => touched.has(file)).toSorted(),
      environment: [...environment].toSorted(),
      files: [...files].toSorted(),
    }
  }
}
