import { expect, it } from 'vitest'

function isActive(id: string): boolean {
  let runtime = (globalThis as { __mootant?: { hit(id: string): boolean } })
    .__mootant
  return runtime?.hit(id) === true
}

it('spins', () => {
  if (isActive('spin')) {
    for (;;) {}
  }
  expect(1).toBe(1)
})

it('crashes', () => {
  if (isActive('crash')) {
    process.kill(process.pid, 'SIGKILL')
  }
  expect(1).toBe(1)
})

it('fails', () => {
  expect(isActive('fail')).toBe(false)
})
