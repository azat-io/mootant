import type { TemplateCompilers } from '../../types/source/template-compilers'
import type { Mutant } from '../../types/mutant/mutant'

import { getComponentFramework } from '../parser/get-component-framework'
import { getTemplateSiteCheck } from './get-template-site-check'
import { scanScriptBlocks } from '../parser/scan-script-blocks'
import { findStatementStarts } from './find-statement-starts'
import { groupMutantRanges } from './group-mutant-ranges'
import { renderMutantRange } from './render-mutant-range'
import { getSiteCheck } from './get-site-check'

/**
 * File to switch with the mutants to host in it.
 */
interface InstrumentFileInput {
  /**
   * Compilers that read the templates of Svelte and Vue components, for the
   * statements of their event handlers; templates are not read when omitted.
   */
  compilers?: TemplateCompilers

  /**
   * Pending mutants of the file; every one gets a site.
   */
  mutants: readonly Mutant[]

  /**
   * Text of the file as read, which the mutant offsets refer to.
   */
  source: string

  /**
   * Name of the file, whose extension selects the language.
   */
  file: string
}

/**
 * Builds the switched text of a file: every mutant is hosted behind a site
 * check of the mutant runtime, so one text runs the original code or any one of
 * its mutants. Mutants of one range share a host; nested ranges are hosted
 * inside the original branch of the outer one. A mutant in the template of a
 * Vue component, outside its script blocks, reaches the runtime through `Math`.
 * No source map is made.
 *
 * @param input - File name, text, mutants and template compilers.
 * @returns The switched text, or the text as is when there are no mutants.
 * @throws Error - When the text does not parse, mutants of one range differ in
 *   kind, or ranges overlap.
 */
export function instrumentFile(input: InstrumentFileInput): string {
  let { compilers, mutants, source, file } = input
  if (mutants.length === 0) {
    return source
  }
  let ranges = groupMutantRanges(mutants)
  let statementStarts = findStatementStarts(file, source, compilers)
  let vue = getComponentFramework(file) === 'vue'
  let scripts = vue ? scanScriptBlocks(source, 'vue') : []
  let switched = ''
  let cursor = 0
  for (let range of ranges) {
    let template =
      vue &&
      scripts.every(
        script => !(script.start <= range.start) || !(range.end <= script.end),
      )
    switched += source.slice(cursor, range.start)
    switched += renderMutantRange(range, source, {
      getCheck: template ? getTemplateSiteCheck : getSiteCheck,
      statementStarts,
    })
    cursor = range.end
  }
  return switched + source.slice(cursor)
}
