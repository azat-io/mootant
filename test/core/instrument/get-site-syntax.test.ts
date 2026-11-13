import { afterEach, describe, expect, it } from 'vitest'
import { compile } from '@vue/compiler-dom'
import { runInThisContext } from 'node:vm'

import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'
import { getSiteSyntax } from '../../../core/instrument/get-site-syntax'

/**
 * Builds the check of a mutant site in a syntax.
 *
 * @param template - Whether the site is in a Vue template.
 * @param id - Id of the mutant.
 * @returns Text of the check.
 */
function check(template: boolean, id: string): string {
  let { runtime, quote } = getSiteSyntax(template)
  return `${runtime}?.hit(${quote(id)})`
}

describe('getSiteSyntax', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__mootant')
    Reflect.deleteProperty(Math, Symbol.for('mootant'))
  })

  it('reads the runtime global in script code with ids as JSON strings', () => {
    expect(check(false, 'abc123')).toBe('globalThis.__mootant?.hit("abc123")')
  })

  it('reads the runtime on Math in a template with ids in backticks', () => {
    expect(check(true, 'abc123')).toBe(
      'Math[Symbol.for(`mootant`)]?.hit(`abc123`)',
    )
  })

  it.each([false, true])(
    'is undefined without a runtime and reaches an installed one, template: %s',
    template => {
      expect(runInThisContext(check(template, 'a'))).toBeUndefined()

      let runtime = installMutantRuntime()
      runtime.active = 'a'

      expect(runInThisContext(check(template, 'a'))).toBe(true)
    },
  )

  it('is left alone by the Vue compiler in a template', () => {
    let { runtime, quote } = getSiteSyntax(true)
    let text = `${runtime}?.hitAny([${quote('a')}]) ? ${runtime}.gap : 1`
    let { code } = compile(
      `<i :title="${text}">{{ ${check(true, 'a')} }}</i>`,
      {
        prefixIdentifiers: true,
      },
    )

    expect(code).toContain(check(true, 'a'))
    expect(code).toContain(text)
    expect(code).not.toContain('_ctx.')
  })
})
