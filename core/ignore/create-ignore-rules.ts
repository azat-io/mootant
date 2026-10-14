import type { IgnoreDirective } from '../../types/ignore-directive'
import type { IgnoreSource } from '../../types/ignore-source'
import type { ParsedFile } from '../../types/parsed-file'
import type { IgnoreRule } from '../../types/ignore-rule'
import type { Diagnostic } from '../../types/diagnostic'

import { getComponentFramework } from '../parser/get-component-framework'

/**
 * Part of a file that a rule covers.
 */
interface RuleRange {
  /**
   * Precedence class of the rule.
   */
  kind: IgnoreRule['kind']

  /**
   * Line whose mutants a next-line rule covers; null for other kinds.
   */
  line: number | null

  /**
   * First offset at which a covered mutant may start.
   */
  start: number

  /**
   * Offset before which a covered mutant must start.
   */
  end: number
}

/**
 * Rules of a file and the warnings about unbalanced region markers.
 */
interface RuleCreation {
  /**
   * Warnings with the codes `unmatched-ignore-end` and `unclosed-ignore-start`.
   */
  diagnostics: Diagnostic[]

  /**
   * Rules in the order of the directives they are credited to.
   */
  rules: IgnoreRule[]
}

/**
 * Turns directives into rules. A next-line directive covers the line after the
 * comment's last line, a file directive the whole file, and a start directive
 * the text up to the end directive that closes it. A bare end closes the most
 * recently opened region; an end with a list closes the most recently opened
 * region with the same set of mutator ids, so regions may nest and overlap.
 *
 * @param parsed - Parsed file the directives belong to.
 * @param directives - Directives of the file in source order.
 * @returns Rules in directive order and warnings about an end without a
 *   matching start and a start that is never closed, which then covers the rest
 *   of the file, or of its script block in a component, whose other blocks have
 *   their own rules.
 */
export function createIgnoreRules(
  parsed: ParsedFile,
  directives: readonly IgnoreDirective[],
): RuleCreation {
  let fileEnd = parsed.text.length
  let diagnostics: Diagnostic[] = []
  let open: IgnoreDirective[] = []
  let rules: IgnoreRule[] = []

  for (let directive of directives) {
    switch (directive.kind) {
      case 'next-line':
        rules.push(
          createRule(directive, {
            end: parsed.lineStarts[directive.endLine + 1] ?? fileEnd,
            start: parsed.lineStarts[directive.endLine] ?? fileEnd,
            line: directive.endLine + 1,
            kind: 'next-line',
          }),
        )
        break
      case 'start':
        open.push(directive)
        break
      case 'file':
        rules.push(
          createRule(directive, {
            end: fileEnd,
            kind: 'file',
            line: null,
            start: 0,
          }),
        )
        break
      default: {
        let index = open.findLastIndex(
          start =>
            directive.mutators === null ||
            haveSameMutators(start.mutators, directive.mutators),
        )
        if (index === -1) {
          diagnostics.push({
            message: 'mootant-ignore-end has no matching mootant-ignore-start.',
            code: 'unmatched-ignore-end',
            column: directive.column,
            line: directive.line,
            severity: 'warning',
            file: parsed.file,
          })
          break
        }
        let start = open.splice(index, 1)[0]!
        rules.push(
          createRule(start, {
            end: directive.start,
            start: start.end,
            kind: 'region',
            line: null,
          }),
        )
      }
    }
  }

  let scope =
    getComponentFramework(parsed.file) === null ? 'file' : 'script block'
  for (let start of open) {
    diagnostics.push({
      message: `mootant-ignore-start has no matching mootant-ignore-end; it covers the rest of the ${scope}.`,
      code: 'unclosed-ignore-start',
      column: start.column,
      severity: 'warning',
      file: parsed.file,
      line: start.line,
    })
    rules.push(
      createRule(start, {
        start: start.end,
        kind: 'region',
        end: fileEnd,
        line: null,
      }),
    )
  }

  return {
    rules: rules.toSorted((left, right) => left.order - right.order),
    diagnostics,
  }
}

/**
 * Builds a rule credited to a directive: its mutators, its reason or the
 * default reason, and the position of its comment.
 *
 * @param directive - Next-line, start or file directive.
 * @param range - Kind of the rule and the part of the file it covers.
 * @returns Rule of the directive.
 */
function createRule(directive: IgnoreDirective, range: RuleRange): IgnoreRule {
  let keyword: IgnoreSource['directive'] = `mootant-ignore-${range.kind === 'region' ? 'start' : range.kind}`
  return {
    source: {
      column: directive.column,
      line: directive.line,
      directive: keyword,
    },
    reason:
      directive.reason ?? `Ignored by ${keyword} on line ${directive.line}`,
    mutators: directive.mutators,
    order: directive.start,
    ...range,
  }
}

/**
 * Tells whether a start directive lists the same set of mutator ids as an end
 * directive, ignoring order. Both lists hold no duplicates.
 *
 * @param start - Ids of the start directive, or null for every mutator.
 * @param end - Ids of the end directive.
 * @returns Whether both directives name the same ids.
 */
function haveSameMutators(
  start: readonly string[] | null,
  end: readonly string[],
): boolean {
  return (
    start !== null &&
    start.length === end.length &&
    end.every(id => start.includes(id))
  )
}
