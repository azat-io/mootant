import { writeFile, realpath, mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { DrySnapshot } from '../../../types/cache/dry-snapshot'

import { listVariableHashes } from '../../../core/cache/list-variable-hashes'
import { checkDrySnapshot } from '../../../core/cache/check-dry-snapshot'
import { hashProjectTree } from '../../../core/cache/hash-project-tree'
import { hashFiles } from '../../../core/cache/hash-files'

/**
 * Temporary directories of a test.
 */
let directories: string[] = []

/**
 * Makes a temporary directory that the test removes.
 *
 * @param name - Prefix of its name.
 * @returns Real path of the directory.
 */
async function makeDirectory(name: string): Promise<string> {
  let directory = await realpath(await mkdtemp(path.join(tmpdir(), name)))
  directories.push(directory)
  return directory
}

describe('checkDrySnapshot', () => {
  afterEach(async () => {
    await Promise.all(
      directories.map(directory =>
        rm(directory, { recursive: true, force: true }),
      ),
    )
    directories = []
  })

  it('names the first input that changed, cheapest first', async () => {
    let root = await makeDirectory('mootant-snapshot-')
    let outside = await makeDirectory('mootant-outside-')
    let dependency = path.join(outside, 'lib.js')
    let test = path.join(root, 'a.test.ts')
    await writeFile(dependency, 'one')
    await writeFile(test, 'test')
    let environment = { MOOTANT_SNAPSHOT: 'a', PWD: root }
    let hashes = await hashFiles([dependency, test])
    let snapshot = {
      files: [
        [dependency, hashes.get(dependency)!],
        [test, hashes.get(test)!],
      ],
      variables: listVariableHashes(['MOOTANT_SNAPSHOT'], environment),
      tree: (await hashProjectTree(root, []))!.hash,
    } as DrySnapshot
    let tree = vi.fn(() => hashProjectTree(root, []))
    /**
     * Checks the snapshot for a run.
     *
     * @param variables - Variables of its main process.
     * @returns What changed, or null.
     */
    function check(variables: NodeJS.ProcessEnv): Promise<string | null> {
      return checkDrySnapshot(snapshot, { environment: variables, tree, root })
    }

    await expect(
      check({ ...environment, MOOTANT_SNAPSHOT: 'b' }),
    ).resolves.toBe('an environment variable changed')
    await expect(check({ ...environment, NEW: '1' })).resolves.toBe(
      'an environment variable changed',
    )
    expect(tree).not.toHaveBeenCalled()
    await expect(check({ ...environment, PWD: '/' })).resolves.toBeNull()
    expect(tree).toHaveBeenCalledExactlyOnceWith()

    await writeFile(dependency, 'two')

    await expect(check(environment)).resolves.toBe(
      `${path.relative(root, dependency)} changed`,
    )

    await writeFile(dependency, 'one')
    await writeFile(test, 'changed')

    await expect(check(environment)).resolves.toBe('a.test.ts changed')

    await writeFile(test, 'test')
    await writeFile(path.join(root, 'b.test.ts'), 'test')

    await expect(check(environment)).resolves.toBe(
      'a file of the project was added, removed or changed',
    )

    tree.mockResolvedValueOnce(null)

    await expect(check(environment)).resolves.toBe(
      'mootant cannot read every directory and link of the project',
    )
  })

  it('takes a file that is now a pipe for a changed one', async () => {
    let root = await makeDirectory('mootant-snapshot-')
    let dependency = path.join(root, 'data')
    await writeFile(dependency, 'one')
    let hashes = await hashFiles([dependency])
    let snapshot = {
      files: [[dependency, hashes.get(dependency)!]],
      tree: (await hashProjectTree(root, []))!.hash,
      variables: listVariableHashes([], {}),
    } as DrySnapshot
    await rm(dependency)
    /* Cspell:disable-next-line */
    execFileSync('mkfifo', [dependency])

    await expect(
      checkDrySnapshot(snapshot, {
        tree: () => hashProjectTree(root, []),
        environment: {},
        root,
      }),
    ).resolves.toBe('data changed')
  })
})
