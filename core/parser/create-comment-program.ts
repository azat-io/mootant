import type { Node } from 'oxc-parser'

import { parseSync } from 'oxc-parser'

import type { TemplateSource } from '../../types/source/template-source'
import type { ParsedFile } from '../../types/source/parsed-file'

import { getLineStarts } from '../text/get-line-starts'
import { blankOutside } from '../text/blank-outside'

/**
 * Builds the program of a template without expressions: an empty module whose
 * text is the text of the file blanked, so the HTML comments of the template
 * can still hold ignore directives, such as a `mootant-ignore-file` that covers
 * the script blocks.
 *
 * @param template - Path, text and expression language of the component.
 * @returns The empty program, with the program node as its only host and no
 *   event handlers; the caller adds the comments.
 */
export function createCommentProgram(template: TemplateSource): {
  handlers: ReadonlySet<Node>
  hosts: ReadonlySet<Node>
  parsed: ParsedFile
  kind: 'parsed'
} {
  let { source, lang, file } = template
  let { program } = parseSync(file, '', { sourceType: 'module', lang })
  let text = blankOutside(source, [])
  return {
    parsed: {
      language: lang === 'ts' ? 'typescript' : 'javascript',
      lineStarts: getLineStarts(text),
      commentEnds: new Map(),
      sourceType: 'module',
      comments: [],
      program,
      text,
      file,
    },
    hosts: new Set([program]),
    handlers: new Set(),
    kind: 'parsed',
  }
}
