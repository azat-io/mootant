import { describe, expect, it } from 'vitest'

import { LOADER_FLAGS } from '../../../adapters/shared/loader-flags'

describe('LOADER_FLAGS', () => {
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
