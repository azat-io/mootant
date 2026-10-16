import { renderToString } from 'vue/server-renderer'
import { expect, it } from 'vitest'
import { createSSRApp } from 'vue'

import Toggle from '../src/toggle.vue'

it('offers to close an open toggle', async () => {
  let html = await renderToString(createSSRApp(Toggle, { open: true }))

  expect(html).toBe('<button>close</button>')
})
