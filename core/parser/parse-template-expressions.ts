import type {
  ParenthesizedExpression,
  ExpressionStatement,
  Comment,
  Node,
} from 'oxc-parser'

import { parseSync } from 'oxc-parser'

import type { TemplateExpression } from '../../types/source/template-expression'
import type { TemplateSource } from '../../types/source/template-source'
import type { ParsedFile } from '../../types/source/parsed-file'

import { isExpressionWrapper } from '../tree/is-expression-wrapper'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getLineStarts } from '../text/get-line-starts'
import { blankOutside } from '../text/blank-outside'
import { walkTree } from '../tree/walk-tree'

/**
 * Text the synthetic module writes around each kind of template code. A Vue
 * event handler that starts with `function` is held in parentheses, where it is
 * a function expression, and any other one in a block, where it may be a list
 * of statements.
 */
let wrappers = {
  declaration: { suffix: ' }\n', prefix: '{ ' },
  condition: { prefix: 'if (', suffix: ');\n' },
  handler: { suffix: ')];\n', prefix: '[(' },
  function: { suffix: ');\n', prefix: '(' },
  event: { suffix: '\n}\n', prefix: '{ ' },
  value: { suffix: ')];\n', prefix: '[(' },
}

/**
 * Start of a Vue event handler that is a function declaration in a block.
 */
const FUNCTION_START_PATTERN = /^\s*(?:async\s+)?function\b/u

/**
 * Template expressions parsed as one program, or why they could not be.
 */
type TemplateParseOutcome =
  | {
      /**
       * Arrow functions with an expression body that are event handlers, whose
       * result is discarded.
       */
      handlers: ReadonlySet<Node>

      /**
       * Nodes that are never replaced: those only the synthetic module has,
       * such as the program, the statements and the wrappers around the
       * template code, whose ranges are clamped to the code they hold; every
       * node of a Vue event handler that is a member path; and the function of
       * a Vue event handler that is one, with the parentheses and type wrappers
       * around it.
       */
      hosts: ReadonlySet<Node>
      parsed: ParsedFile
      kind: 'parsed'
    }
  | {
      /**
       * Offset of the error in the file, or null without a location.
       */
      offset: number | null

      /**
       * Message of the first parse error.
       */
      message: string
      kind: 'failed'
    }

/**
 * Template code in the synthetic module.
 */
interface Segment {
  /**
   * How the module holds the code.
   */
  wrap: TemplateExpression['wrap']

  /**
   * Offset where the text around the code starts in the module.
   */
  outerStart: number

  /**
   * Offset just past the text around the code in the module.
   */
  outerEnd: number

  /**
   * Offset of the code in the file minus its offset in the module.
   */
  shift: number

  /**
   * Offset of the code in the module.
   */
  start: number

  /**
   * Offset just past the code in the module.
   */
  end: number
}

/**
 * How Vue compiles an event handler.
 */
type EventForm =
  | {
      /**
       * Arrow function with an expression body, whose result is discarded, or
       * null for any other function.
       */
      handler: Node | null

      kind: 'function'
      /**
       * The function and the parentheses and type wrappers around it.
       */
      kept: Node[]
    }
  | {
      kind: 'statements' | 'path'
    }

/**
 * Parses the expressions of a component template with oxc. Each expression is
 * written into one synthetic module, wrapped by its kind: the test of an `if`
 * statement for a condition, an array element for a value, and a block for a
 * declaration. This is faster than one parse per expression, and the text of
 * the file has no room for the wrappers. Every node and comment is then moved
 * to the offsets of the file, so the program reads like a script block: its
 * text is the text of the file with everything outside the expressions blanked
 * except line terminators and a leading byte order mark. The arrow function
 * with an expression body that an event handler is, once parentheses are looked
 * through, is marked, because nothing reads its result. A Vue event handler is
 * compiled by its form, which a mutant must keep: a member path such as
 * `onSave` is passed as the handler and has nothing to mutate, so all its nodes
 * are hosts; a function is passed as written, so the function and the wrappers
 * around it are hosts; anything else becomes the body of a handler, as the
 * block of the module holds it. Each piece of code must parse as the one
 * statement around it, or the module would not tell the pieces apart.
 *
 * @param template - Path, text and expression language of the file.
 * @param expressions - Template code in source order, without overlaps.
 * @returns The program with the nodes only the module has and the handlers, or
 *   the first parse error.
 */
