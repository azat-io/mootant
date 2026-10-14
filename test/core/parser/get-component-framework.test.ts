import { describe, expect, it } from 'vitest'

import { getComponentFramework } from '../../../core/parser/get-component-framework'

describe('getComponentFramework', () => {
  it.each([
    ['src/App.vue', 'vue'],
    ['src/Card.SVELTE', 'svelte'],
    ['src/pages/index.astro', 'astro'],
    [String.raw`C:\project\Page.Astro`, 'astro'],
  ])('names the framework of %s', (file, framework) => {
    expect(getComponentFramework(file)).toBe(framework)
  })

  it.each(['src/a.ts', 'src/vue', 'src/a.vue.bak', 'src/a.svelte.ts'])(
    'returns null for %s',
    file => {
      expect(getComponentFramework(file)).toBeNull()
    },
  )
})
