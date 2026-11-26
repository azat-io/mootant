import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { listInstallStates } from '../../../core/cache/list-install-states'

/**
 * Lists the files of the package managers in a directory.
 *
 * @param directory - Absolute directory.
 * @returns Absolute paths, in the order they are listed.
 */
function listStates(directory: string): string[] {
  return [
    'node_modules/.package-lock.json',
    'node_modules/.pnpm/lock.yaml',
    'node_modules/.yarn-state.yml',
    'node_modules/.yarn-integrity',
    '.pnp.data.json',
    '.pnp.cjs',
  ].map(name => path.join(directory, name))
}

describe('listInstallStates', () => {
  it('lists the files of what was installed in the root and every directory above it, as in a workspace', () => {
    let top = path.parse(process.cwd()).root
    let workspace = path.join(top, 'workspace')
    let root = path.join(workspace, 'packages/app')

    expect(listInstallStates(root)).toStrictEqual([
      ...listStates(root),
      ...listStates(path.join(workspace, 'packages')),
      ...listStates(workspace),
      ...listStates(top),
    ])
  })

  it('lists those of the root of the file system once', () => {
    let top = path.parse(process.cwd()).root

    expect(listInstallStates(top)).toStrictEqual(listStates(top))
  })
})
