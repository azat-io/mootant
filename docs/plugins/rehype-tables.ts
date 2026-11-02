import type { RehypePlugin } from '@astrojs/markdown-remark'

import type { HastNode } from './wrap-elements'

import { isMutantColumn } from './is-mutant-column'
import { getTextNode } from './get-text-node'
import { getElements } from './get-elements'
import { getTitles } from './get-titles'
import { getText } from './get-text'

/**
 * Roles of table elements. Narrow screens show a wide table as a stack of rows,
 * and the CSS that does so takes these roles away from the elements.
 */
let roles: Record<string, string> = {
  th: 'columnheader',
  thead: 'rowgroup',
  tbody: 'rowgroup',
  td: 'cell',
  tr: 'row',
}

/**
 * Prepares the tables of a page. A table of three or more columns, or with code
 * and its mutant side by side, gets the class that stacks its rows on narrow
 * screens, with each cell labeled by its column. A table of skipped changes,
 * written with the columns Reason, Example and Rule, becomes two columns: the
 * change, then its reason with the category and the rule under it. The table of
 * categories gets each category as an element of its own. A row of skipped
 * changes of another shape stops the build, so a page cannot lose its rule or
 * category unnoticed.
 *
 * @returns Transformer that changes the tables of a page.
 */
export let rehypeTables: RehypePlugin = () => (tree, file) => {
  function visit(node: HastNode): void {
    if (node.tagName === 'table') {
      let titles = getTitles(node)
      let isStacked =
        titles.length >= 3 || titles.some(title => isMutantColumn(title))
      if (titles.join(',') === 'Reason,Example,Rule') {
        markSkippedChanges(node)
      }
      if (isStacked) {
        stackTable(node, getTitles(node))
      }
      if (titles[0] === 'Category') {
        markCategories(node)
      }
      return
    }
    let { children = [] } = node
    for (let child of children) {
      visit(child)
    }
  }

  function markSkippedChanges(table: HastNode): void {
    addClass(table, 'skips')
    let [head, body] = getElements(table)
    let titleRow = getElements(head)[0]!
    let [reasonTitle, exampleTitle] = getElements(titleRow)
    exampleTitle!.children = [getTextNode('Change')]
    titleRow.children = [exampleTitle!, reasonTitle!]
    for (let row of getElements(body)) {
      let [reason, example, rule] = getElements(row)
      let change = getChange(example)
      let ruleLine = getRuleLine(rule)
      if (!reason || !example || !change || !ruleLine) {
        throw new Error(
          `${file.path}: skipped change "${getText(row)}" needs code, a mutant, a rule and a category`,
        )
      }
      example.children = [change]
      reason.children = [...(reason.children ?? []), ruleLine]
      row.children = [example, reason]
    }
  }

  visit(tree)
}

/**
 * Prepares a table for the stack of rows it becomes on narrow screens.
 *
 * @param table - Table to change.
 * @param titles - Titles of its columns.
 */
function stackTable(table: HastNode, titles: string[]): void {
  addClass(table, 'stacked')
  table.properties = { ...table.properties, role: 'table' }
  let groups = getElements(table)
  let rows = getElements(groups[1])
  for (let group of groups) {
    addRoles(group)
  }
  for (let row of rows) {
    for (let [index, cell] of getElements(row).entries()) {
      let title = titles[index]
      if (title) {
        cell.properties = { ...cell.properties, 'data-label': title }
      }
    }
  }
}

/**
 * Builds the skipped change of a row: the code, the mutant under it after an
 * arrow, then the case it applies to, such as `for cart: Cart`.
 *
 * @param cell - Cell with the code, an arrow, the mutant and maybe the case.
 * @returns Element of the change, or nothing for a cell of another shape.
 */
function getChange(cell: undefined | HastNode): undefined | HastNode {
  let [before, arrow, after, ...context] = cell?.children ?? []
  if (
    before?.tagName !== 'code' ||
    after?.tagName !== 'code' ||
    arrow?.value?.trim() !== '→'
  ) {
    return undefined
  }
  return getPart('skip-change', [
    before,
    getPart('skip-arrow', [getTextNode('→')]),
    after,
    ...(context.length > 0 ? [getPart('skip-context', context)] : []),
  ])
}

/**
 * Builds the line with the category and the rule of a skipped change. The
 * category goes first, so the colors of a table form one column.
 *
 * @param cell - Cell with the rule in code, a comma and the category.
 * @returns Element of the line, or nothing for a cell of another shape.
 */
function getRuleLine(cell: undefined | HastNode): undefined | HastNode {
  let [rule, separator] = cell?.children ?? []
  let category = /^,\s*(?<name>\w+)$/u.exec(separator?.value ?? '')?.groups?.[
    'name'
  ]
  if (!category || rule?.tagName !== 'code') {
    return undefined
  }
  return getPart('skip-rule', [
    getCategory(category, [getTextNode(category)]),
    rule,
  ])
}

/**
 * Marks the first cell of each row in the table that lists the categories, so
 * the table also explains the colors of the categories.
 *
 * @param table - Table to change.
 */
function markCategories(table: HastNode): void {
  let [, body] = getElements(table)
  for (let row of getElements(body)) {
    let [cell] = getElements(row)
    if (cell) {
      cell.children = [getCategory(getText(cell), cell.children ?? [])]
    }
  }
}

/**
 * Builds the element of a category.
 *
 * @param category - Value of its data attribute, which picks its color.
 * @param children - Content of the element.
 * @returns Element with the name of the category as data.
 */
function getCategory(category: string, children: HastNode[]): HastNode {
  return {
    properties: {
      'data-category': category,
      className: ['category'],
    },
    type: 'element',
    tagName: 'span',
    children,
  }
}

/**
 * Adds a class to an element.
 *
 * @param node - Element to change.
 * @param name - Class to add.
 */
function addClass(node: HastNode, name: string): void {
  let className = node.properties?.['className']
  node.properties = {
    ...node.properties,
    className: [...(Array.isArray(className) ? className : []), name],
  }
}

/**
 * Gives a table element and the table elements under it their roles.
 *
 * @param node - Table element.
 */
function addRoles(node: HastNode): void {
  let role = roles[node.tagName ?? '']
  if (role) {
    node.properties = { ...node.properties, role }
    for (let child of getElements(node)) {
      addRoles(child)
    }
  }
}

/**
 * Builds an inline element with a class.
 *
 * @param name - Class of the element.
 * @param children - Content of the element.
 * @returns Element for the children of a cell.
 */
function getPart(name: string, children: HastNode[]): HastNode {
  return {
    properties: { className: [name] },
    type: 'element',
    tagName: 'span',
    children,
  }
}
