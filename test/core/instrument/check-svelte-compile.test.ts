import { describe, expect, it } from 'vitest'
import * as svelte from 'svelte/compiler'

import { checkSvelteCompile } from '../../../core/instrument/check-svelte-compile'

describe('checkSvelteCompile', () => {
  it('accepts a switched component that compiles', () => {
    expect(
      checkSvelteCompile(svelte, {
        original: '<p>{1}</p>',
        switched: '<p>{2}</p>',
        file: 'a.svelte',
      }),
    ).toBeNull()
  })

  it('gives the message of the compiler on one line', () => {
    expect(
      checkSvelteCompile(svelte, {
        switched:
          '<script>let a = $state(1)</script><input bind:value={(b ? a : a)} />',
        original: '<script>let a = $state(1)</script><input bind:value={a} />',
        file: 'a.svelte',
      }),
    ).toBe(
      'Can only bind to an Identifier or MemberExpression or a `{get, set}` pair https://svelte.dev/e/bind_invalid_expression',
    )
  })

  it('lets a component through when the original does not compile either', () => {
    expect(
      checkSvelteCompile(svelte, {
        switched: '<style lang="scss">$size: 1px;</style><p>{</p>',
        original: '<style lang="scss">$size: 1px;</style>',
        file: 'a.svelte',
      }),
    ).toBeNull()
  })
})
