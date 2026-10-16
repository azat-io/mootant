import type { AST } from 'svelte/compiler'
import type { Comment } from 'oxc-parser'

import type { TemplateExpression } from '../../types/source/template-expression'
import type { TemplateParts } from '../../types/source/template-parts'
import type { SourceRange } from '../../types/source/source-range'

/**
 * Attribute or directive of an element.
 */
type ElementAttribute = AST.BaseElement['attributes'][number]

/**
 * Node of a template fragment.
 */
type FragmentNode = AST.Fragment['nodes'][number]

/**
 * Nodes whose `on*` attributes are DOM event listeners, which discard what the
 * handler returns. On a component such an attribute is a callback prop, whose
 * result the component may read.
 */
let listeningTypes = new Set<FragmentNode['type']>([
  'SvelteDocument',
  'RegularElement',
  'SvelteElement',
  'SvelteWindow',
  'SvelteBody',
])

/**
 * Collects the code of a Svelte 5 template that mootant mutates, from the tree
 * of `parse(source, { modern: true })`: the expressions of tags, blocks,
 * attributes and directives, and the declarations of `@const` and declaration
 * tags. Code the compiler reads as a name or a pattern is left out: `bind:` and
 * `let:` directives, shorthand attributes and directives, the patterns and keys
 * of `#each` blocks, the list of an `#each` block without `as`, which Svelte
 * does not accept in parentheses, the value and error of `#await` blocks,
 * snippet names and parameters, the callee of `@render` tags, `@debug` tags and
 * a `this` written as a string. The handler of an `on:` directive, and of an
 * `on*` attribute of an element, is marked, because its result is discarded.
 * The script blocks and `<svelte:options>` are not part of the fragment.
 *
 * @param root - Tree of the component.
 * @returns Expressions to mutate and the HTML comments, in source order.
 */
export function collectSvelteExpressions(root: AST.Root): TemplateParts {
  let expressions: TemplateExpression[] = []
  let comments: Comment[] = []

  /**
   * Adds an expression. Svelte gives every node of its trees a `start` and an
   * `end`, which the ESTree types do not declare.
   *
   * @param node - Expression or declaration, or null when there is none.
   * @param wrap - How the synthetic module holds it.
   */
  function add(
    node: undefined | object | null,
    wrap: TemplateExpression['wrap'] = 'value',
  ): void {
    if (node) {
      let { start, end } = node as SourceRange
      expressions.push({ start, wrap, end })
    }
  }

  /**
   * Adds the expressions of an attribute value: a single expression tag, or the
   * expression tags among text parts.
   *
   * @param value - Value of an attribute or a style directive.
   * @param wrap - How the synthetic module holds a single expression tag.
   */
  function addValue(
    value: AST.Attribute['value'],
    wrap: TemplateExpression['wrap'] = 'value',
  ): void {
    if (value === true) {
      return
    }
    let parts = Array.isArray(value) ? value : [value]
    for (let part of parts) {
      if (
        part.type === 'ExpressionTag' &&
        part.start !== Reflect.get(part.expression, 'start')
      ) {
        add(part.expression, parts.length === 1 ? wrap : 'value')
      }
    }
  }

  /**
   * Adds the expressions of an attribute or a directive.
   *
   * @param attribute - Attribute, spread, directive or attachment.
   * @param listening - Whether `on*` attributes of the node are event
   *   listeners.
   */
  function visitAttribute(
    attribute: ElementAttribute,
    listening: boolean,
  ): void {
    switch (attribute.type) {
      case 'ClassDirective':
        if (Reflect.get(attribute.expression, 'end') !== attribute.end) {
          add(attribute.expression, 'condition')
        }
        break
      case 'StyleDirective':
        addValue(attribute.value)
        break
      case 'BindDirective':
      case 'LetDirective':
        break
      case 'OnDirective':
        add(attribute.expression, 'handler')
        break
      case 'Attribute':
        addValue(
          attribute.value,
          listening && attribute.name.startsWith('on') ? 'handler' : 'value',
        )
        break
      default:
        add(attribute.expression)
    }
  }

  /**
   * Visits the nodes of a fragment.
   *
   * @param fragment - Fragment, or null when the block has none.
   */
  function visitFragment(fragment: AST.Fragment | undefined | null): void {
    if (!fragment) {
      return
    }
    for (let node of fragment.nodes) {
      visitNode(node)
    }
  }

  /**
   * Adds the code of a template node and of the nodes inside it.
   *
   * @param node - Node of a fragment.
   */
  function visitNode(node: FragmentNode): void {
    switch (node.type) {
      case 'DeclarationTag':
      case 'ConstTag':
        add(node.declaration, 'declaration')
        break
      case 'ExpressionTag':
      case 'AttachTag':
      case 'HtmlTag':
        add(node.expression)
        break
      case 'SnippetBlock':
        visitFragment(node.body)
        break
      case 'AwaitBlock':
        add(node.expression)
        visitFragment(node.pending)
        visitFragment(node.then)
        visitFragment(node.catch)
        break
      case 'RenderTag': {
        let call =
          node.expression.type === 'ChainExpression' ?
            node.expression.expression
          : node.expression
        for (let argument of call.arguments) {
          add(argument.type === 'SpreadElement' ? argument.argument : argument)
        }
        break
      }
      case 'EachBlock':
        if (node.context !== null) {
          add(node.expression)
        }
        visitFragment(node.body)
        visitFragment(node.fallback)
        break
      case 'DebugTag':
      case 'Text':
        break
      case 'KeyBlock':
        add(node.expression)
        visitFragment(node.fragment)
        break
      case 'Comment':
        comments.push({
          start: node.start,
          value: node.data,
          end: node.end,
          type: 'Block',
        })
        break
      case 'IfBlock':
        add(node.test, 'condition')
        visitFragment(node.consequent)
        visitFragment(node.alternate)
        break
      default:
        if (node.type === 'SvelteElement') {
          if (!isStringTag(node.tag)) {
            add(node.tag)
          }
        } else if (node.type === 'SvelteComponent') {
          add(node.expression)
        }
        for (let attribute of node.attributes) {
          visitAttribute(attribute, listeningTypes.has(node.type))
        }
        visitFragment(node.fragment)
    }
  }

  visitFragment(root.fragment)
  return {
    expressions: expressions.toSorted(
      (left, right) => left.start - right.start,
    ),
    comments: comments.toSorted((left, right) => left.start - right.start),
  }
}

/**
 * Tells whether the `this` of a `<svelte:element>` is written as a string, not
 * in braces. Svelte then gives a literal whose range leaves out the quotes that
 * its `raw` text has.
 *
 * @param tag - Expression of the `this` attribute.
 * @returns Whether the tag is a string attribute.
 */
function isStringTag(tag: AST.SvelteElement['tag']): boolean {
  if (tag.type !== 'Literal') {
    return false
  }
  let range: object = tag
  let { start, end } = range as SourceRange
  return tag.raw!.length !== end - start
}
