/**
 * Snapshot state of a test file, as much of it as mootant reads.
 */
interface SnapshotState {
  /**
   * The snapshot file if the test file stores snapshots in one, and every file
   * a test compared with `toMatchFileSnapshot`.
   */
  getSnapshotFiles(): string[]

  /**
   * Path of the snapshot file of the test file, whether it exists or not.
   */
  snapshotPath: string
}

/**
 * Lists what a test file depended on in this worker: the ids of every module
 * the worker evaluated, which, with one fresh worker per test file, are the
 * test file, its setup files and everything they imported, dynamic imports
 * included, the files Node's own `require` loaded in the worker, which Vite
 * never sees, such as through `createRequire` or a CommonJS file that requires
 * another, and its snapshot files, the snapshot file of the test file even when
 * it does not exist, so creating it changes the dependencies.
 *
 * @param workerState - Vitest's state of the worker.
 * @param workerState.evaluatedModules - Modules the worker evaluated, by id.
 * @param required - Paths of the modules in `require.cache` of the worker.
 * @param snapshot - Snapshot state of the test file, or undefined without one.
 * @returns Module ids and absolute paths, sorted.
 */
export function listDependencies(
  workerState: { evaluatedModules: { idToModuleMap: Map<string, unknown> } },
  required: Iterable<string>,
  snapshot: SnapshotState | undefined,
): string[] {
  let dependencies = new Set(workerState.evaluatedModules.idToModuleMap.keys())
  for (let file of required) {
    dependencies.add(file)
  }
  if (snapshot !== undefined) {
    dependencies.add(snapshot.snapshotPath)
    for (let file of snapshot.getSnapshotFiles()) {
      dependencies.add(file)
    }
  }
  return [...dependencies].toSorted()
}
