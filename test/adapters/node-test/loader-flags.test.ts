import { describe, expect, it } from 'vitest'

import { LOADER_FLAGS } from '../../../adapters/node-test/loader-flags'

describe('lOADER_FLAGS', () => {
  it('names the flags that load a module before the test file', () => {
    expect(LOADER_FLAGS).toStrictEqual(
      new Set([
        '--experimental-loader',
        '--require',
        '--import',
        '--loader',
        '-r',
      ]),
    )
  })
})
