import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readProjectName } from '../../../cli/html/read-project-name'

describe('readProjectName', () => {
  let root = ''

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'mootant-project-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads the name of package.json', async () => {
    await writeFile(path.join(root, 'package.json'), '{"name":"@acme/cart"}')

    expect(readProjectName(root)).toBe('@acme/cart')
  })

  it.each([
    ['{"version":"1.0.0"}'],
    ['{"name":""}'],
    ['{"name":1}'],
    ['null'],
    ['{'],
  ])('falls back to the directory name for %s', async manifest => {
    await writeFile(path.join(root, 'package.json'), manifest)

    expect(readProjectName(root)).toBe(path.basename(root))
  })

  it('falls back to the directory name without package.json', () => {
    expect(readProjectName(root)).toBe(path.basename(root))
  })
})
