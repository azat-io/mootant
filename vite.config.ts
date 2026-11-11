import type { StringLiteral } from 'oxc-parser'
import type { Plugin } from 'vitest/config'
import type { BuildOptions } from 'vite'

import { parseSync, Visitor } from 'oxc-parser'
import { defineConfig, build } from 'vite'
import dts from 'vite-plugin-dts'
import path from 'node:path'

/**
 * Add `.js` to the relative module specifiers of an emitted declaration file,
 * so that consumers with `"moduleResolution": "NodeNext"` can resolve them;
 * TypeScript maps `.js` to the sibling `.d.ts` file. Specifiers are found by
 * parsing the file, so text in comments stays as it is.
 *
 * @param filePath - Output path of the declaration file.
 * @param content - Content of the declaration file.
 * @returns Declaration file with explicit extensions on relative specifiers.
 * @throws {Error} When the declaration file does not parse.
 */
function beforeWriteFile(
  filePath: string,
  content: string,
): { content: string } {
  let { program, errors } = parseSync(filePath, content, { lang: 'dts' })
  if (errors.length > 0) {
    throw new Error(`Cannot parse ${filePath}: ${errors[0]!.message}`)
  }
  let sources: StringLiteral[] = []

  /**
   * Collect the specifier of a module declaration or `import()` type.
   *
   * @param node - Node that may have a module specifier.
   * @param node.source - Module specifier of the node, or null.
   */
  function collect(node: { source: StringLiteral | null }): void {
    if (node.source?.value.startsWith('.')) {
      sources.push(node.source)
    }
  }

  let visitor = new Visitor({
    ExportNamedDeclaration: collect,
    ExportAllDeclaration: collect,
    ImportDeclaration: collect,
    TSImportType: collect,
  })
  visitor.visit(program)
  let output = content
  let lastFirst = sources.toSorted((a, b) => b.start - a.start)
  for (let source of lastFirst) {
    if (!source.value.endsWith('.js')) {
      output = `${output.slice(0, source.end - 1)}.js${output.slice(source.end - 1)}`
    }
  }
  return { content: output }
}

/**
 * Check if a module is external.
 *
 * @param id - The module ID.
 * @returns True if the module is external, false otherwise.
 */
function external(id: string): boolean {
  return !id.startsWith('.') && !path.isAbsolute(id)
}

/**
 * Build options of each query that turns an import of a module into its bundled
 * code; the imported module becomes the entry of `lib`. `?inline-cjs` keeps
 * `node:` modules external, because the build otherwise stubs them silently.
 */
const INLINE_BUNDLES: Record<string, BuildOptions> = {
  '?inline-cjs': {
    rolldownOptions: { external: /^node:/u },
    lib: { formats: ['cjs'] },
    minify: false,
  },
  '?inline-script': {
    lib: { name: 'mootantReport', formats: ['iife'] },
    minify: true,
  },
}

/**
 * Bundles a module and its imports into one file and exports the code as a
 * string, for an import that ends with a query of the table. The HTML report
 * embeds its browser client with `?inline-script`, so the package needs no
 * separate asset. The Jest adapter gets the CommonJS code of its child modules
 * with `?inline-cjs`, to write them to disk for Jest and its workers to load.
 *
 * @returns Vite plugin.
 */
function inlineBundle(): Plugin {
  return {
    async load(id) {
      let bundle = Object.entries(INLINE_BUNDLES).find(([query]) =>
        id.endsWith(query),
      )
      if (!bundle) {
        return null
      }
      let [query, options] = bundle
      let entry = id.slice(0, -query.length)
      let result = await build({
        build: { ...options, lib: { ...options.lib, entry }, write: false },
        logLevel: 'silent',
        configFile: false,
      })
      if (!Array.isArray(result) && !('output' in result)) {
        throw new Error(`Cannot bundle ${entry}.`)
      }
      let [chunk] = (Array.isArray(result) ? result[0]! : result).output
      for (let module of chunk.moduleIds) {
        this.addWatchFile(module)
      }
      return `export default ${JSON.stringify(chunk.code)}`
    },
    configureVitest({ defineCacheKeyGenerator }) {
      /**
       * The key of the on-disk module cache holds the text of the entry alone,
       * so it would go on serving a bundle after a change in what the entry
       * imports.
       */
      defineCacheKeyGenerator(({ id }) =>
        Object.keys(INLINE_BUNDLES).some(query => id.endsWith(query)) ?
          false
        : undefined,
      )
    },
    name: 'mootant:inline-bundle',
  }
}

/**
 * Vite configuration.
 */
export default defineConfig({
  build: {
    lib: {
      entry: [
        'adapters/node-test/preload/reporter.ts',
        'adapters/node-test/preload/preload.ts',
        'adapters/node-test/preload/hooks.ts',
        'adapters/node-test/index.ts',
        'adapters/vitest/index.ts',
        'adapters/vitest/runner.ts',
        'adapters/jest/index.ts',
        'core/runtime/index.ts',
        'cli/index.ts',
        'core/index.ts',
      ],
      formats: ['es'],
    },
    rolldownOptions: {
      output: {
        chunkFileNames: '[name]-[hash].js',
        entryFileNames: '[name].js',
        preserveModules: true,
        topLevelVar: false,
        exports: 'auto',
      },
      experimental: {
        attachDebugInfo: 'none',
      },
      external,
    },
    minify: true,
  },
  plugins: [
    inlineBundle(),
    dts({
      include: ['adapters', 'cli', 'core', 'types'],
      copyDtsFiles: true,
      strictOutput: true,
      beforeWriteFile,
    }),
  ],
})
