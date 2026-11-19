import { describe, expect, it } from 'vitest'

import { getForcedTestJustifier } from '../../../../core/mutators/shared/get-forced-test-justifier'
import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getForcedTestJustifier', () => {
  it.each<{
    expected: string | null
    ownable: boolean
    source: string
  }>([
    {
      expected: 'owned condition x, exact',
      source: 'if (x) go()',
      ownable: true,
    },
    {
      expected: 'toward condition x, exact',
      source: 'if (x) go()',
      ownable: false,
    },
    {
      expected: 'owned condition seen.has(key), guessed',
      source: 'if (seen.has(key)) go()',
      ownable: true,
    },
    {
      expected: 'toward comparison-operator x > 1, exact',
      source: 'if (x > 1) go()',
      ownable: true,
    },
    {
      expected: 'toward comparison-operator x > 1, exact',
      source: 'if (map.delete(key) && x > 1) go()',
      ownable: true,
    },
    {
      expected: 'toward comparison-operator x > 1, guessed',
      source: 'if (x > 1 && seen.has(key)) go()',
      ownable: true,
    },
    {
      source: 'if (x > 1 && map.delete(key)) go()',
      expected: null,
      ownable: true,
    },
    {
      source: 'if (map.delete(key)) go()',
      expected: null,
      ownable: true,
    },
  ])(
    'justifies the forced test of $source, owner allowed: $ownable',
    ({ expected, ownable, source }) => {
      let { context, find } = createTestContext(source)
      let found = getForcedTestJustifier(
        {
          candidate: {
            node: find('ExpressionStatement'),
            mutator: 'statement-removal',
          },
          decision: find('IfStatement').test,
          value: false,
        },
        createRunContext(context),
        ownable,
      )

      expect(
        found &&
          `${found.owned ? 'owned' : 'toward'} ${found.by.mutator} ${context.sourceCode.getText(found.by.node)}, ${found.heuristic ? 'guessed' : 'exact'}`,
      ).toBe(expected)
    },
  )
})
