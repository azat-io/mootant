import { describe, expect, it } from 'vitest'

import { findAttributeValues } from '../../../core/instrument/find-attribute-values'

/**
 * Byte order mark at the start of a text read as UTF-8.
 */
const BYTE_ORDER_MARK = String.fromCodePoint(0xfe_ff)

describe('findAttributeValues', () => {
  it('finds the quoted values of JSX attributes', () => {
    let source = `x = <a b="c" d={'e'} f=<g /> h i:j='k' />`

    expect([...findAttributeValues('example.tsx', source)]).toStrictEqual([
      source.indexOf('"c"'),
      source.indexOf("'k'"),
    ])
  })

  it('finds the values of every script block of a component', () => {
    let source = [
      '<script lang="tsx">',
      'export let a = <b c="d" />',
      '</script>',
      '<script setup lang="tsx">',
      "let e = <f g='h' />",
      '</script>',
    ].join('\n')

    expect([...findAttributeValues('Example.vue', source)]).toStrictEqual([
      source.indexOf('"d"'),
      source.indexOf("'h'"),
    ])
  })

  it('counts offsets after a byte order mark', () => {
    expect([
      ...findAttributeValues(
        'example.tsx',
        `${BYTE_ORDER_MARK}x = <a b="c" />`,
      ),
    ]).toStrictEqual([10])
  })

  it('throws when the text does not parse', () => {
    expect(() => findAttributeValues('example.tsx', 'let =')).toThrow(
      'The original text of example.tsx does not parse.',
    )
  })
})
