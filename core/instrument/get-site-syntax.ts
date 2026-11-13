import type { SiteSyntax } from '../../types/mutant/site-syntax'

import { RUNTIME_SYMBOL_KEY } from '../runtime/runtime-symbol-key'
import { RUNTIME_GLOBAL } from '../runtime/runtime-global'

/**
 * Tells how switched code reaches the mutant runtime. Script code reads the
 * runtime global and quotes ids as JSON strings. The Vue compiler reads
 * `globalThis` in a template as a property of the component, so a template
 * reaches the runtime through `Math`, which the compiler leaves alone, as it
 * leaves `Symbol` since version 3.5, and quotes ids with backticks, which
 * neither quote of an attribute value ends. Neither needs an import or a
 * declaration: outside mootant's workers the runtime is undefined.
 *
 * @param template - Whether the code is in the template of a Vue component.
 * @returns The runtime expression and the quoting of ids.
 */
export function getSiteSyntax(template: boolean): SiteSyntax {
  if (template) {
    return {
      runtime: `Math[Symbol.for(\`${RUNTIME_SYMBOL_KEY}\`)]`,
      quote: id => `\`${id}\``,
    }
  }
  return {
    runtime: `globalThis.${RUNTIME_GLOBAL}`,
    quote: id => JSON.stringify(id),
  }
}
