import { describe, expect, it } from 'vitest'
import * as vue from '@vue/compiler-dom'

import { checkVueCompile } from '../../../core/instrument/check-vue-compile'

describe('checkVueCompile', () => {
  it('accepts a switched template that compiles', () => {
    expect(
      checkVueCompile(vue, {
        switched: '<template><p>{{ (a ? b : c) as number }}</p></template>',
        original: '<template><p>{{ c as number }}</p></template>',
        file: 'a.vue',
      }),
    ).toBeNull()
  })

  it('gives the message of the compiler for an expression that breaks', () => {
    expect(
      checkVueCompile(vue, {
        switched: '<template>{{ (a +) }}</template>',
        original: '<template>{{ (a) }}</template>',
        file: 'a.vue',
      }),
    ).toMatch(/^Error parsing JavaScript expression/u)
  })

  it('gives the message of the parser for markup that breaks', () => {
    expect(
      checkVueCompile(vue, {
        switched: '<template><p :a="b"c">x</p></template>',
        original: '<template><p :a="b">x</p></template>',
        file: 'a.vue',
      }),
    ).toBe(
      `Attribute name cannot contain U+0022 ("), U+0027 ('), and U+003C (<).`,
    )
  })

  it('accepts a switched file without a template', () => {
    expect(
      checkVueCompile(vue, {
        original: '<template>{{ a }}</template>',
        switched: '<script>let a</script>',
        file: 'a.vue',
      }),
    ).toBeNull()
  })

  it('lets a component through when the original does not compile either', () => {
    for (let original of [
      '<template><p>{{ a b }}</p></template>',
      '<template lang="pug">p {{ a }}</template>',
      '<script>let a</script>',
    ]) {
      expect(
        checkVueCompile(vue, {
          switched: '<template>{{',
          file: 'a.vue',
          original,
        }),
      ).toBeNull()
    }
  })
})
