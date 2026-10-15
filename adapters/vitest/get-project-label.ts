import type { TestProject } from 'vitest/node'

/**
 * Names a Vitest project in messages.
 *
 * @param project - Vitest project.
 * @returns `project "<name>"`, or `the Vitest project` when it has no name.
 */
export function getProjectLabel(project: TestProject): string {
  return project.name === '' ?
      'the Vitest project'
    : `project "${project.name}"`
}
