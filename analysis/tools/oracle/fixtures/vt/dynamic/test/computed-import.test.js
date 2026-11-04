import { expect, test } from 'vitest'

test('computed import with a template literal', async () => {
  let names = ['plugins']
  let [plugin] = await Promise.all(names.map(name => import(`../src/${name}.js`)))
  expect(plugin.double(21)).toBe(42)
})
