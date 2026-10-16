import { render } from 'svelte/server'
import { expect, it } from 'vitest'

import Badge from '../src/badge.svelte'

it('shows the count', () => {
  let { body } = render(Badge, { props: { count: 120 } })

  expect(body).toContain('99+')
  expect(body).toContain('class="many"')
})

it('shows the label without a count', () => {
  let { body } = render(Badge, { props: { label: 'none', count: 0 } })

  expect(body).toContain('<em>NONE</em>')
})
