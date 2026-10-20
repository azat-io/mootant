import { describe, expect, it } from 'vitest'

import { orderCoveringTests } from '../../../core/run/order-covering-tests'
import { createTestRun } from '../../helpers/create-test-run'

describe('orderCoveringTests', () => {
  it('orders by the rank of the test file, then by line, a test without one last, then by name', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/b.test.ts', duration: 0, id: 'b1', line: 1 },
          { file: '/t/a.test.ts', id: 'a-late', duration: 9 },
          { file: '/t/a.test.ts', id: 'a-early', duration: 9 },
          { file: '/t/a.test.ts', duration: 5, id: 'a20', line: 20 },
          { file: '/t/a.test.ts', duration: 1, id: 'a4', line: 4 },
        ],
      },
      { mutants: [] },
    )

    expect(
      orderCoveringTests(
        ['b1', 'a-late', 'a20', 'a-early', 'a4'],
        ['/t/a.test.ts', '/t/b.test.ts'],
        state.analysis,
      ),
    ).toStrictEqual(['a4', 'a20', 'a-early', 'a-late', 'b1'])
  })

  it('orders tests of the same name and line by id', async () => {
    let { state } = await createTestRun(
      {
        tests: [
          { file: '/t/a.test.ts', line: 2, id: 'z' },
          { file: '/t/a.test.ts', line: 2, id: 'y' },
        ],
      },
      { mutants: [] },
    )
    let z = state.analysis.tests.get('z')!
    z.name = 'same'
    state.analysis.tests.get('y')!.name = 'same'

    expect(
      orderCoveringTests(['z', 'y'], ['/t/a.test.ts'], state.analysis),
    ).toStrictEqual(['y', 'z'])
  })
})
