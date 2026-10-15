import type { OxcError, Program } from 'oxc-parser'

import { parseSync } from 'oxc-parser'

import type { ParseSettings } from '../../types/source/parse-settings'
import type { ParsedFile } from '../../types/source/parsed-file'
import type { Diagnostic } from '../../types/mutant/diagnostic'

import { getSourcePosition } from '../text/get-source-position'
import { getLineStarts } from '../text/get-line-starts'
import { getParserOptions } from './get-parser-options'
import { walkTree } from '../tree/walk-tree'

/**
 * Position of a diagnostic, or nulls when the error has no location.
 */
interface DiagnosticPosition {
  /**
   * 1-based UTF-16 column, or null without a location.
   */
  column: number | null

  /**
   * 1-based line, or null without a location.
   */
  line: number | null
}

/**
 * Nodes inside which a `return` is not one of the top level of the program.
 */
let functionTypes = new Set<string>([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
])

/**
 * Result of parsing one file: the parsed file, or one parse-error diagnostic
 * per error the parser reported.
 */
type ParseOutcome =
  | { diagnostics: Diagnostic[]; kind: 'failed' }
  | { parsed: ParsedFile; kind: 'parsed' }

/**
 * Parses a JavaScript or TypeScript file and builds the lookup tables the text
 * helpers need. A file with any parse error, fatal or recoverable, is not
 * mutated, because it would not load after instrumentation either. A JavaScript
 * file of ambiguous source type that fails to parse and has no module syntax is
 * parsed again as CommonJS, because Node runs it inside the CommonJS wrapper,
 * where a top-level return is legal; the errors of the first parse are reported
 * when that fails too.
 *
 * @param file - Path of the file as reports print it.
 * @param source - Text of the file as read from disk, or of one script block of
 *   a component file with the text around it blanked.
 * @param settings - Parser options, how much of the text to parse and whether a
 *   `return` outside functions is accepted; by default the options of the
 *   extension of the file, which must then be a supported JavaScript or
 *   TypeScript one, and the whole text.
 * @returns The parsed file, or the diagnostics of its parse errors.
 */
export function parseFile(
  file: string,
  source: string,
  settings: ParseSettings = {
    options: getParserOptions(file)!,
    length: source.length,
    topLevelReturn: false,
  },
): ParseOutcome {
  let { options } = settings
  let text = blankHashbang(source.slice(0, settings.length))
  let result = parseSync(file, text, { ...options, preserveParens: true })
  if (
    result.errors.length > 0 &&
    options.sourceType === 'unambiguous' &&
    options.lang === 'jsx' &&
    !result.module.hasModuleSyntax
  ) {
    let commonjsResult = parseSync(file, text, {
      ...options,
      sourceType: 'commonjs',
      preserveParens: true,
    })
    if (commonjsResult.errors.length === 0) {
      result = commonjsResult
    }
  }
  let lineStarts = getLineStarts(source)
  let errors =
    settings.topLevelReturn ?
      dropTopLevelReturnErrors(result.errors, result.program)
    : result.errors

  if (errors.length > 0) {
    return {
      diagnostics: errors.map(error => {
        let [label] = error.labels
        let position: DiagnosticPosition =
          label ?
            getSourcePosition(lineStarts, label.start)
          : { column: null, line: null }
        return {
          message: error.message,
          code: 'parse-error',
          severity: 'error',
          ...position,
          file,
        }
      }),
      kind: 'failed',
    }
  }

  let { comments, program } = result
  return {
    parsed: {
      language:
        options.lang === 'ts' || options.lang === 'tsx' ?
          'typescript'
        : 'javascript',
      commentEnds: new Map(
        comments.map(comment => [comment.start, comment.end]),
      ),
      sourceType: program.sourceType,
      text: source,
      lineStarts,
      comments,
      program,
      file,
    },
    kind: 'parsed',
  }
}

/**
 * Replaces every code unit of a leading hashbang line with a space, so that
 * offsets and lines stay the same. Oxc rejects a hashbang after a byte order
 * mark, and only its JavaScript tree reports the hashbang as a comment.
 *
 * @param source - Text of the file.
 * @returns The text with the hashbang blanked, or the text itself when it has
 *   none.
 */
function blankHashbang(source: string): string {
  let start = source.codePointAt(0) === 0xfe_ff ? 1 : 0
  if (!source.startsWith('#!', start)) {
    return source
  }

  let length = source.slice(start).search(/[\n\r\u{2028}\u{2029}]/u)
  let end = length === -1 ? source.length : start + length
  return source.slice(0, start) + ' '.repeat(end - start) + source.slice(end)
}

/**
 * Drops the errors about `return` statements outside any function.
 *
 * @param errors - Errors of the parser.
 * @param program - Tree the parser built despite them.
 * @returns The other errors.
 */
function dropTopLevelReturnErrors(
  errors: OxcError[],
  program: Program,
): OxcError[] {
  let returns = new Set<number>()
  walkTree(program, node => {
    if (node.type === 'ReturnStatement') {
      returns.add(node.start)
    }
    return !functionTypes.has(node.type)
  })
  return errors.filter(error => !returns.has(error.labels[0]?.start ?? -1))
}
