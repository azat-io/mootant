import component from '../../../docs/components/Wordmark.astro?raw'

/**
 * Returns the wordmark of the docs for the header of the report: the `<svg>`
 * element of the docs component, without its Astro attributes, with the class
 * the report sizes it by and hidden from assistive technology, since its link
 * has a label.
 *
 * @returns SVG markup of the wordmark.
 */
export function getWordmark(): string {
  return component
    .slice(component.indexOf('<svg'), component.indexOf('</svg>') + 6)
    .replace(/\s+class:list=\{\[[^\]]*\]\}/u, '')
    .replace(/\s+\{\.\.\.props\}/u, '')
    .replace('<svg', '<svg class="wordmark" aria-hidden="true"')
}
