import { renderToString } from 'vue/server-renderer'
import { expect, it } from 'vitest'
import { createSSRApp } from 'vue'

import Price from '../src/price.vue'

it('shows whole dollars', async () => {
  let html = await renderToString(createSSRApp(Price, { cents: 250 }))

  expect(html).toBe('<s>$2</s>')
})
