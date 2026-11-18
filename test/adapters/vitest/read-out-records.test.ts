import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { StrayDecisions } from '../../../adapters/vitest/types/stray-decisions'
import type { VitestOutLine } from '../../../adapters/vitest/types/vitest-worker'

import { readOutRecords } from '../../../adapters/vitest/read-out-records'
import { encodeStray } from '../../../adapters/vitest/worker/encode-stray'
import { createTryFacts } from '../../helpers/create-try-facts'

/**
 * End of a unit without unhandled errors, as a worker writes it.
 */
const END = {
  kind: 'end' as const,
  dependencies: null,
  concurrent: false,
  abandoned: false,
  loadDuration: 1,
  environment: [],
  loadError: null,
  hookError: null,
  reached: false,
  modified: [],
  duration: 2,
  covers: [],
  booted: 0,
  hits: 0,
  unit: 0,
}

/**
 * Writes the lines of an out file in a fresh directory, with a line cut off at
 * the end.
 *
 * @param lines - Lines as a worker writes them.
 * @returns Absolute path of the out file.
 */
async function writeLines(lines: VitestOutLine[]): Promise<string> {
  let directory = await mkdtemp(path.join(tmpdir(), 'mootant-records-'))
  let file = path.join(directory, 'a-0.jsonl')
  await writeFile(
    file,
    `${lines.map(line => JSON.stringify(line)).join('\n')}\n{"kind":`,
  )
  return file
}

/**
 * Builds the Vitest instance of a session as `readOutRecords` reads it.
 *
 * @param onUnhandledError - `onUnhandledError` of the root configuration, if
 *   any.
 * @param ignored - Whether the root configuration sets
 *   `dangerouslyIgnoreUnhandledErrors`.
 * @returns Vitest instance.
 */
function createVitest(
  onUnhandledError?: (error: { message: string }) => boolean,
  ignored = false,
): never {
  return {
    config: { dangerouslyIgnoreUnhandledErrors: ignored },
    state: { onUnhandledError },
  } as never
}

describe('readOutRecords', () => {
  it('reads the records of an out file with only the unhandled errors that count, deciding each error once', async () => {
    let dropped = encodeStray(
      { message: 'ResizeObserver loop' },
      'Uncaught Exception',
      0,
    )
    let kept = encodeStray({ message: 'kept' }, 'Unhandled Rejection', 1)
    let file = await writeLines([
      {
        tries: [
          { ...createTryFacts(), strays: [dropped, kept] },
          { ...createTryFacts({ test: 't2' }), strays: [kept] },
        ],
        kind: 'test',
        name: 't1',
        line: 1,
      },
      { stray: dropped, kind: 'late', mutant: 'm', test: 't1' },
      { kind: 'late', mutant: 'm', stray: kept, test: 't1' },
      { ...END, strays: [dropped, kept] },
    ])
    let filter = vi.fn(
      (error: { message: string }) => error.message !== 'ResizeObserver loop',
    )
    let decisions: StrayDecisions = new Map()
    let records = [
      {
        tries: [
          createTryFacts({ strays: ['kept'] }),
          createTryFacts({ strays: ['kept'], test: 't2' }),
        ],
        kind: 'test',
        name: 't1',
        line: 1,
      },
      { message: 'kept', kind: 'late', mutant: 'm', test: 't1' },
      { ...END, strays: ['kept'], filtered: true },
    ]

    expect(readOutRecords(createVitest(filter), file, decisions)).toStrictEqual(
      records,
    )
    expect(readOutRecords(createVitest(filter), file, decisions)).toStrictEqual(
      records,
    )
    /**
     * Copies of an error and later reads reuse its decision.
     */
    expect(filter).toHaveBeenCalledTimes(2)
    expect(decisions).toStrictEqual(
      new Map([
        [
          file,
          new Map([
            [1, 'kept'],
            [0, null],
          ]),
        ],
      ]),
    )

    await rm(path.dirname(file), { recursive: true })
  })

  it('tells that the callback decided an unhandled error of the unit only when it did', async () => {
    let stray = encodeStray({ message: 'boom' }, 'Uncaught Exception', 0)
    let clean = await writeLines([
      {
        tries: [{ ...createTryFacts(), strays: [] }],
        kind: 'test',
        name: 't1',
        line: 1,
      },
      { ...END, strays: [] },
    ])
    let tried = await writeLines([
      {
        tries: [{ ...createTryFacts(), strays: [stray] }],
        kind: 'test',
        name: 't1',
        line: 1,
      },
      { ...END, strays: [] },
    ])
    let late = await writeLines([
      { ...END, strays: [] },
      { kind: 'late', mutant: 'm', test: 't1', stray },
    ])
    let filter = vi.fn(() => true)

    /**
     * Reads the end record of an out file.
     *
     * @param file - Absolute path of the out file.
     * @param vitest - Vitest instance of the session.
     * @returns End record.
     */
    function readEnd(file: string, vitest: never): unknown {
      return readOutRecords(vitest, file, new Map()).find(
        record => record.kind === 'end',
      )
    }

    expect(readEnd(clean, createVitest(filter))).toMatchObject({
      filtered: false,
    })
    expect(readEnd(tried, createVitest(filter))).toMatchObject({
      filtered: true,
    })
    expect(readEnd(late, createVitest(filter))).toMatchObject({
      filtered: true,
    })
    /**
     * Without a callback, or when every error is ignored, it decides nothing.
     */
    expect(readEnd(tried, createVitest())).toMatchObject({ filtered: false })
    expect(readEnd(tried, createVitest(filter, true))).toMatchObject({
      filtered: false,
    })

    await Promise.all(
      [clean, tried, late].map(file =>
        rm(path.dirname(file), { recursive: true }),
      ),
    )
  })
})
