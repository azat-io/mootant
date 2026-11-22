import { realpath, symlink, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userInfo, tmpdir } from 'node:os'
import { realpathSync } from 'node:fs'
import path from 'node:path'

import { createInputFilter } from '../../../adapters/shared/create-input-filter'

/**
 * Root of a project outside the temporary directory.
 */
let root = path.resolve('/projects/shop/packages/app')

/**
 * Work directory of the run.
 */
let work = path.resolve('/work')

/**
 * Directories the current test made.
 */
let made: string[] = []

/**
 * Name of the cache of tsx in the temporary directory for this user, as tsx
 * gives it.
 */
let tsxCache = `tsx-${process.geteuid?.() ?? userInfo().username}`

/**
 * Lists the paths a filter counts.
 *
 * @param filter - Filter to ask.
 * @param files - Absolute paths.
 * @returns The paths that count, in their order.
 */
function listCounted(
  filter: (file: string) => boolean,
  files: string[],
): string[] {
  return files.filter(file => filter(file))
}

describe('createInputFilter', () => {
  afterEach(async () => {
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await Promise.all(
      made
        .splice(0)
        .map(directory => rm(directory, { recursive: true, force: true })),
    )
  })

  it('counts a path wherever it is, the root itself and what lies outside it too', () => {
    let filter = createInputFilter({ directory: work, root })
    let files = [
      root,
      path.join(root, 'src/math.ts'),
      path.resolve('/projects/shop/fixtures/limits.json'),
      path.resolve('/projects/shop/fixtures'),
      path.resolve('/projects/shop/packages/other'),
      path.resolve('/etc/hosts'),
    ]

    expect(listCounted(filter, files)).toStrictEqual(files)
  })

  it('leaves out node_modules directories and what lies in them, inside the root and outside it', () => {
    let filter = createInputFilter({ directory: work, root })

    expect(
      listCounted(filter, [
        path.join(root, 'node_modules'),
        path.join(root, 'node_modules/vitest/package.json'),
        path.resolve('/projects/shop/node_modules'),
        path.resolve('/projects/shop/node_modules/.pnpm/a/index.js'),
        path.join(root, 'node_modules_old/data.json'),
      ]),
    ).toStrictEqual([path.join(root, 'node_modules_old/data.json')])
  })

  it('leaves out the work directory, as given and by its real path', async () => {
    let folder = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-filter-')),
    )
    made.push(folder)
    let target = path.join(folder, 'work')
    let link = path.join(folder, 'link')
    await mkdir(target)
    await symlink(target, link)
    let filter = createInputFilter({
      root: path.join(folder, 'project'),
      directory: link,
    })

    expect(
      listCounted(filter, [
        link,
        path.join(link, 'switched/0.json'),
        target,
        path.join(target, 'plan/a.json'),
        path.join(folder, 'work-other/a.json'),
        path.join(folder, 'project/src/math.ts'),
      ]),
    ).toStrictEqual([
      path.join(folder, 'work-other/a.json'),
      path.join(folder, 'project/src/math.ts'),
    ])
    expect(
      createInputFilter({ directory: work, root })(
        path.join(work, 'switched/0.json'),
      ),
    ).toBe(false)
  })

  it('leaves out the directories that hold the root, but not what lies in them', () => {
    let filter = createInputFilter({ directory: work, root })

    expect(
      listCounted(filter, [
        path.resolve('/projects/shop/packages'),
        path.resolve('/projects/shop'),
        path.resolve('/projects'),
        path.parse(root).root,
        path.resolve('/projects/shop/package.json'),
        path.resolve('/projects/tsconfig.json'),
      ]),
    ).toStrictEqual([
      path.resolve('/projects/shop/package.json'),
      path.resolve('/projects/tsconfig.json'),
    ])
  })

  it('leaves out the directories that hold the root in the other form of the temporary directory, but not what lies in them', () => {
    let temporary = path.resolve(tmpdir())
    let real = realpathSync(temporary)
    let filter = createInputFilter({
      root: path.join(real, 'workspace/packages/app'),
      directory: work,
    })

    expect(
      listCounted(filter, [
        path.join(temporary, 'workspace/packages'),
        path.join(temporary, 'workspace'),
        path.join(real, 'workspace/packages'),
        path.join(real, 'workspace'),
        path.join(temporary, 'workspace/fixtures/limits.json'),
        path.join(real, 'workspace/fixtures/limits.json'),
      ]),
    ).toStrictEqual([
      path.join(temporary, 'workspace/fixtures/limits.json'),
      path.join(real, 'workspace/fixtures/limits.json'),
    ])
  })

  it('leaves out the directories that hold the real path of a root given through a link', async () => {
    let folder = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-filter-')),
    )
    made.push(folder)
    let target = path.join(folder, 'real/app')
    let link = path.join(folder, 'link')
    await mkdir(target, { recursive: true })
    await symlink(target, link)
    let filter = createInputFilter({ directory: work, root: link })

    expect(
      listCounted(filter, [
        path.join(folder, 'real'),
        path.join(folder, 'real/limits.json'),
        path.join(target, 'src/math.ts'),
      ]),
    ).toStrictEqual([
      path.join(folder, 'real/limits.json'),
      path.join(target, 'src/math.ts'),
    ])
  })

  it('counts what lies in the temporary directory of the system, but the cache of tsx there, as given and by its real path', () => {
    let temporary = path.resolve(tmpdir())
    let real = realpathSync(temporary)
    let filter = createInputFilter({ directory: work, root })

    expect(
      listCounted(filter, [
        temporary,
        path.join(temporary, 'shared/limits.json'),
        path.join(real, 'shared/limits.json'),
        path.join(temporary, tsxCache),
        path.join(real, tsxCache, '1234-abc'),
        path.join(temporary, 'tsx'),
        path.join(real, 'tsx/1234-abc'),
        path.join(real, `${tsxCache}-project/limits.json`),
        path.join(real, 'tsx-project/fixtures/limits.json'),
        path.join(real, 'tsx-notes.json'),
        path.join(real, 'tsx2/limits.json'),
      ]),
    ).toStrictEqual([
      temporary,
      path.join(temporary, 'shared/limits.json'),
      path.join(real, 'shared/limits.json'),
      path.join(real, `${tsxCache}-project/limits.json`),
      path.join(real, 'tsx-project/fixtures/limits.json'),
      path.join(real, 'tsx-notes.json'),
      path.join(real, 'tsx2/limits.json'),
    ])
  })

  it('names the cache of tsx by the user name where the process has no user id, as tsx does', () => {
    let temporary = path.resolve(tmpdir())
    let { geteuid } = process
    Reflect.set(process, 'geteuid', undefined)
    let filter: (file: string) => boolean
    try {
      filter = createInputFilter({ directory: work, root })
    } finally {
      Reflect.set(process, 'geteuid', geteuid)
    }

    expect(
      listCounted(filter, [
        path.join(temporary, `tsx-${userInfo().username}`, '1234-abc'),
        path.join(temporary, 'tsx', '1234-abc'),
        path.join(temporary, 'shared/limits.json'),
      ]),
    ).toStrictEqual([path.join(temporary, 'shared/limits.json')])
  })

  it('counts a temporary directory inside the root like what else lies there, and the work directory never', () => {
    vi.stubEnv('TMPDIR', path.join(root, '.tmp'))
    vi.stubEnv('TEMP', path.join(root, '.tmp'))
    vi.stubEnv('TMP', path.join(root, '.tmp'))
    let filter = createInputFilter({
      directory: path.join(root, '.tmp/mootant-work'),
      root,
    })

    expect(
      listCounted(filter, [
        path.join(root, '.tmp/shared/limits.json'),
        path.join(root, '.tmp/mootant-work/switched/0.json'),
        path.join(root, '.tmp', tsxCache, '1234-abc'),
        path.join(root, 'src/math.ts'),
      ]),
    ).toStrictEqual([
      path.join(root, '.tmp/shared/limits.json'),
      path.join(root, 'src/math.ts'),
    ])
  })

  it('keeps the directories it was made with when the code it watches changes them', () => {
    let temporary = path.resolve(tmpdir())
    let filter = createInputFilter({ directory: work, root })
    vi.stubEnv('TMPDIR', path.resolve('/elsewhere'))
    vi.stubEnv('TEMP', path.resolve('/elsewhere'))
    vi.stubEnv('TMP', path.resolve('/elsewhere'))
    let files = [
      path.join(temporary, tsxCache, '1234-abc'),
      path.join(path.resolve('/elsewhere'), tsxCache, '1234-abc'),
      path.resolve('/projects/shop'),
    ]
    vi.spyOn(path, 'relative').mockReturnValue('')
    vi.spyOn(path, 'dirname').mockReturnValue(path.parse(root).root)
    vi.spyOn(path, 'join').mockReturnValue(root)
    let counted = listCounted(filter, files)
    vi.restoreAllMocks()

    expect(counted).toStrictEqual([
      path.join(path.resolve('/elsewhere'), tsxCache, '1234-abc'),
    ])
  })
})
