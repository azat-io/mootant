const { existsSync, writeFileSync, rmSync } = require('node:fs')
const path = require('node:path')

const { leaves, scale } = require('../src/interval-leaves')

let stop = path.join(__dirname, 'interval-stop')
let tick = path.join(__dirname, 'interval-tick')

/**
 * Waits a little.
 *
 * @returns A promise that resolves after 30 milliseconds.
 */
function wait() {
  return new Promise(resolve => {
    setTimeout(resolve, 30)
  })
}

// What ticks ends when another run asks, so a run with no mutant after a failure
// finds nothing ticking.
test('nothing ticks in the background, and under the mutant it starts to', async () => {
  expect(scale(2)).toBeGreaterThan(0)
  rmSync(tick, { force: true })
  await wait()
  let ticking = existsSync(tick)
  if (ticking) {
    writeFileSync(stop, '')
    await wait()
    rmSync(tick, { force: true })
    rmSync(stop, { force: true })
  }
  expect(ticking).toBe(false)
  if (leaves()) {
    let timer = setInterval(() => {
      if (existsSync(stop)) {
        clearInterval(timer)
      } else {
        writeFileSync(tick, '')
      }
    }, 5)
  }
})
