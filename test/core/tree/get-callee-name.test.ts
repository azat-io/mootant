import { describe, expect, it } from 'vitest'

import { getCalleeName } from '../../../core/tree/get-callee-name'
import { createTestFile } from '../../helpers/create-test-file'

describe('getCalleeName', () => {
  it.each([
    { source: 'run()', expected: 'run' },
    { source: 'window.setTimeout(run)', expected: 'setTimeout' },
    { source: 'factory().useMemo(load)', expected: 'useMemo' },
    { source: '(run as Runner)()', expected: 'run' },
    { source: "hooks['useMemo'](load)", expected: null },
    { source: 'getRunner()()', expected: null },
  ])('reads the name of the callee of $source', ({ expected, source }) => {
    let { callee } = createTestFile(source).find('CallExpression', source)

    expect(getCalleeName(callee)).toBe(expected)
  })
})
