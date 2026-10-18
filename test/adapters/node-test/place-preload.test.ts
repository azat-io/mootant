import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'

import { placePreload } from '../../../adapters/node-test/place-preload'

/**
 * Path of a preload with a space.
 */
const PRELOAD = '/m t/preload.js'

/**
 * URL of the preload.
 */
const PRELOAD_URL = pathToFileURL(PRELOAD).href

describe('placePreload', () => {
  it('imports the preload first', () => {
    expect(placePreload(PRELOAD, ['--import', 'tsx'], '')).toStrictEqual({
      args: ['--import', PRELOAD_URL, '--import', 'tsx'],
      nodeOptions: '',
    })
    expect(placePreload(PRELOAD, [], '--import tsx')).toStrictEqual({
      nodeOptions: `--import=${PRELOAD_URL} --import tsx`,
      args: [],
    })
  })

  it('requires the preload first when the project requires modules', () => {
    expect(
      placePreload(PRELOAD, ['-r', './a.cjs'], '--max-old-space-size=9'),
    ).toStrictEqual({
      args: ['--require', PRELOAD, '-r', './a.cjs'],
      nodeOptions: '--max-old-space-size=9',
    })
    expect(
      placePreload(PRELOAD, ['--require=./a.cjs'], '--import tsx'),
    ).toStrictEqual({
      args: ['--require', PRELOAD, '--require=./a.cjs'],
      nodeOptions: '--import tsx',
    })
    expect(
      placePreload(PRELOAD, ['-r', './a.cjs'], '-r ./b.cjs'),
    ).toStrictEqual({
      nodeOptions: '--require="/m t/preload.js" -r ./b.cjs',
      args: ['-r', './a.cjs'],
    })
  })
})
