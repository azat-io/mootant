import type {
  SimpleExpressionNode,
  TemplateChildNode,
  InterpolationNode,
  ExpressionNode,
  DirectiveNode,
  CommentNode,
  ElementNode,
  RootNode,
} from '@vue/compiler-dom'
import type { Comment } from 'oxc-parser'

import type { TemplateExpression } from '../../types/source/template-expression'
import type { TemplateParts } from '../../types/source/template-parts'

import { findVueTemplate } from './find-vue-template'

/**
 * Numbers of the node types of the Vue tree that mootant reads, as `NodeTypes`
 * of `@vue/compiler-dom` defines them; the enum is not imported, so the
 * compiler loads only when a template is read.
 */
const NODE_TYPES = {
  INTERPOLATION: 5,
  DIRECTIVE: 7,
  ELEMENT: 1,
  COMMENT: 3,
}

/**
 * Directives whose expression is a pattern or a list the compiler reads as
 * written: `v-model` needs an assignable target, `v-slot` takes parameters and
 * `v-memo` lists the values that decide whether a subtree is rendered again.
 */
let skippedDirectives = new Set(['model', 'memo', 'slot'])

/**
 * Directives whose expression is read for its truthiness.
 */
let conditionDirectives = new Set(['else-if', 'show', 'if'])

/**
 * Collects the code of a Vue 3 template that mootant mutates, from the tree of
 * `parse(source, { parseMode: 'sfc' })`: interpolations and the expressions of
 * directives in the top-level `<template>` of the component, unless it names
 * another language or an external file. `v-if`, `v-else-if` and `v-show` are
 * conditions, `v-on` with an event name is an event handler, and of `v-for`
 * only the list after `in` or `of` is read. Code the compiler reads as a
 * pattern or as written is left out: `v-model`, `v-slot`, `v-memo`, `:key`, the
 * aliases of `v-for` and the names of dynamic arguments. So is an expression
 * whose text holds a character reference, which Vue decodes, and an attribute
 * value without quotes, which has no room for the mutant switch. Every
 * expression notes the text that ends it: the quote of its attribute or the
 * `}}` of its interpolation.
 *
 * @param root - Tree of the component file.
 * @param source - Text of the file.
 * @returns Expressions to mutate and the HTML comments of the template, in
 *   source order.
 */
export function collectVueExpressions(
  root: RootNode,
  source: string,
): TemplateParts {
  let expressions: TemplateExpression[] = []
  let comments: Comment[] = []

  /**
   * Adds an expression unless it is blank or Vue decoded a character reference
   * in it.
   *
   * @param expression - Expression node of the Vue tree.
   * @param wrap - How the synthetic module holds it.
   * @param delimiter - Text that ends the template code around it.
   */
  function add(
    expression: ExpressionNode,
    wrap: TemplateExpression['wrap'],
    delimiter: TemplateExpression['delimiter'],
  ): void {
    let { start, end } = expression.loc
    if (expression.loc.source.trim() !== '' && !decodes(expression)) {
      expressions.push({
        start: start.offset,
        end: end.offset,
        delimiter,
        wrap,
      })
    }
  }

  /**
   * Adds the expression of a directive written in quotes.
   *
   * @param directive - Directive of an element.
   */
  function visitDirective(directive: DirectiveNode): void {
    let { name, exp, arg } = directive
    let quote = exp ? source[exp.loc.start.offset - 1] : null
    if (!exp || (quote !== '"' && quote !== "'") || decodes(exp)) {
      return
    }
    if (name === 'for') {
      if (directive.forParseResult) {
        add(directive.forParseResult.source, 'value', quote)
      }
    } else if (conditionDirectives.has(name)) {
      add(exp, 'condition', quote)
    } else if (name === 'on') {
      add(exp, arg ? 'event' : 'value', quote)
    } else if (!skippedDirectives.has(name) && !isKeyBinding(directive)) {
      add(exp, 'value', quote)
    }
  }

  /**
   * Adds the code of a node of the template and of the nodes inside it.
   *
   * @param node - Child node of the template.
   */
  function visitNode(node: TemplateChildNode): void {
    switch (node.type) {
      case NODE_TYPES.INTERPOLATION:
        add((node as InterpolationNode).content, 'value', '}}')
        break
      case NODE_TYPES.COMMENT: {
        let { content, loc } = node as CommentNode
        comments.push({
          start: loc.start.offset,
          end: loc.end.offset,
          value: content,
          type: 'Block',
        })
        break
      }
      case NODE_TYPES.ELEMENT: {
        let element = node as ElementNode
        for (let property of element.props) {
          if (property.type === NODE_TYPES.DIRECTIVE) {
            visitDirective(property as DirectiveNode)
          }
        }
        for (let child of element.children) {
          visitNode(child)
        }
        break
      }
      default:
    }
  }

  let template = findVueTemplate(root)
  if (template) {
    for (let child of template.children) {
      visitNode(child)
    }
  }
  return { expressions, comments }
}

/**
 * Tells whether a directive binds the `key` of a node, which the compiler reads
 * to match nodes between renders.
 *
 * @param directive - Directive of an element.
 * @returns Whether it is `:key` or `v-bind:key`.
 */
function isKeyBinding(directive: DirectiveNode): boolean {
  let { name, arg } = directive
  return (
    name === 'bind' &&
    arg !== undefined &&
    (arg as SimpleExpressionNode).isStatic &&
    (arg as SimpleExpressionNode).content === 'key'
  )
}

/**
 * Tells whether Vue decoded a character reference in an expression, so its text
 * differs from the source.
 *
 * @param expression - Expression node of the Vue tree.
 * @returns Whether the content of the node is not its source text.
 */
function decodes(expression: ExpressionNode): boolean {
  return (expression as SimpleExpressionNode).content !== expression.loc.source
}
