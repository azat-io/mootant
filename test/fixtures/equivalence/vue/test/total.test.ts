import { renderToString } from 'vue/server-renderer'
import { expect, it } from 'vitest'
import { createSSRApp } from 'vue'

import Total, { sum } from '../src/total.vue'

it('sums the values', async () => {
  let html = await renderToString(createSSRApp(Total, { values: [1, 2] }))

  expect(html).toBe('<b>3</b>')
})

it('sums nothing to zero', () => {
  expect(sum([])).toBe(0)
})
