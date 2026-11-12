/**
 * Lists the major versions of Jest that the rows of both versions run on, the
 * newer first. `MOOTANT_TEST_JEST` narrows them to one, as each per-version
 * project of the Vitest configuration does.
 *
 * @returns Major versions of Jest.
 */
export function getJestMajors(): (29 | 30)[] {
  return ([30, 29] as const).filter(major =>
    [String(major), undefined].includes(process.env['MOOTANT_TEST_JEST']),
  )
}
