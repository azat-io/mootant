import { runInThisContext } from 'node:vm'
import { transformWithOxc } from 'vite'

import { describeValue } from './describe-value'

/**
 * Functions a program may call to record an effect; each call is part of the
 * program's output.
 */
const RECORDERS = [
  'emit',
  'go',
  'grant',
  'notify',
  'persist',
  'reject',
  'render',
  'run',
  'save',
  'show',
  'stop',
  'track',
  'use',
]

/**
 * Runs a program that declares a function `f` on every input, the way the
 * catalog's differential run executes an idiom and each of its mutants (12.6).
 * TypeScript is stripped first. Calls of the recorder functions (`save`, `use`,
 * `run` and the like) are recorded, so the output of an input is the awaited
 * result of `f`, or the message it threw, together with the recorded calls.
 * Every input gets a fresh instance of the program and a clone of its
 * arguments, so no input sees the state or the argument changes of another.
 *
 * @param source - Program text; it must declare a function `f`.
 * @param file - File name, whose extension selects the language.
 * @param inputs - Arguments of `f`, one list per input.
 * @returns Canonical text of the output on each input.
 */
export async function runProgram(
  source: string,
  file: string,
  inputs: unknown[][],
): Promise<string[]> {
  let { code } = await transformWithOxc(source, file)
  let recorders = RECORDERS.map(
    name =>
      `function ${name}(...values) { calls.push([${JSON.stringify(name)}, ...values]) }`,
  )
  let create = runInThisContext(
    [
      '() => {',
      'let calls = []',
      ...recorders,
      code,
      'return async values => {',
      '  let result',
      '  try { result = await f(...values) }',
      "  catch (error) { result = 'thrown: ' + error.message }",
      '  return [result, calls]',
      '}',
      '}',
    ].join('\n'),
  ) as () => (values: unknown[]) => Promise<unknown>
  return Promise.all(
    inputs.map(async input =>
      describeValue(await create()(structuredClone(input))),
    ),
  )
}
