import {
  writeFile,
  realpath,
  symlink,
  mkdtemp,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestProject } from '../../../adapters/jest/types/jest-project'

import { listUnservedFiles } from '../../../adapters/jest/list-unserved-files'

/**
 * The reason the core's warning ends with.
 */
const REASON =
  "the Jest configuration's transformIgnorePatterns keeps it out of the transform"

/**
 * Real path of the temporary directory of the current test.
 */
let directory = ''

/**
 * Builds a kept project with the given patterns.
 *
 * @param transformIgnorePatterns - Expressions of the files the project leaves
 *   out of Jest's transform.
 * @returns A nameless project with those patterns.
 */
function createProject(transformIgnorePatterns: string[]): JestProject {
  return {
    config: { transformIgnorePatterns } as JestProject['config'],
    name: '',
  }
}

/**
 * Builds a switched file of no interest but its path.
 *
 * @param file - Absolute path of the file.
 * @returns The switched file.
 */
function createFile(file: string): {
  original: string
  switched: string
  file: string
} {
  return { original: '', switched: '', file }
}

describe('listUnservedFiles', () => {
  beforeEach(async () => {
    directory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-unserved-')),
    )
    await mkdir(path.join(directory, 'generated'))
    await writeFile(path.join(directory, 'generated/words.js'), '')
    await writeFile(path.join(directory, 'math.js'), '')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('names a file every project keeps out, with the reason, in the order given', () => {
    let words = path.join(directory, 'generated/words.js')
    let math = path.join(directory, 'math.js')

    expect(
      listUnservedFiles(
        [createProject(['/generated/']), createProject(['words'])],
        [createFile(math), createFile(words)],
      ),
    ).toStrictEqual([{ reason: REASON, file: words }])
    expect(
      listUnservedFiles(
        [createProject(['/generated/', String.raw`math\.js`])],
        [createFile(math), createFile(words)],
      ),
    ).toStrictEqual([
      { reason: REASON, file: math },
      { reason: REASON, file: words },
    ])
  })

  it('leaves out a file one project transforms', () => {
    expect(
      listUnservedFiles(
        [createProject(['/generated/']), createProject(['/node_modules/'])],
        [createFile(path.join(directory, 'generated/words.js'))],
      ),
    ).toStrictEqual([])
  })

  it('leaves out every file for a project with no patterns', () => {
    expect(
      listUnservedFiles(
        [createProject([])],
        [createFile(path.join(directory, 'generated/words.js'))],
      ),
    ).toStrictEqual([])
  })

  it('joins the patterns of a project as Jest does, with no flags', () => {
    let words = path.join(directory, 'generated/words.js')

    expect(
      listUnservedFiles(
        [createProject(['/nothing/', String.raw`words\.js$`])],
        [createFile(words)],
      ),
    ).toStrictEqual([{ reason: REASON, file: words }])
    expect(
      listUnservedFiles([createProject(['/GENERATED/'])], [createFile(words)]),
    ).toStrictEqual([])
    expect(
      listUnservedFiles(
        [createProject([String.raw`/node_modules/(?!\@scope)`, '/generated/'])],
        [createFile(words)],
      ),
    ).toStrictEqual([{ reason: REASON, file: words }])
  })

  it('matches the real path of a file reached through a link, and names it as given', async () => {
    await symlink(
      path.join(directory, 'generated'),
      path.join(directory, 'linked'),
    )
    let linked = path.join(directory, 'linked/words.js')

    expect(
      listUnservedFiles([createProject(['/generated/'])], [createFile(linked)]),
    ).toStrictEqual([{ reason: REASON, file: linked }])
    expect(
      listUnservedFiles([createProject(['/linked/'])], [createFile(linked)]),
    ).toStrictEqual([])
  })
})
