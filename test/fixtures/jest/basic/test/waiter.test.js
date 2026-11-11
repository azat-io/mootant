const { wait } = require('../src/waiter')

// The timeout comes before the watchdog's, whose budget is at least 500 ms.
test('settles', async () => {
  await wait(true)
}, 200)
