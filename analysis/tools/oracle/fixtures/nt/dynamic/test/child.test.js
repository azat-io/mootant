import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

test('cli scales in a child process', () => {
  let cli = fileURLToPath(new URL('../src/cli.js', import.meta.url))
  let output = execFileSync(process.execPath, [cli, '6', '7'], { encoding: 'utf8' })
  assert.equal(output.trim(), '42')
})
