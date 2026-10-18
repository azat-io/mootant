import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { NodeTestRecord } from '../../../../adapters/node-test/types/node-test-record'

import { createSourceSwitcher } from '../../../../adapters/node-test/preload/create-source-switcher'

let directory = ''

/**
 * Writes a switch plan with one switched file.
 *
 * @param original - Original text of `/src/a.js`.
 * @param switched - Its switched text.
 * @returns Path of the plan.
 */
async function writePlan(original: string, switched: string): Promise<string> {
  directory = await mkdtemp(path.join(tmpdir(), 'mootant-switcher-'))
  let entry = path.join(directory, '0.json')
  await writeFile(
    entry,
    JSON.stringify({ file: '/src/a.js', original, switched }),
  )
  let plan = path.join(directory, 'plan.json')
  await writeFile(plan, JSON.stringify({ '/src/a.js': entry }))
  return plan
}

/**
 * Byte order mark as it appears at the start of a text read as UTF-8.
 */
let mark = String.fromCodePoint(0xfe_ff)

let served = '\n;globalThis[Symbol.for("mootant.served")]?.("/src/a.js")'
let loaded = '\n;globalThis[Symbol.for("mootant.loaded")]?.()'

describe('createSourceSwitcher', () => {
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('serves the switched text with a call that reports it', async () => {
    let records: NodeTestRecord[] = []
    let switcher = createSourceSwitcher({
      write: record => {
        records.push(record)
      },
      plan: await writePlan('a + b', 'a - b'),
      main: '/test/a.test.js',
    })

    expect(switcher.has('/src/a.js')).toBe(true)
    expect(switcher.has('/test/a.test.js')).toBe(true)
    expect(switcher.has('/src/b.js')).toBe(false)
    expect(switcher.switch('/src/a.js', 'a + b')).toBe(`a - b${served}`)
    expect(switcher.switch('/src/a.js', `a - b${served}`)).toBeNull()
    expect(switcher.switch('/src/b.js', 'x')).toBeNull()
    expect(records).toStrictEqual([])
  })

  it('serves the switched text without the byte order mark the loader dropped', async () => {
    let switcher = createSourceSwitcher({
      plan: await writePlan(`${mark}a + b`, `${mark}a - b`),
      main: '/test/a.test.js',
      write: () => {},
    })

    expect(switcher.switch('/src/a.js', 'a + b')).toBe(`a - b${served}`)
  })

  it('reports a changed text as mismatched once and keeps it', async () => {
    let records: NodeTestRecord[] = []
    let switcher = createSourceSwitcher({
      write: record => {
        records.push(record)
      },
      plan: await writePlan('a + b', 'a - b'),
      main: '/test/a.test.js',
    })

    expect(switcher.switch('/src/a.js', 'compiled')).toBeNull()
    expect(switcher.switch('/src/a.js', 'compiled')).toBeNull()
    expect(records).toStrictEqual([{ kind: 'mismatched', file: '/src/a.js' }])
  })

  it('appends the call of the end of evaluation to the test file once', async () => {
    let switcher = createSourceSwitcher({
      plan: await writePlan('a + b', 'a - b'),
      main: '/src/a.js',
      write: () => {},
    })

    expect(switcher.switch('/src/a.js', 'a + b')).toBe(
      `a - b${served}${loaded}`,
    )
    expect(switcher.switch('/src/a.js', 'other')).toBe(`other${loaded}`)
    expect(switcher.switch('/src/a.js', `other${loaded}`)).toBeNull()
  })
})
