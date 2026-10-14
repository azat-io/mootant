import type { Comment } from 'oxc-parser'

import type { IgnoreDirective } from '../../types/ignore-directive'
import type { ParsedFile } from '../../types/parsed-file'
import type { Diagnostic } from '../../types/diagnostic'

import { getSourcePosition } from '../text/get-source-position'
import { findClosestName } from '../text/find-closest-name'
import { compareCodeUnits } from '../compare-code-units'
import { isMutatorId } from '../plugins/is-mutator-id'

/**
 * Mutators a directive lists and the problems found in the list.
 */
interface MutatorList {
  /**
   * Known ids without duplicates, or null when the list is absent or blank.
   */
  mutators: string[] | null

  /**
   * One warning message for every rejected item.
   */
  messages: string[]
}

/**
 * Directives of a file and the warnings about malformed ones.
 */
interface DirectiveParse {
  /**
   * Directives in source order.
   */
  directives: IgnoreDirective[]

  /**
   * Warnings with the codes `malformed-directive` and `unknown-mutator`.
   */
  diagnostics: Diagnostic[]
}

/**
 * Line terminators that split a block comment into lines.
 */
const LINE_BREAK_PATTERN = /\r\n|[\n\r\u{2028}\u{2029}]/u

/**
 * Leading `*` decoration of a line of a JSDoc or star-prefixed block comment.
 */
const DECORATION_PATTERN = /^\s*\*+/u

/**
 * Comment text that tries to be a directive: the keyword prefix followed by a
 * boundary.
 */
const ATTEMPT_PATTERN = /^mootant-ignore(?:[\s\-:]|$)/iu

/**
 * Complete directive: keyword, optional mutator list and optional reason.
 */
const DIRECTIVE_PATTERN =
  /^mootant-ignore-(?<kind>end|file|next-line|start)(?: (?<list>[^:]*))?(?::(?<reason>.*))?$/iu

/**
 * Reads the ignore directives of a file from its comments. Line and block
 * comments are both accepted; the keyword's letter case and the `*` decoration
 * of block comment lines are ignored, mutator ids are case-sensitive.
 *
 * @param parsed - Parsed file whose comments are read.
 * @param knownMutatorIds - Every registered mutator id, active or not.
 * @returns Directives in source order and warnings about malformed directives
 *   and unknown mutator ids, positioned at the comment start.
 */
export function parseIgnoreDirectives(
  parsed: ParsedFile,
  knownMutatorIds: ReadonlySet<string>,
): DirectiveParse {
  let diagnostics: Diagnostic[] = []
  let directives: IgnoreDirective[] = []

  for (let comment of parsed.comments) {
    let text = getCommentText(comment)
    if (!ATTEMPT_PATTERN.test(text)) {
      continue
    }

    let position = getSourcePosition(parsed.lineStarts, comment.start)
    let location = { file: parsed.file, ...position }
    let groups = DIRECTIVE_PATTERN.exec(text)?.groups
    if (!groups) {
      diagnostics.push({
        message: `Unrecognized ignore directive "${text}". Use mootant-ignore-next-line, mootant-ignore-start, mootant-ignore-end or mootant-ignore-file.`,
        code: 'malformed-directive',
        severity: 'warning',
        ...location,
      })
      continue
    }

    let kind = groups['kind']!.toLowerCase() as IgnoreDirective['kind']
    let list = parseMutatorList(groups['list'], kind, knownMutatorIds)
    for (let message of list.messages) {
      diagnostics.push({
        code: 'unknown-mutator',
        severity: 'warning',
        ...location,
        message,
      })
    }

    let reason = groups['reason']?.trim() ?? ''
    directives.push({
      endLine: getSourcePosition(parsed.lineStarts, comment.end - 1).line,
      reason: reason === '' ? null : reason,
      mutators: list.mutators,
      start: comment.start,
      end: comment.end,
      ...position,
      kind,
    })
  }

  return { diagnostics, directives }
}

/**
 * Validates the mutator list of a directive. Empty items, items that are not
 * mutator ids and ids that are not registered are rejected with a warning;
 * duplicates are removed.
 *
 * @param list - Text between the keyword and the colon, if any.
 * @param kind - Directive keyword without the `mootant-ignore-` prefix.
 * @param knownMutatorIds - Every registered mutator id.
 * @returns Accepted ids, or null when the list is absent or blank, and the
 *   warning messages.
 */
function parseMutatorList(
  list: undefined | string,
  kind: IgnoreDirective['kind'],
  knownMutatorIds: ReadonlySet<string>,
): MutatorList {
  let messages: string[] = []
  if (list === undefined || list.trim() === '') {
    return { mutators: null, messages }
  }

  let mutators: string[] = []
  for (let item of list.split(',')) {
    let id = item.trim()
    if (id === '') {
      messages.push(`Empty item in the mutator list of mootant-ignore-${kind}.`)
    } else if (!isMutatorId(id)) {
      messages.push(`Invalid mutator id "${id}" in mootant-ignore-${kind}.`)
    } else if (knownMutatorIds.has(id)) {
      if (!mutators.includes(id)) {
        mutators.push(id)
      }
    } else {
      let closest = findClosestName(
        id,
        Array.from(knownMutatorIds, known => known).toSorted(compareCodeUnits),
      )
      let suggestion = closest === null ? '' : ` Did you mean "${closest}"?`
      messages.push(
        `Unknown mutator "${id}" in mootant-ignore-${kind}.${suggestion}`,
      )
    }
  }
  return { mutators, messages }
}

/**
 * Reads a comment the way a directive is written: a block comment loses the `*`
 * decoration at the start of each line and its lines are joined, and runs of
 * whitespace become one space.
 *
 * @param comment - Line or block comment of the file.
 * @returns Trimmed text of the comment on one line.
 */
function getCommentText(comment: Comment): string {
  let text =
    comment.type === 'Block' ?
      comment.value
        .split(LINE_BREAK_PATTERN)
        .map(line => line.replace(DECORATION_PATTERN, ''))
        .join(' ')
    : comment.value
  return text.trim().replaceAll(/\s+/gu, ' ')
}
