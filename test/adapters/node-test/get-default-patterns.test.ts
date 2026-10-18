import { describe, expect, it } from 'vitest'

import { getDefaultPatterns } from '../../../adapters/node-test/get-default-patterns'

describe('getDefaultPatterns', () => {
  it("gives Node's patterns, with TypeScript when it loads", () => {
    expect(getDefaultPatterns('node', false)).toStrictEqual([
      '**/*.test.{cjs,mjs,js}',
      '**/*-test.{cjs,mjs,js}',
      '**/*_test.{cjs,mjs,js}',
      '**/test-*.{cjs,mjs,js}',
      '**/test.{cjs,mjs,js}',
      '**/test/**/*.{cjs,mjs,js}',
    ])
    expect(getDefaultPatterns('node', true)[0]).toBe(
      '**/*.test.{cjs,mjs,js,cts,mts,ts}',
    )
    expect(getDefaultPatterns('tsx', false)[0]).toBe(
      '**/*.test.{cjs,mjs,js,cts,mts,ts}',
    )
  })

  it('gives the patterns of better-node-test and borp', () => {
    expect(getDefaultPatterns('bnt', false)).toStrictEqual([
      '**/*.{test,spec}.{js,ts}',
    ])
    expect(getDefaultPatterns('borp', false)).toStrictEqual([
      '**/*.test.{cjs,mjs,js}',
    ])
  })
})
