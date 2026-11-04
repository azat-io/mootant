import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

test('cli scales in a child process', () => {
  let cli = fileURLToPath(new URL('../src/cli.js', import.meta.url))
  let output = execFileSync(process.execPath, [cli, '6', '7'], { encoding: 'utf8' })
  expect(output.trim()).toBe('42')
})
