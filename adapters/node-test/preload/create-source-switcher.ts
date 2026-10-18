import { readFileSync } from 'node:fs'

import type { SwitchedFile } from '../../../types/adapter/switched-file'
import type { NodeTestRecord } from '../types/node-test-record'
import type { SourceSwitcher } from '../types/source-switcher'
import type { NodeTestPlan } from '../types/node-test-plan'

import { resolveSwitchedText } from '../../../core/instrument/resolve-switched-text'
import { SERVED_KEY } from './served-key'
import { LOADED_KEY } from './loaded-key'

/**
 * Call appended to the test file, which reports that it finished evaluating.
 */
const LOADED_MARKER = `\n;globalThis[Symbol.for(${JSON.stringify(LOADED_KEY)})]?.()`

/**
 * Creates the switcher of the module texts a thread loads. A switched file
 * whose text is the one mootant listed mutants from (`resolveSwitchedText`)
 * gets the switched text with a call appended on a line of its own that reports
 * the file as served when the text runs, so a loader that discards the text, as
 * tsx does for CommonJS, never reports it; a switched file with another text is
 * reported as mismatched once and loads as it is. The test file gets a call
 * appended that reports that it finished evaluating. Appending keeps the line
 * and column of every character. A text that already ends with such a call, as
 * when the hooks of another thread switched it first, stays as it is. The
 * `SwitchedFile` of a file is read on first use.
 *
 * @param options - Switch plan, test file and writer of records.
 * @param options.plan - Absolute path of the switch plan (`NodeTestPlan`).
 * @param options.main - Real absolute path of the test file.
 * @param options.write - Writer of records.
 * @returns Switcher that the module hooks and `_compile` of the thread ask.
 */
export function createSourceSwitcher(options: {
  write(record: NodeTestRecord): void
  plan: string
  main: string
}): SourceSwitcher {
  let { write, main } = options
  let plan = JSON.parse(readFileSync(options.plan, 'utf8')) as NodeTestPlan
  let mismatched = new Set<string>()
  return {
    switch(file, code) {
      let served = `\n;globalThis[Symbol.for(${JSON.stringify(SERVED_KEY)})]?.(${JSON.stringify(file)})`
      if (code.endsWith(served) || code.endsWith(LOADED_MARKER)) {
        return null
      }
      let text = code
      if (Object.hasOwn(plan, file)) {
        let entry = JSON.parse(
          readFileSync(plan[file]!, 'utf8'),
        ) as SwitchedFile
        let switched = resolveSwitchedText(entry, code)
        if (switched !== null) {
          text = switched + served
        } else if (!mismatched.has(file)) {
          mismatched.add(file)
          write({ kind: 'mismatched', file })
        }
      }
      if (file === main) {
        text += LOADED_MARKER
      }
      return text === code ? null : text
    },
    has: file => file === main || Object.hasOwn(plan, file),
  }
}
