import { describe, expect, it } from 'vitest'

import { loadRegexpp } from '../../../core/regex/load-regexpp'

describe('loadRegexpp', () => {
  it('loads regexpp once', () => {
    let loaded = loadRegexpp()

    expect(loaded.RegExpParser).toBeTypeOf('function')
    expect(loadRegexpp()).toBe(loaded)
  })
})
