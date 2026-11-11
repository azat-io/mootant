test('logs, then waits for a lock when asked', () => {
  console.log('waiting for the lock')
  while (process.env.LOGGING_HANG === '1') {}
})
