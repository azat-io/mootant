import { afterEach, describe, expect, it } from 'vitest'
import { compile } from '@vue/compiler-dom'
import { runInThisContext } from 'node:vm'

import { getTemplateSiteCheck } from '../../../core/instrument/get-template-site-check'
import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'

describe('getTemplateSiteCheck', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__mootant')
    Reflect.deleteProperty(Math, Symbol.for('mootant'))
  })

  it('calls the runtime on Math with the id in backticks', () => {
    expect(getTemplateSiteCheck('abc123')).toBe(
      'Math[Symbol.for(`mootant`)]?.hit(`abc123`)',
    )
  })

  it('is undefined without a runtime and reaches an installed one', () => {
    expect(runInThisContext(getTemplateSiteCheck('a'))).toBeUndefined()

    let runtime = installMutantRuntime()
    runtime.active = 'a'

    expect(runInThisContext(getTemplateSiteCheck('a'))).toBe(true)
  })

  it('is left alone by the Vue compiler', () => {
    let { code } = compile(`<i>{{ ${getTemplateSiteCheck('a')} }}</i>`, {
      prefixIdentifiers: true,
    })

    expect(code).toContain(getTemplateSiteCheck('a'))
    expect(code).not.toContain('_ctx.')
  })
})
