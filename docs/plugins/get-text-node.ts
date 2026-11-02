import type { HastNode } from './wrap-elements'

/**
 * Wraps a string in a node of the HTML tree.
 *
 * @param value - String to wrap.
 * @returns Node for the children of an element.
 */
export function getTextNode(value: string): HastNode {
  return { type: 'text', value }
}
