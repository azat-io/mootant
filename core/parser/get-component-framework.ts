import type { ComponentFramework } from '../../types/source/component-framework'

/**
 * Extension of a component file, which names its framework.
 */
const EXTENSION_PATTERN = /\.(?<framework>astro|svelte|vue)$/u

/**
 * Tells which framework a component file belongs to, by its lowercased
 * extension.
 *
 * @param file - Path of the file.
 * @returns `vue`, `svelte` or `astro`, or null for any other file.
 */
export function getComponentFramework(file: string): ComponentFramework | null {
  let framework = EXTENSION_PATTERN.exec(file.toLowerCase())?.groups?.[
    'framework'
  ] as ComponentFramework | undefined
  return framework ?? null
}
