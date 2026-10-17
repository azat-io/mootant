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
 * @returns Module without imports; a module whose id is not an absolute path
 *   has no file.
 */
function createNode(id: string | null, transformed = true): FakeNode {
  return {
    file: id?.startsWith('/') === true ? id.replace(/\?.*$/u, '') : null,
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
      createNode('/x/node_modules/y/index.js'),
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
          '/x/node_modules/vitest/index.js',
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
