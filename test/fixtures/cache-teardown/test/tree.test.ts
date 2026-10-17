import { readdirSync, promises } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

import { countFiles } from '../src/tree'

it('counts the text files of a tree', async () => {
  let names = readdirSync(fileURLToPath(new URL('tree', import.meta.url)), {
    recursive: true,
  }) as string[]
  let glob = Reflect.get(promises, 'glob') as
    ((pattern: string) => AsyncIterable<string>) | undefined
  if (glob) {
    process.chdir(fileURLToPath(new URL('..', import.meta.url)))
    let matches: string[] = []
    for await (let match of glob('test/tree/**/*.txt')) {
      matches.push(match)
    }
    expect(matches.length).toBeGreaterThan(0)
    expect(countFiles(matches)).toBe(matches.length)
  }
  expect(countFiles(names)).toBe(
    names.filter(name => name.includes('.')).length,
  )
})
