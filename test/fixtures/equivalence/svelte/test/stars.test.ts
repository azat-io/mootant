import { render } from 'svelte/server'
import { expect, it } from 'vitest'

import Stars, { clampRating } from '../src/stars.svelte'

it('draws a star per point', () => {
  let { body } = render(Stars, { props: { rating: 2 } })

  expect(body).toContain('<span>**</span>')
})

it('caps the rating', () => {
  expect(clampRating(9)).toBe(5)
})
