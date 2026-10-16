import { describe, expect, it } from 'vitest'

import { isVueMacroCall } from '../../../core/syntax/is-vue-macro-call'
import { createTestFile } from '../../helpers/create-test-file'

describe('isVueMacroCall', () => {
  it.each([
    'defineProps()',
    'defineEmits()',
    'defineModel()',
    'defineExpose()',
    'defineOptions()',
    'defineSlots()',
    'withDefaults()',
  ])('accepts %s', source => {
    let { find } = createTestFile(source)

    expect(isVueMacroCall(find('CallExpression'))).toBe(true)
  })

  it.each(['vue.defineProps()', 'defineStore()', 'define()'])(
    'rejects %s',
    source => {
      let { find } = createTestFile(source)

      expect(isVueMacroCall(find('CallExpression'))).toBe(false)
    },
  )

  it('rejects a node that is not a call', () => {
    let { find } = createTestFile('defineProps')

    expect(isVueMacroCall(find('Identifier'))).toBe(false)
  })
})
