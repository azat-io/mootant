import type { TestProject } from 'vitest/node'

import { writeFile, realpath, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { collectDependencies } from '../../../adapters/vitest/collect-dependencies'

/**
 * Module of a simulated module graph.
 */
interface FakeNode {
  importedModules: Set<FakeNode>
  transformResult: unknown
  file: string | null
  id: string | null
  url: string
}

/**
 * Real path of the temporary project of the tests.
 */
let root = ''

/**
 * Builds a Vite environment over modules. Transforming a module listed in
 * `later` gives it those imports; transforming `failing` fails.
 *
 * @param modules - Modules the module graph knows, by id.
 * @param later - Imports a module gets once transformed, by module.
 * @param failing - Urls whose transform fails.
 * @returns Environment and the urls it transformed.
 */
function createEnvironment(
  modules: Record<string, FakeNode>,
  later = new Map<FakeNode, FakeNode[]>(),
  failing: string[] = [],
): { transformed: string[]; environment: object } {
  let transformed: string[] = []
  let known = new Map(Object.entries(modules))
  return {
    environment: {
      transformRequest: (url: string) => {
        transformed.push(url)
        if (failing.includes(url)) {
          return Promise.reject(new Error('Syntax error'))
        }
        for (let [node, imports] of later) {
          if (node.url === url) {
            node.importedModules = new Set(imports)
          }
        }
        return Promise.resolve({})
      },
      moduleGraph: { getModuleById: (id: string) => known.get(id) },
    },
    transformed,
  }
}

/**
 * Builds a module of a simulated module graph.
 *
 * @param id - Resolved id, or null for a module without one.
 * @param transformed - Whether the module was transformed.
 * @returns Module without imports, whose file is its id without the query or
 *   hash, as Vite sets it for a virtual module too.
 */
function createNode(id: string | null, transformed = true): FakeNode {
  return {
    file: id?.replace(/[#?].*$/u, '') ?? null,
    transformResult: transformed ? {} : null,
    importedModules: new Set(),
    url: `url:${id}`,
    id,
  }
}

/**
 * Builds a project over Vite environments.
 *
 * @param environments - Vite environments, in the order Vite lists them.
 * @returns Project as `collectDependencies` reads it.
 */
function createProject(environments: object[]): TestProject {
  return {
    vite: {
      environments: Object.fromEntries(
        environments.map((environment, index) => [`e${index}`, environment]),
      ),
    },
  } as never
}

describe('collectDependencies', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-deps-')))
    await mkdir(path.join(root, 'src'))
    await mkdir(path.join(root, 'test'))
    await writeFile(
      path.join(root, 'tsconfig.json'),
      '{ "extends": "./base.json" }',
    )
    await writeFile(path.join(root, 'base.json'), '{}')
    await writeFile(path.join(root, 'package.json'), '{}')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('adds evaluated modules, all they reach and their tsconfig files', async () => {
    /**
     * Finds a source file of the project.
     *
     * @param name - Name without the extension.
     * @returns Absolute path of `src/<name>.ts`.
     */
    function source(name: string): string {
      return path.join(root, `src/${name}.ts`)
    }
    let a = createNode(`${source('a')}?v=1`)
    let b = createNode(source('b'))
    let second = createNode(source('second'))
    let lazy = createNode(source('lazy'), false)
    let deep = createNode(source('deep'), false)
    let broken = createNode(source('broken'), false)
    for (let imported of [
      b,
      createNode(null),
      createNode('virtual:x'),
      createNode(path.join(root, 'node_modules/y/index.js'), false),
      lazy,
      broken,
    ]) {
      a.importedModules.add(imported)
    }
    b.importedModules.add(a)
    let first = createEnvironment(
      { [a.id!]: a, [b.id!]: b },
      new Map([[lazy, [deep]]]),
      [broken.url],
    )
    let other = createEnvironment({
      [a.id!]: createNode(source('never')),
      [second.id!]: second,
    })
    let file = path.join(root, 'test/a.test.ts')

    await expect(
      collectDependencies({
        reported: [
          a.id!,
          b.id!,
          `${second.id}#hash`,
          second.id!,
          path.join(root, 'node_modules/vitest/index.js'),
          '\0virtual:module',
          'virtual:other',
        ],
        project: createProject([first.environment, other.environment]),
        tsconfigs: new Map(),
        file,
      }),
    ).resolves.toStrictEqual(
      [
        source('a'),
        source('b'),
        source('broken'),
        source('deep'),
        source('lazy'),
        source('second'),
        path.join(root, 'node_modules/vitest/index.js'),
        path.join(root, 'node_modules/vitest/package.json'),
        path.join(root, 'node_modules/y/index.js'),
        path.join(root, 'node_modules/y/package.json'),
        path.join(root, 'node_modules/package.json'),
        path.join(root, 'package.json'),
        file,
        path.join(root, 'base.json'),
        path.join(root, 'src/tsconfig.json'),
        path.join(root, 'test/tsconfig.json'),
        path.join(root, 'tsconfig.json'),
      ].toSorted(),
    )
    expect(first.transformed.toSorted()).toStrictEqual(
      [lazy.url, broken.url, deep.url].toSorted(),
    )
    expect(other.transformed).toStrictEqual([])
  })

  it.each(['\0virtual:limits', 'virtual:limits'])(
    'follows the virtual module %s without listing it',
    async id => {
      let file = path.join(root, 'test/a.test.ts')
      let test = createNode(file)
      let virtual = createNode(id)
      let watched = createNode(path.join(root, 'limits.json'), false)
      virtual.importedModules.add(watched)
      test.importedModules.add(virtual)
      let { environment, transformed } = createEnvironment({
        [id]: virtual,
        [file]: test,
      })

      await expect(
        collectDependencies({
          project: createProject([environment]),
          tsconfigs: new Map(),
          reported: [file],
          file,
        }),
      ).resolves.toStrictEqual(
        [
          file,
          watched.file!,
          path.join(root, 'base.json'),
          path.join(root, 'test/tsconfig.json'),
          path.join(root, 'tsconfig.json'),
        ].toSorted(),
      )
      expect(transformed).toStrictEqual([watched.url])
    },
  )

  it.each([
    '\0virtual:limits',
    '\0virtual:limits?source=/p/node_modules/pkg/data',
  ])('follows the virtual module %s the worker reported', async id => {
    let file = path.join(root, 'test/a.test.ts')
    let virtual = createNode(id)
    let watched = createNode(path.join(root, 'limits.json'))
    virtual.importedModules.add(watched)
    let { environment, transformed } = createEnvironment({
      [file]: createNode(file),
      [virtual.id!]: virtual,
    })

    await expect(
      collectDependencies({
        project: createProject([environment]),
        reported: [file, virtual.id!],
        tsconfigs: new Map(),
        file,
      }),
    ).resolves.toStrictEqual(
      [
        file,
        watched.file!,
        path.join(root, 'base.json'),
        path.join(root, 'test/tsconfig.json'),
        path.join(root, 'tsconfig.json'),
      ].toSorted(),
    )
    expect(transformed).toStrictEqual([])
  })

  it('follows chains of virtual modules, and lists a module under node_modules without following it', async () => {
    let file = path.join(root, 'test/a.test.ts')
    let test = createNode(file)
    let routes = createNode('virtual:routes')
    let pages = createNode('\0virtual:pages?lang.ts')
    let page = createNode(path.join(root, 'src/page.ts'))
    let library = createNode(path.join(root, 'node_modules/y/index.js'))
    library.importedModules.add(createNode(path.join(root, 'src/hidden.ts')))
    pages.importedModules.add(page)
    routes.importedModules.add(pages)
    routes.importedModules.add(library)
    test.importedModules.add(routes)
    let { environment, transformed } = createEnvironment({ [file]: test })

    await expect(
      collectDependencies({
        project: createProject([environment]),
        tsconfigs: new Map(),
        reported: [file],
        file,
      }),
    ).resolves.toStrictEqual(
      [
        file,
        page.file!,
        library.file!,
        path.join(root, 'node_modules/y/package.json'),
        path.join(root, 'node_modules/package.json'),
        path.join(root, 'package.json'),
        path.join(root, 'base.json'),
        path.join(root, 'src/tsconfig.json'),
        path.join(root, 'test/tsconfig.json'),
        path.join(root, 'tsconfig.json'),
      ].toSorted(),
    )
    expect(transformed).toStrictEqual([])
  })

  it('adds the package.json files of each file under node_modules, and looks up tsconfig files there only for TypeScript files', async () => {
    let file = path.join(root, 'test/a.test.ts')
    let script = path.join(root, 'node_modules/pkg/dist/index.js')
    let source = path.join(root, 'node_modules/kit/src/index.ts')
    let loose = path.join(root, 'node_modules/loose.js')
    let { environment } = createEnvironment({ [file]: createNode(file) })

    await expect(
      collectDependencies({
        reported: [file, script, source, loose],
        project: createProject([environment]),
        tsconfigs: new Map(),
        file,
      }),
    ).resolves.toStrictEqual(
      [
        file,
        script,
        source,
        loose,
        path.join(root, 'node_modules/pkg/dist/package.json'),
        path.join(root, 'node_modules/pkg/package.json'),
        path.join(root, 'node_modules/kit/src/package.json'),
        path.join(root, 'node_modules/kit/package.json'),
        path.join(root, 'node_modules/package.json'),
        path.join(root, 'package.json'),
        path.join(root, 'base.json'),
        path.join(root, 'node_modules/kit/src/tsconfig.json'),
        path.join(root, 'node_modules/kit/tsconfig.json'),
        path.join(root, 'node_modules/tsconfig.json'),
        path.join(root, 'test/tsconfig.json'),
        path.join(root, 'tsconfig.json'),
      ].toSorted(),
    )
  })

  it('adds the manifest of the package of a file that a nested package.json gives its format and imports', async () => {
    let file = path.join(root, 'test/a.test.ts')
    let esm = path.join(root, 'node_modules/@s/p/dist/esm')
    await mkdir(esm, { recursive: true })
    await writeFile(path.join(esm, 'package.json'), '{ "type": "module" }')
    let { environment } = createEnvironment({ [file]: createNode(file) })

    await expect(
      collectDependencies({
        reported: [file, path.join(esm, 'm.js')],
        project: createProject([environment]),
        tsconfigs: new Map(),
        file,
      }),
    ).resolves.toStrictEqual(
      [
        file,
        path.join(esm, 'm.js'),
        path.join(esm, 'package.json'),
        path.join(root, 'node_modules/@s/p/package.json'),
        path.join(root, 'base.json'),
        path.join(root, 'test/tsconfig.json'),
        path.join(root, 'tsconfig.json'),
      ].toSorted(),
    )
  })

  it('visits each module once through cycles of virtual modules', async () => {
    let file = path.join(root, 'test/a.test.ts')
    let test = createNode(file)
    let source = createNode(path.join(root, 'src/a.ts'))
    let virtual = createNode('\0virtual:a', false)
    let lazy = createNode('virtual:b', false)
    let shared = createNode(path.join(root, 'shared.json'), false)
    test.importedModules.add(source)
    source.importedModules.add(virtual)
    source.importedModules.add(lazy)
    virtual.importedModules.add(source)
    virtual.importedModules.add(shared)
    let { environment, transformed } = createEnvironment(
      { [virtual.id!]: virtual, [file]: test },
      new Map([[lazy, [shared, virtual]]]),
    )

    await expect(
      collectDependencies({
        project: createProject([environment]),
        reported: [file, virtual.id!],
        tsconfigs: new Map(),
        file,
      }),
    ).resolves.toStrictEqual(
      [
        file,
        source.file!,
        shared.file!,
        path.join(root, 'base.json'),
        path.join(root, 'src/tsconfig.json'),
        path.join(root, 'test/tsconfig.json'),
        path.join(root, 'tsconfig.json'),
      ].toSorted(),
    )
    expect(transformed.toSorted()).toStrictEqual(
      [lazy.url, shared.url, virtual.url].toSorted(),
    )
  })

  it('gives null without a report', async () => {
    await expect(
      collectDependencies({
        project: createProject([]),
        file: '/p/test/a.test.ts',
        tsconfigs: new Map(),
        reported: undefined,
      }),
    ).resolves.toBeNull()
    await expect(
      collectDependencies({
        project: createProject([]),
        file: '/p/test/a.test.ts',
        tsconfigs: new Map(),
        reported: null,
      }),
    ).resolves.toBeNull()
  })
})
