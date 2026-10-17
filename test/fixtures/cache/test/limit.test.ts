import { expect, it } from 'vitest'

import { clamp } from '../src/limit'
import { double, label } from '../src/size'

it('clamps', () => {
  expect(clamp(150)).toBe(100)
})

it('keeps doubled values positive', () => {
  expect(double(1)).toBeGreaterThan(0)
})

it('labels some values', () => {
  expect(['big', 'small']).toContain(label(5))
})
