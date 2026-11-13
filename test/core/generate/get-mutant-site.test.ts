import { describe, expect, it } from 'vitest'

import { getMutantSite } from '../../../core/generate/get-mutant-site'
import { createMutant } from '../../helpers/create-mutant'

describe('getMutantSite', () => {
  it('places a removal at its element', () => {
    let mutant = createMutant({
      focus: { text: '', start: 8, end: 9 },
      list: { start: 4, end: 10 },
      kind: 'property',
      start: 6,
      end: 9,
    })

    expect(getMutantSite(mutant)).toBe(8)
  })

  it('places any other mutant at its range, even with a focus', () => {
    let focus = { text: 'g', start: 12, end: 13 }

    expect(getMutantSite(createMutant({ start: 3, end: 14, focus }))).toBe(3)
  })
})
