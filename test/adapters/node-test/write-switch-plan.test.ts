import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { readFileSync, existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { writeSwitchPlan } from '../../../adapters/node-test/write-switch-plan'

describe('writeSwitchPlan', () => {
  it('writes each switched file and the index into an emptied directory', async () => {
    let root = await mkdtemp(path.join(tmpdir(), 'mootant-plan-'))
    let directory = path.join(root, 'switched')
    await mkdir(directory)
    await writeFile(path.join(directory, 'old.json'), '')
    let entry = { file: '/p/a.js', switched: 'b', original: 'a' }

    let plan = writeSwitchPlan(directory, [entry])

    expect(plan).toBe(path.join(directory, 'plan.json'))
    expect(JSON.parse(readFileSync(plan, 'utf8'))).toStrictEqual({
      '/p/a.js': path.join(directory, '0.json'),
    })
    expect(
      JSON.parse(readFileSync(path.join(directory, '0.json'), 'utf8')),
    ).toStrictEqual(entry)
    expect(existsSync(path.join(directory, 'old.json'))).toBe(false)

    expect(
      JSON.parse(readFileSync(writeSwitchPlan(directory, []), 'utf8')),
    ).toStrictEqual({})

    await rm(root, { recursive: true })
  })
})
