test('sees the worker id and what global setup set', () => {
  console.log(`worker id ${process.env.JEST_WORKER_ID}`)
  expect(['1', '2']).toContain(process.env.JEST_WORKER_ID)
  expect(process.env.SET_BY_GLOBAL_SETUP).toBe('yes')
})
