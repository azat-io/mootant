let { backoff, retries } = await import('../src/settings.mjs')

test('reads what top-level await loaded', () => {
  expect(retries()).toBe(3)
})

test('backs off', () => {
  expect(backoff(2)).toBe(400)
})
