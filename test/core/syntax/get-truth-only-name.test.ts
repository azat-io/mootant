import { describe, expect, it } from 'vitest'

import { getTruthOnlyName } from '../../../core/syntax/get-truth-only-name'
import { createTestProgram } from '../../helpers/create-test-program'
import { createTestFile } from '../../helpers/create-test-file'

/**
 * Finds the name that the first `??` of a snippet initializes when its value
 * only reaches truth positions through that name.
 *
 * @param source - Snippet with a `??`.
 * @param component - Whether the snippet is the script of a component, whose
 *   top level other code shares; false when omitted.
 * @returns The name, or null when the value is used otherwise.
 */
function check(source: string, component = false): string | null {
  let file = createTestFile(source)
  return getTruthOnlyName(
    createTestProgram(file, component),
    file.find('LogicalExpression'),
  )
}

describe('getTruthOnlyName', () => {
  it.each([
    {
      source: 'let quiet = options.quiet ?? false; if (!quiet) run()',
      expected: 'quiet',
    },
    {
      source:
        'const quiet = options.quiet ?? false; if (quiet) run(); x = quiet ? 1 : 2',
      expected: 'quiet',
    },
    {
      source:
        'const quiet = (options.quiet ?? false) as boolean; while (quiet && run()) {}',
      expected: 'quiet',
    },
    {
      source: 'const on = a ?? null; x = !on || (b ? on : !on) ? 1 : 2',
      expected: 'on',
    },
    {
      source:
        'function g() { let on = a ?? false; return () => { if (on) run() } }',
      expected: 'on',
    },
  ])('finds $expected in $source', ({ expected, source }) => {
    expect(check(source)).toBe(expected)
  })

  it.each([
    'let quiet = options.quiet ?? false',
    'let quiet = options.quiet ?? false; quiet = true; if (quiet) run()',
    'var quiet = options.quiet ?? false; if (quiet) run()',
    'let { quiet } = options.quiet ?? {}; if (quiet) run()',
    'function g() { let on = a ?? false; if (on) run(); return on }',
    'let enabled = flag ?? false; if (enabled) use(1); x = { enabled }',
    'let enabled = flag ?? false; if (enabled) use(enabled)',
    'let enabled = flag ?? false; if (typeof enabled === "boolean") run()',
    'let enabled = flag ?? false; console.log(enabled); if (enabled) run()',
    'let enabled = flag ?? false; if (enabled) run(); export { enabled }',
    'export const strictMode = settings.strict ?? false; if (strictMode) run()',
    'let on = a ?? false; eval(code); if (on) run()',
    'x = a ?? false',
    'g(a ?? false)',
    'let on; on = a ?? false; if (on) run()',
    'const on = a ?? 0; items.filter(() => on)',
    'const on = a ?? 0; items.some(item => { return on })',
    'const live = options.live ?? false; store.find(() => live)',
    'const on = a ?? null; x = Boolean(on) || !on',
  ])('finds no name in %s', source => {
    expect(check(source)).toBeNull()
  })

  it('finds a function local of a component and not its top level', () => {
    expect(
      check('let compact = options.compact ?? false; if (compact) run()', true),
    ).toBeNull()
    expect(
      check('const note = props.note ?? ""; if (note) run()', true),
    ).toBeNull()
    expect(
      check(
        'function size() { let compact = options.compact ?? false; return compact ? 1 : 2 }',
        true,
      ),
    ).toBe('compact')
  })
})
