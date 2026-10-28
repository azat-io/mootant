import { compareCodeUnits } from '../compare-code-units'

/**
 * Orders tests and test files by path, then by project, keeping the order of
 * tests within a file.
 *
 * @param left - Entry expected first.
 * @param right - Entry expected second.
 * @param left.project - Name of its project.
 * @param left.file - Absolute path of its test file.
 * @param right.project - Name of its project.
 * @param right.file - Absolute path of its test file.
 * @returns A negative number when `left` sorts first, a positive number when
 *   `right` sorts first and 0 when both are equal.
 */
export function compareDryEntries(
  left: { project: string; file: string },
  right: { project: string; file: string },
): number {
  return (
    compareCodeUnits(left.file, right.file) ||
    compareCodeUnits(left.project, right.project)
  )
}
