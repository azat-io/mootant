import { test } from 'node:test'

import { renderCard } from '../src/card.js'

test('renders a card', t => {
  t.assert.snapshot(renderCard({ name: 'Ann', admin: true }))
})
