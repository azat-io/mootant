import { describe, expect, it } from 'vitest'

import { getTemplateLanguage } from '../../../core/parser/get-template-language'
import { getSourceBlocks } from '../../../core/parser/get-source-blocks'

describe('getTemplateLanguage', () => {
  it.each([
    ['without scripts', 'src/App.vue', '<template><p /></template>'],
    ['with a JavaScript script', 'src/App.vue', '<script>run()</script>'],
    ['with a JSX script', 'src/App.vue', '<script lang="jsx">run()</script>'],
  ])('picks JavaScript for a component %s', (_description, file, source) => {
    expect(getTemplateLanguage(getSourceBlocks(file, source))).toBe('js')
  })

  it.each([
    [
      'with a TypeScript script',
      'src/App.vue',
      '<script setup lang="ts">run()</script>',
    ],
    ['with a TSX script', 'src/App.vue', '<script lang="tsx">run()</script>'],
    [
      'with a TypeScript script after a JavaScript one',
      'src/Card.svelte',
      [
        '<script module>let a = 1</script>',
        '<script lang="ts">let b = 2</script>',
      ].join('\n'),
    ],
  ])('picks TypeScript for a component %s', (_description, file, source) => {
    expect(getTemplateLanguage(getSourceBlocks(file, source))).toBe('ts')
  })
})
