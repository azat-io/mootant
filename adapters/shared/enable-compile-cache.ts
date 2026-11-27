import path from 'node:path'

/**
 * Folder of the work directory that holds the compile cache of the test
 * processes.
 */
const COMPILE_CACHE_FOLDER = 'compile-cache'

/**
 * Function of `node:module` that turns the compile cache on, which older Node
 * versions lack.
 */
interface CompileCacheApi {
  /**
   * Turns the compile cache of the process on (Node 22.8 and later).
   */
  enableCompileCache?(directory: string): unknown
}

/**
 * Turns on Node's compile cache of a test process, in the `compile-cache`
 * folder of the work directory, so the process takes the code V8 compiled for a
 * module in an earlier process of the run instead of compiling it again. It
 * covers what Node's own loaders compile, not code run through `vm`, such as
 * the modules Vite's module runner evaluates. Node keeps an entry per path and
 * compiles a text again when its size or hash differs, so a switched text never
 * runs the code of the original, and the other way round. It holds for this
 * process only: no variable or flag changes, so the processes the tests start
 * compile as before. `NODE_DISABLE_COMPILE_CACHE=1` turns it off, and a
 * `NODE_COMPILE_CACHE` the process has stays in use. Node 26 reads
 * `NODE_COMPILE_CACHE_PORTABLE` and `NODE_COMPILE_CACHE_READONLY` through
 * `process.env` here, so a test process turns the cache on before it tracks
 * what the code reads. The folder goes with the work directory. Without the
 * function, as on Node 20 and before 22.8, or when Node cannot turn the cache
 * on, the process compiles as before: the cache only saves time.
 *
 * @param api - `node:module`.
 * @param directory - Work directory of the run.
 */
export function enableCompileCache(
  api: CompileCacheApi,
  directory: string,
): void {
  if (typeof api.enableCompileCache !== 'function') {
    return
  }
  try {
    api.enableCompileCache(path.join(directory, COMPILE_CACHE_FOLDER))
  } catch {}
}
