import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

import { listSetupFiles } from '../../../adapters/node-test/list-setup-files'

describe('listSetupFiles', () => {
  it('lists the project files that flags load', () => {
    let root = path.resolve('/project')
    let absolute = path.resolve('/elsewhere/setup.js')

    expect(
      listSetupFiles(root, [
        '--import',
        'tsx',
        '--import',
        './setup.js',
        '--require',
        '../shared.cjs',
        `--import=${pathToFileURL(absolute).href}`,
        '--loader',
        absolute,
        '--test-global-setup',
        'global.js',
        '--test-global-setup=./global2.js',
        '--test-global-setup',
      ]),
    ).toStrictEqual([
      path.join(root, 'setup.js'),
      path.resolve(root, '../shared.cjs'),
      absolute,
      absolute,
      path.join(root, 'global2.js'),
    ])
  })
})
