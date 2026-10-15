import type { TestProject } from 'vitest/node'

import { describe, expect, it } from 'vitest'

import { getProjectLabel } from '../../../adapters/vitest/get-project-label'

describe('getProjectLabel', () => {
  it('names a project', () => {
    expect(getProjectLabel({ name: '' } as TestProject)).toBe(
      'the Vitest project',
    )
    expect(getProjectLabel({ name: 'unit' } as TestProject)).toBe(
      'project "unit"',
    )
  })
})
