import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { readTestImports } from '../../../core/run/read-test-imports'

describe('readTestImports', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-imports-'))
    await mkdir(path.join(directory, 'test'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('resolves relative imports, re-exports and plain dynamic imports', async () => {
    let file = path.join(directory, 'test', 'a.test.ts')
    await writeFile(
      file,
      [
        "import { a } from '../src/a.js'",
        "import type { B } from '../src/b'",
        "import { type C, c } from '../src/c'",
        "import '../src/d?raw'",
        "import { describe } from 'vitest'",
        "import { e } from '#alias/e'",
        "export { f } from './f'",
        "export type { G } from './g'",
        "export * from '..'",
        "await import('../src/h')",
        'await import(`../src/i`)',
        // eslint-disable-next-line no-template-curly-in-string
        'await import(`../src/${name}`)',
        'await import(name)',
        "import { a as again } from '../src/a.js'",
        '',
      ].join('\n'),
    )

    let imports = await readTestImports([file, file])
    let source = path.join(directory, 'src')

    expect([...imports.keys()]).toStrictEqual([file])
    expect(imports.get(file)).toStrictEqual([
      path.join(source, 'a.js'),
      path.join(source, 'c'),
      path.join(source, 'd'),
      path.join(directory, 'test', 'f'),
      directory,
      path.join(source, 'h'),
      path.join(source, 'i'),
    ])
  })

  it('reads nothing from files it cannot read or parse', async () => {
    let missing = path.join(directory, 'test', 'missing.test.ts')
    let component = path.join(directory, 'test', 'a.test.vue')
    await writeFile(component, "import a from './a'\n")

    let imports = await readTestImports([missing, component])

    expect(imports).toStrictEqual(
      new Map([
        [component, []],
        [missing, []],
      ]),
    )
  })
})
