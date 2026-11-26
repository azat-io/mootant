/**
 * Lists the files Jest's runtime of a unit read as the sources of the modules
 * of its vm, the setup files and the parts of the test framework that run in
 * the vm among them: the keys of the file cache the runtime fills for one test
 * file and empties at its teardown, `fileCache` on Jest 30, `_cacheFS` and
 * `_cacheFSBuffer` on Jest 29.7. A runtime that keeps none of them, such as a
 * project's own, gives none.
 *
 * @param runtime - Jest's runtime of the unit, as Jest hands it to the test
 *   framework.
 * @returns Absolute paths.
 */
export function listRuntimeFiles(runtime: unknown): Set<string> {
  let files = new Set<string>()
  if (typeof runtime !== 'object' || runtime === null) {
    return files
  }
  let cache: unknown = Reflect.get(runtime, 'fileCache')
  let maps: unknown[] = [
    Reflect.get(runtime, '_cacheFSBuffer'),
    Reflect.get(runtime, '_cacheFS'),
  ]
  if (typeof cache === 'object' && cache !== null) {
    maps.push(Reflect.get(cache, 'buffers'), Reflect.get(cache, 'strings'))
  }
  for (let map of maps) {
    if (map instanceof Map) {
      for (let key of map.keys()) {
        if (typeof key === 'string') {
          files.add(key)
        }
      }
    }
  }
  return files
}
