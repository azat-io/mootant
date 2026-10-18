import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import type { TestProcessOutcome } from './types/test-process-outcome'
import type { NodeTestHandle } from './types/node-test-handle'
import type { NodeTestUnit } from './types/node-test-unit'
import type { ProcessWatch } from './types/process-watch'

import { runTestProcess } from './run-test-process'

/**
 * Runs one test file in a test process of the session (`runTestProcess`):
 * mootant's preload and the project's flags, then the test file, in the project
 * root, with the unit in `MOOTANT_UNIT` and an out file of its own in the work
 * directory, removed once read. What the process writes goes to the context's
 * `onOutput` with the test file. The end of the process is reported to the
 * context's `onUnitEnd`.
 *
 * @param handle - Live session.
 * @param input - Test file, what the process runs and its deadline.
 * @param input.file - Real absolute path of the test file.
 * @param input.deadline - Deadline of the watchdog from what is known of the
 *   process.
 * @returns What the process left behind.
 */
export async function runTestFile(
  handle: NodeTestHandle,
  input: { deadline(watch: ProcessWatch): number; file: string } & Pick<
    NodeTestUnit,
    'expected' | 'hitLimit' | 'mutant' | 'mode' | 'bail' | 'plan'
  >,
): Promise<TestProcessOutcome> {
  let { context, state } = handle
  let { deadline, file, ...fields } = input
  let directory = path.join(context.workDirectory, 'out')
  mkdirSync(directory, { recursive: true })
  let out = path.join(directory, `${state.count}.jsonl`)
  state.count += 1
  writeFileSync(out, '')
  let unit: NodeTestUnit = { ...fields, root: context.root, out }
  let { onOutput } = context
  try {
    return await runTestProcess({
      ...(onOutput !== undefined && {
        onOutput: text => {
          onOutput(text, file)
        },
      }),
      env: { ...handle.env, MOOTANT_UNIT: JSON.stringify(unit) },
      args: [...handle.args, file],
      node: handle.node,
      cwd: context.root,
      deadline,
      out,
    })
  } finally {
    rmSync(out, { force: true })
    context.onUnitEnd?.()
  }
}
