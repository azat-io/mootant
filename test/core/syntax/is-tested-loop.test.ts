import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { isTestedLoop } from '../../../core/syntax/is-tested-loop'
import { createTestFile } from '../../helpers/create-test-file'

describe('isTestedLoop', () => {
  it.each<[string, Node['type'], boolean]>([
    ['while (a) {}', 'WhileStatement', true],
    ['do {} while (a)', 'DoWhileStatement', true],
    ['for (;;) {}', 'ForStatement', true],
    ['for (let k in o) {}', 'ForInStatement', false],
    ['for (let v of o) {}', 'ForOfStatement', false],
    ['if (a) {}', 'IfStatement', false],
  ])('answers %s', (source, type, expected) => {
    let { find } = createTestFile(source)

    expect(isTestedLoop(find(type))).toBe(expected)
  })

  it('returns false for null', () => {
    expect(isTestedLoop(null)).toBe(false)
  })
})
