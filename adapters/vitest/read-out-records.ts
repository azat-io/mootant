import type { Vitest } from 'vitest/node'

import type { VitestOutRecord, VitestOutLine } from './types/vitest-worker'
import type { StrayDecisions } from './types/stray-decisions'

import { readOutFile } from '../shared/read-out-file'
import { readStrays } from './read-strays'

/**
 * Reads the records a worker wrote in one out file (`readOutFile`), with the
 * first lines of only those unhandled errors that count (`readStrays`); a late
 * error that does not count leaves no record. An end record tells whether
 * `onUnhandledError` of the root configuration decided an unhandled error of
 * the file.
 *
 * @param vitest - Vitest instance of the session.
 * @param file - Absolute path of the out file.
 * @param decisions - Decisions of the unhandled errors of the run, which
 *   receives those of this file.
 * @returns Records in the order they were written.
 */
export function readOutRecords(
  vitest: Vitest,
  file: string,
  decisions: StrayDecisions,
): VitestOutRecord[] {
  let known = decisions.get(file) ?? new Map<number, string | null>()
  decisions.set(file, known)
  let lines = readOutFile(file) as VitestOutLine[]
  let filtered =
    !vitest.config.dangerouslyIgnoreUnhandledErrors &&
    Boolean(vitest.state.onUnhandledError) &&
    lines.some(
      line =>
        line.kind === 'late' ||
        (line.kind === 'end' ?
          line.strays.length > 0
        : line.tries.some(facts => facts.strays.length > 0)),
    )
  return lines.flatMap((line): VitestOutRecord[] => {
    if (line.kind === 'test') {
      return [
        {
          ...line,
          tries: line.tries.map(facts => ({
            ...facts,
            strays: readStrays(vitest, facts.strays, known),
          })),
        },
      ]
    }
    if (line.kind === 'end') {
      return [
        { ...line, strays: readStrays(vitest, line.strays, known), filtered },
      ]
    }
    let { stray, ...late } = line
    return readStrays(vitest, [stray], known).map(message => ({
      ...late,
      message,
    }))
  })
}