export function parseTemplateExpressions(
  template: TemplateSource,
  expressions: readonly TemplateExpression[],
): TemplateParseOutcome {
  let { source, lang, file } = template
  let segments: Segment[] = []
  let module = ''
  for (let expression of expressions) {
    let text = source.slice(expression.start, expression.end)
    let { prefix, suffix } =
      wrappers[
        expression.wrap === 'event' && FUNCTION_START_PATTERN.test(text) ?
          'function'
        : expression.wrap
      ]
    let outerStart = module.length
    let start = outerStart + prefix.length
    module += prefix + text + suffix
    segments.push({
      end: start + expression.end - expression.start,
      shift: expression.start - start,
      outerEnd: module.length,
      wrap: expression.wrap,
      outerStart,
      start,
    })
  }

  let result = parseSync(file, module, {
    sourceType: 'module',
    preserveParens: true,
    lang,
  })
  let [error] = result.errors
  if (error) {
    let start = error.labels[0]?.start
    return {
      offset: start === undefined ? null : moveOffset(segments, start),
      message: error.message,
      kind: 'failed',
    }
  }

  let { body } = result.program
  let stray = segments.findIndex(
    (segment, index) =>
      body[index]?.start !== segment.outerStart ||
      body[index].end !== segment.outerEnd - 1,
  )
  if (stray !== -1) {
    let segment = segments[stray]!
    return {
      message: 'An expression does not parse on its own.',
      offset: segment.start + segment.shift,
      kind: 'failed',
    }
  }

  let hosts = new Set<Node>()
  let handlers = new Set<Node>()
  let tops = new Set<Segment>()
  let frozen = new Set<Segment>()
  for (let [index, segment] of segments.entries()) {
    if (segment.wrap === 'event') {
      let form = readEventForm(body[index]!)
      if (form.kind === 'path') {
        frozen.add(segment)
      } else if (form.kind === 'function') {
        for (let node of form.kept) {
          hosts.add(node)
        }
        if (form.handler) {
          handlers.add(form.handler)
        }
      }
    }
  }
  walkTree(result.program, node => {
    let segment = findSegment(segments, node.start)
    if (
      node.start < segment.start ||
      node.end > segment.end ||
      frozen.has(segment)
    ) {
      hosts.add(node)
    } else if (!tops.has(segment)) {
      tops.add(segment)
      let handler = unwrapExpression(node)
      if (
        segment.wrap === 'handler' &&
        handler.type === 'ArrowFunctionExpression' &&
        handler.expression
      ) {
        handlers.add(handler)
      }
    }
    node.start = moveOffset(segments, node.start)
    node.end = moveOffset(segments, node.end)
    return true
  })
  let comments: Comment[] = result.comments.map(comment => ({
    ...comment,
    start: moveOffset(segments, comment.start),
    end: moveOffset(segments, comment.end),
  }))
  let text = blankOutside(source, expressions)
  return {
    parsed: {
      commentEnds: new Map(
        comments.map(comment => [comment.start, comment.end]),
      ),
      language: lang === 'ts' ? 'typescript' : 'javascript',
      lineStarts: getLineStarts(text),
      program: result.program,
      sourceType: 'module',
      comments,
      text,
      file,
    },
    kind: 'parsed',
    handlers,
    hosts,
  }
}

/**
 * Tells how Vue compiles an event handler, as its compiler decides: a single
 * expression that is a member path, such as `onSave` or `form.save`, or a
 * function is passed as the handler; any other code becomes the body of one.
 *
 * @param statement - Statement of the synthetic module that holds the handler:
 *   a block, or for a handler that starts with `function` an expression
 *   statement of the parentheses around it.
 * @returns The form of the handler, with the nodes a function handler keeps.
 */
function readEventForm(statement: Node): EventForm {
  let expression: Node
  if (statement.type === 'BlockStatement') {
    let [first] = statement.body
    if (
      statement.body.length !== 1 ||
      first?.type !== 'ExpressionStatement' ||
      first.end !== first.expression.end
    ) {
      return { kind: 'statements' }
    }
    ;({ expression } = first)
  } else {
    ;({ expression } = (statement as ExpressionStatement)
      .expression as ParenthesizedExpression)
  }
  let kept: Node[] = []
  let current = expression
  while (isExpressionWrapper(current)) {
    kept.push(current)
    current = current.expression
  }
  if (
    (current.type === 'Identifier' && current.name !== 'undefined') ||
    current.type === 'MemberExpression' ||
    (current.type === 'ChainExpression' &&
      current.expression.type === 'MemberExpression')
  ) {
    return { kind: 'path' }
  }
  if (
    current.type === 'ArrowFunctionExpression' ||
    current.type === 'FunctionExpression'
  ) {
    kept.push(current)
    return {
      handler:
        current.type === 'ArrowFunctionExpression' && current.expression ?
          current
        : null,
      kind: 'function',
      kept,
    }
  }
  return { kind: 'statements' }
}

/**
 * Finds the segment whose text holds an offset of the module.
 *
 * @param segments - Segments in module order.
 * @param offset - Offset in the module.
 * @returns Last segment that starts at or before the offset, or the first one.
 */
function findSegment(segments: readonly Segment[], offset: number): Segment {
  let low = 0
  let high = segments.length - 1
  while (low < high) {
    let middle = Math.ceil((low + high) / 2)
    if (segments[middle]!.outerStart <= offset) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return segments[low]!
}

/**
 * Moves an offset of the module to the file. An offset in the text around the
 * code of a segment is clamped to the edge of that code.
 *
 * @param segments - Segments in module order.
 * @param offset - Offset in the module.
 * @returns Offset in the file.
 */
function moveOffset(segments: readonly Segment[], offset: number): number {
  let segment = findSegment(segments, offset)
  let clamped = Math.min(Math.max(offset, segment.start), segment.end)
  return clamped + segment.shift
}
