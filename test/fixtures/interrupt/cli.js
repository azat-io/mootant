import { registerHooks } from 'node:module'

/**
 * Runs the command line of mootant from its sources, with tsx loaded by
 * `--import`. Node cannot load the sources of the node:test preload in a test
 * process, so `getPreloadPath` gives the preload built for the test in
 * `MOOTANT_TEST_PRELOAD` instead.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = nextResolve(specifier, context)
    return resolved.url.endsWith('/adapters/node-test/get-preload-path.ts') ?
        {
          url: new URL('get-preload-path.js', import.meta.url).href,
          shortCircuit: true,
        }
      : resolved
  },
})

let { run } = await import('../../../cli/index.ts')

await run()
