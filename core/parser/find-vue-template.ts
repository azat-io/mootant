import type { AttributeNode, ElementNode, RootNode } from '@vue/compiler-dom'

/**
 * Number of the attribute node type, as `NodeTypes.ATTRIBUTE` of
 * `@vue/compiler-dom` defines it; the enum is not imported, so the compiler
 * loads only when a template is read.
 */
const ATTRIBUTE_TYPE = 6

/**
 * Finds the top-level `<template>` of a Vue component whose markup Vue
 * compiles: one that names no `src` file and no `lang` other than `html`.
 *
 * @param root - Tree of `parse(source, { parseMode: 'sfc' })`.
 * @returns The template element, or null when the component has no template of
 *   markup.
 */
export function findVueTemplate(root: RootNode): ElementNode | null {
  let template = root.children.find(
    child => (child as Partial<ElementNode>).tag === 'template',
  ) as ElementNode | undefined
  if (!template) {
    return null
  }
  let markup = template.props.every(property => {
    if (property.type !== (ATTRIBUTE_TYPE as number)) {
      return true
    }
    let { value, name } = property as AttributeNode
    return name === 'lang' ? value?.content === 'html' : name !== 'src'
  })
  return markup ? template : null
}
