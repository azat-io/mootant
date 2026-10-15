/**
 * Names a test file as the run plans it: a test file that several projects of
 * the test runner include is a separate test file in each. Without a project
 * the key is the path itself.
 *
 * @param entry - Test file or test with its path and project.
 * @param entry.project - Name of the project, or an empty string.
 * @param entry.file - Absolute path of the test file.
 * @returns The path, followed by a NUL character and the project name when
 *   there is one.
 */
export function getTestFileKey(entry: {
  project: string
  file: string
}): string {
  return entry.project === '' ? entry.file : `${entry.file}\0${entry.project}`
}
