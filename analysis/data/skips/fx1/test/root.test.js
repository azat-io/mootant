import { expect, it } from 'vitest'

import { findRoot } from '../src/root.js'

it('walks up to the root', () => {
  let root = { isRoot: true, parent: null }
  let child = { isRoot: false, parent: root }
  expect(findRoot({ isRoot: false, parent: child })).toBe(root)
  expect(findRoot(root)).toBe(root)
})
