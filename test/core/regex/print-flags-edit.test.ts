import { describe, expect, it } from 'vitest'

import { printFlagsEdit } from '../../../core/regex/print-flags-edit'
import { readTestRegex } from '../../helpers/read-test-regex'

describe('printFlagsEdit', () => {
  it('prints a literal with new flags', () => {
    let source = readTestRegex('/a/gi')

    expect(printFlagsEdit(source, 'g')).toStrictEqual({
      focus: { text: 'g', start: 7, end: 9 },
      node: source.node,
      text: '/a/g',
    })
  })

  it('prints the flags argument with its quote', () => {
    let source = readTestRegex('new RegExp(`a`, "gi")')

    expect(printFlagsEdit(source, 'i')).toStrictEqual({
      focus: { start: 21, text: 'i', end: 23 },
      node: source.flagsNode,
      text: '"i"',
    })
  })

  it('adds the flags to a call with a string pattern', () => {
    let source = readTestRegex('new RegExp(("a"),)')

    expect(printFlagsEdit(source, 'g')).toStrictEqual({
      focus: { text: ', "g"', start: 20, end: 20 },
      text: 'new RegExp(("a"), "g",)',
      node: source.expression,
    })
  })

  it('adds the flags with single quotes to a call with a template', () => {
    expect(printFlagsEdit(readTestRegex('new RegExp(`a`)'), 'i').text).toBe(
      "new RegExp(`a`, 'i')",
    )
  })
})
