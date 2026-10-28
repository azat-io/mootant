import { describe, expect, it } from 'vitest'

import { includesTsx } from '../../../adapters/node-test/includes-tsx'

describe('includesTsx', () => {
  it('finds tsx or a module inside it among the loaded modules', () => {
    expect(
      [
        ['tsx'],
        ['tsx/esm'],
        ['file:///p/node_modules/tsx/dist/loader.mjs'],
        [String.raw`C:\p\node_modules\tsx\dist\loader.mjs`],
        ['./setup.js', 'tsx'],
      ].map(includesTsx),
    ).toStrictEqual([true, true, true, true, true])
    expect(
      [[], ['ts-node/esm'], ['./tsx-setup.js'], ['my-tsx']].map(includesTsx),
    ).toStrictEqual([false, false, false, false])
  })
})
