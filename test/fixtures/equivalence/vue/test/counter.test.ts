import { renderToString } from 'vue/server-renderer'
import { expect, it, vi } from 'vitest'
import { createSSRApp } from 'vue'

import Counter from '../src/counter.vue'

it('adds one by default', async () => {
  let html = await renderToString(createSSRApp(Counter, { count: 2 }))

  expect(html).toBe('<output>3</output>')
})

it('reports the limit', async () => {
  let onLimit = vi.fn()
  await renderToString(createSSRApp(Counter, { count: 9, step: 2, onLimit }))

  expect(onLimit).toHaveBeenCalledWith(11)
})
