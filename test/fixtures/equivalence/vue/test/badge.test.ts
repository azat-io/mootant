import { renderToString } from 'vue/server-renderer'
import { expect, it } from 'vitest'
import { createSSRApp } from 'vue'

import Badge from '../src/badge.vue'

it('cuts a long label', async () => {
  let html = await renderToString(createSSRApp(Badge, { label: 'mutant' }))

  expect(html).toBe('<span>mut</span>')
})
