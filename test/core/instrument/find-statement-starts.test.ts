import { describe, expect, it } from 'vitest'

import { findStatementStarts } from '../../../core/instrument/find-statement-starts'

/**
 * Byte order mark at the start of a text read as UTF-8.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

describe('findStatementStarts', () => {
  it('finds expression statements of statement lists', () => {
    let source = ['let a = 1', 'run()', 'if (a) go()', '{ stop() }'].join('\n')

    expect([...findStatementStarts('example.ts', source)]).toStrictEqual([
      source.indexOf('run()'),
      source.indexOf('stop()'),
    ])
  })

  it('finds the statements of every script block of a component', () => {
    let source = [
      '<script>',
      'run()',
      '</script>',
      '<script setup>',
      'go()',
      '</script>',
    ].join('\n')

    expect([...findStatementStarts('Example.vue', source)]).toStrictEqual([
      source.indexOf('run()'),
      source.indexOf('go()'),
    ])
  })

  it('counts offsets after a byte order mark', () => {
    expect([
      ...findStatementStarts('example.ts', `${BYTE_ORDER_MARK}run()`),
    ]).toStrictEqual([1])
  })

  it('throws when the text does not parse', () => {
    expect(() => findStatementStarts('example.ts', 'let =')).toThrow(
      'The original text of example.ts does not parse.',
    )
  })
})
