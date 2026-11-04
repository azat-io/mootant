import { expect, test } from 'vitest'

test('computed import through a variable', async () => {
  let specifier = '../src/' + ['ma', 'th'].join('') + '.js'
  let module = await import(/* @vite-ignore */ specifier)
  expect(module.add(2, 3)).toBe(5)
})
