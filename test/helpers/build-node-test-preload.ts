import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { build } from 'vite'
import path from 'node:path'

/**
 * Root of the repository.
 */
let root = path.resolve(import.meta.dirname, '../..')

/**
 * Builds mootant's node:test preload, its module hooks and its reporter from
 * the sources into a new temporary directory, since Node cannot load the
 * sources with their imports without extensions in a test process.
 *
 * @returns Absolute path of the built preload, and a function that removes the
 *   directory.
 */
export async function buildNodeTestPreload(): Promise<{
  remove(): Promise<void>
  path: string
}> {
  let output = await mkdtemp(path.join(tmpdir(), 'mootant-preload-'))
  await build({
    build: {
      lib: {
        entry: [
          'adapters/node-test/preload/reporter.ts',
          'adapters/node-test/preload/preload.ts',
          'adapters/node-test/preload/hooks.ts',
        ],
        formats: ['es'],
      },
      rolldownOptions: {
        output: { entryFileNames: '[name].js', preserveModules: true },
        external: id => !id.startsWith('.') && !path.isAbsolute(id),
      },
      emptyOutDir: false,
      outDir: output,
      minify: false,
    },
    logLevel: 'silent',
    configFile: false,
    root,
  })
  return {
    path: path.join(output, 'adapters/node-test/preload/preload.js'),
    remove: () => rm(output, { recursive: true, force: true }),
  }
}
