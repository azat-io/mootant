import type { TemplateCompilers } from '../../types/source/template-compilers'
import type { TemplateOutcome } from '../../types/source/template-outcome'
import type { TemplateSource } from '../../types/source/template-source'

import { getComponentFramework } from './get-component-framework'
import { parseSvelteTemplate } from './parse-svelte-template'
import { parseVueTemplate } from './parse-vue-template'

/**
 * Reads the template of a Svelte or Vue component with the compiler of its
 * framework.
 *
 * @param compilers - Framework compilers of the run.
 * @param template - Path, text and expression language of the file.
 * @returns The template as one program, or why it is not mutated; `empty` for a
 *   file that is not a Svelte or Vue component, and for a component whose
 *   compiler is not loaded.
 */
export function parseComponentTemplate(
  compilers: TemplateCompilers,
  template: TemplateSource,
): TemplateOutcome {
  let framework = getComponentFramework(template.file)
  if (framework === 'svelte' && compilers.svelte) {
    return parseSvelteTemplate(compilers.svelte, template)
  }
  if (framework === 'vue' && compilers.vue) {
    return parseVueTemplate(compilers.vue, template)
  }
  return { kind: 'empty' }
}
