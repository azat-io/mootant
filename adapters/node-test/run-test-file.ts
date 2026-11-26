import type { ChildProcess } from 'node:child_process'

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
 * root, with an out file of its own in the work directory, removed once read.
 * The process gets its unit as a line on file descriptor 3, or, where the
 * session sends none that way (`NodeTestHandle.pipe`), in `MOOTANT_UNIT`; a
 * spare process of the test file, started before, may run it instead. What the
 * process writes goes to the context's `onOutput` with the test file. Once the
 * run is interrupted (`AdapterContext.signal`), no process starts.
 *
 * @param handle - Live session.
 * @param input - Test file, what the process runs, its deadline and a spare
 *   process, if any.
 * @param input.file - Real absolute path of the test file.
 * @param input.deadline - Deadline of the watchdog from what is known of the
 *   process.
 * @param input.spare - Spare process of the test file to run in, if any.
 * @returns What the process left behind.
 * @throws The reason of the context's signal once it aborted.
 */
export async function runTestFile(
  handle: NodeTestHandle,
  input: {
    deadline(watch: ProcessWatch): number
    spare?: ChildProcess
    file: string
  } & Pick<
    NodeTestUnit,
    'expected' | 'hitLimit' | 'mutant' | 'mode' | 'bail' | 'plan'
  >,
): Promise<TestProcessOutcome> {
  let { context, state } = handle
  context.signal?.throwIfAborted()
  let { deadline, spare, file, ...fields } = input
  let directory = path.join(context.workDirectory, 'out')
  mkdirSync(directory, { recursive: true })
  let out = path.join(directory, `${state.count}.jsonl`)
  state.count += 1
  writeFileSync(out, '')
  let unit: NodeTestUnit = {
    ...fields,
    directory: context.workDirectory,
    commonjs: handle.commonjs,
    root: context.root,
    out,
  }
  let { onOutput } = context
  let text = JSON.stringify(unit)
  try {
    return await runTestProcess({
      ...(onOutput !== undefined && {
        onOutput: output => {
          onOutput(output, file)
        },
      }),
      ...(handle.pipe && { unit: text }),
      ...(spare !== undefined && { spare }),
      env: {
        ...handle.env,
        ...(handle.pipe ? { MOOTANT_UNIT_FD: '3' } : { MOOTANT_UNIT: text }),
      },
      args: [...handle.args, file],
      groups: handle.groups,
      node: handle.node,
      cwd: context.root,
      deadline,
      out,
    })
  } finally {
    rmSync(out, { force: true })
  }
}
