import type { Reporter } from 'vitest/node'

/**
 * Part of a Vitest instance that names the test file of a task.
 */
interface TaskSource {
  /**
   * Tasks Vitest collected, by id.
   */
  state: {
    idMap: ReadonlyMap<string, { file: { filepath: string } }>
  }
}

/**
 * Creates a Vitest reporter that hands what the tests print through `console`
 * to a callback, with the absolute path of the test file that printed it, or
 * null when Vitest does not know the task that printed it.
 *
 * @param onOutput - Receives each console call as text, with its test file.
 * @param getVitest - Gives the Vitest instance whose tasks name the test files,
 *   or null before it exists.
 * @returns Reporter to add to the Vitest instance.
 */
export function createOutputReporter(
  onOutput: (text: string, file: string | null) => void,
  getVitest: () => TaskSource | null,
): Reporter {
  return {
    onUserConsoleLog: log => {
      let task =
        log.taskId === undefined ?
          undefined
        : getVitest()?.state.idMap.get(log.taskId)
      onOutput(log.content, task?.file.filepath ?? null)
    },
  }
}
