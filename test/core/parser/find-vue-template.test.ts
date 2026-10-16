import { describe, expect, it } from 'vitest'
import { parse } from '@vue/compiler-dom'

import { findVueTemplate } from '../../../core/parser/find-vue-template'

/**
 * Finds the template of a component and gives its inner text.
 *
 * @param source - Text of the component.
 * @returns Text inside the template element, or null without one.
 */
function find(source: string): string | null {
  let template = findVueTemplate(parse(source, { parseMode: 'sfc' }))
  return template ? template.innerLoc!.source : null
}

describe('findVueTemplate', () => {
  it('finds the first top-level template', () => {
    expect(
      find(
        '<script>let a</script>\n<template><p v-if="a">x</p></template>\n<template>y</template>',
      ),
    ).toBe('<p v-if="a">x</p>')
  })

  it('accepts a template that names html', () => {
    expect(find('<template lang="html" functional>x</template>')).toBe('x')
    expect(find('<template :lang="a">x</template>')).toBe('x')
  })

  it('gives null without a template of markup', () => {
    expect(find('<script>let a</script>')).toBeNull()
    expect(find('<template lang="pug">p x</template>')).toBeNull()
    expect(find('<template src="./a.html"></template>')).toBeNull()
    expect(find('<template lang>x</template>')).toBeNull()
  })
})
