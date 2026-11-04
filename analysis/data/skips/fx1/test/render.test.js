import { expect, it } from 'vitest'

import { renderAll } from '../src/render.js'

it('counts the rendered items', () => {
  expect(renderAll([{ render() {} }, { render() {} }])).toBe(2)
})
