import { describe, expect, it } from 'vitest'
import path from 'node:path'

import { getPackageManifest } from '../../../core/files/get-package-manifest'

describe('getPackageManifest', () => {
  it.each([
    ['/p/node_modules/a/index.js', '/p/node_modules/a/package.json'],
    [
      '/p/node_modules/@scope/a/dist/esm/index.js',
      '/p/node_modules/@scope/a/package.json',
    ],
    [
      '/p/node_modules/.pnpm/a@1.0.0/node_modules/a/lib/index.js',
      '/p/node_modules/.pnpm/a@1.0.0/node_modules/a/package.json',
    ],
    [
      '/p/node_modules/a/node_modules/b/index.js',
      '/p/node_modules/a/node_modules/b/package.json',
    ],
    [
      String.raw`C:\p\node_modules\a\index.js`,
      path.join(String.raw`C:\p\node_modules\a`, 'package.json'),
    ],
  ])('gives the manifest of the package of %s', (file, manifest) => {
    expect(getPackageManifest(file)).toBe(manifest)
  })

  it.each(['/p/src/index.js', '/p/node_modules/a.js', '/p/node_modules'])(
    'gives none for %s, which lies in no package',
    file => {
      expect(getPackageManifest(file)).toBeNull()
    },
  )
})
