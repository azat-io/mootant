import { describe, expect, it } from 'vitest'

import { pickHost } from '../../../core/generate/pick-host'
import { createMutant } from '../../helpers/create-mutant'

describe('pickHost', () => {
  it('copies the kind, the focus and the literal of a removal', () => {
    let mutant = createMutant({
      focus: { text: '', start: 5, end: 6 },
      list: { start: 4, end: 10 },
      kind: 'element',
      start: 5,
      end: 8,
    })

    expect(pickHost(mutant)).toStrictEqual({
      focus: { text: '', start: 5, end: 6 },
      list: { start: 4, end: 10 },
      kind: 'element',
    })
  })

  it('copies the kind and a focus of a mutant hosted around its range', () => {
    let focus = { text: 'g', start: 3, end: 4 }

    expect(pickHost(createMutant({ start: 0, end: 6, focus }))).toStrictEqual({
      kind: 'expression',
      focus,
    })
    expect(
      pickHost(createMutant({ kind: 'block', start: 0, end: 6 })),
    ).toStrictEqual({ kind: 'block' })
  })
})
