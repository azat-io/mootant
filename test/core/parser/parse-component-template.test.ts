import { describe, expect, it } from 'vitest'
import * as svelte from 'svelte/compiler'
import * as vue from '@vue/compiler-dom'

import { parseComponentTemplate } from '../../../core/parser/parse-component-template'

describe('parseComponentTemplate', () => {
  it('reads the template with the compiler of the framework', () => {
    let compilers = { svelte, vue }

    expect(
      parseComponentTemplate(compilers, {
        source: '<p>{a + 1}</p>',
        file: 'a.svelte',
        lang: 'js',
      }).kind,
    ).toBe('parsed')
    expect(
      parseComponentTemplate(compilers, {
        source: '<template>{{ a + 1 }}</template>',
        file: 'a.vue',
        lang: 'js',
      }).kind,
    ).toBe('parsed')
  })

  it('gives nothing without the compiler or for other files', () => {
    let compilers = { svelte: null, vue: null }

    for (let file of ['a.svelte', 'a.vue', 'a.astro', 'a.ts']) {
      expect(
        parseComponentTemplate(compilers, { source: '', lang: 'js', file }),
      ).toStrictEqual({ kind: 'empty' })
    }
  })
})
