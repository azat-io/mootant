import type { Program } from 'oxc-parser'

import type { TemplateCompilers } from '../../types/source/template-compilers'

import { parseComponentTemplate } from '../parser/parse-component-template'
import { getComponentFramework } from '../parser/get-component-framework'
import { getTemplateLanguage } from '../parser/get-template-language'
import { getStatementList } from '../syntax/get-statement-list'
import { getSourceBlocks } from '../parser/get-source-blocks'
import { parseFile } from '../parser/parse-file'
import { indexTree } from '../tree/index-tree'

/**
 * Program of a file and how the statements of its lists are guarded.
 */
interface GuardedProgram {
  /**
   * Nodes only the synthetic module of a template has.
   */
  hosts: ReadonlySet<unknown>

  /**
   * Whether the first statement of a list goes without a guard.
   */
  skipFirst: boolean

  /**
   * Program of a script block or of the template.
   */
  program: Program

  /**
   * Text that precedes a parenthesized host at a statement start.
   */
  guard: string
}

/**
 * Finds where the expression statements that sit in a statement list, such as
 * the body of a block, start, with the guard an expression hosted in
 * parentheses there needs in front, so a previous line without a semicolon does
 * not take the parentheses as call arguments. The guard is `;`. With the
 * compilers of the run, the statements of the template of a Svelte or Vue
 * component count too, such as those in the body of an event handler; the
 * statements of the synthetic module that holds the template code do not. Vue
 * compiles an event handler by whether its text has a `;`: a function handler
 * that gains one no longer compiles, and an inline one becomes a block body
 * whose result, such as a promise Vue sends rejections of to its error handler,
 * is lost. So a statement of a Vue template is guarded with an empty block,
 * which no expression continues with and which ends before the host, unlike an
 * operator such as `void`; the first statement of a list, which nothing
 * precedes, is not guarded.
 *
 * @param file - Name of the file, whose extension selects the language; every
 *   script block of a component file is parsed.
 * @param source - Text of the file as read.
 * @param compilers - Compilers that read component templates; templates are not
 *   read when omitted.
 * @returns Guards by the offsets in `source` where such statements start.
 * @throws Error - When the text does not parse.
 */
export function findStatementStarts(
  file: string,
  source: string,
  compilers?: TemplateCompilers,
): Map<number, string> {
  let starts = new Map<number, string>()
  let blocks = getSourceBlocks(file, source)
  let programs: GuardedProgram[] = []
  for (let block of blocks) {
    let outcome = parseFile(file, block.text, block)
    if (outcome.kind === 'failed') {
      throw new Error(`The original text of ${file} does not parse.`)
    }
    programs.push({
      program: outcome.parsed.program,
      skipFirst: false,
      hosts: new Set(),
      guard: ';',
    })
  }
  if (compilers) {
    let template = parseComponentTemplate(compilers, {
      lang: getTemplateLanguage(blocks),
      source,
      file,
    })
    if (template.kind === 'parsed') {
      let vue = getComponentFramework(file) === 'vue'
      programs.push({
        program: template.parsed.program,
        guard: vue ? '{}' : ';',
        hosts: template.hosts,
        skipFirst: vue,
      })
    }
  }
  for (let { skipFirst, program, hosts, guard } of programs) {
    let tree = indexTree(program)
    for (let node of tree.slots.keys()) {
      if (node.type !== 'ExpressionStatement' || hosts.has(node)) {
        continue
      }
      let list = getStatementList(tree, node)
      if (list && (!skipFirst || list[0] !== node)) {
        starts.set(node.start, guard)
      }
    }
  }
  return starts
}
