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
 * with the columns Reason, Example and Rule, gets the category of each rule,
 * such as `timer-delay`, noise, as an element of its own, and so does the table
 * of categories. A rule cell of another shape stops the build, so a page cannot
 * lose its category unnoticed.
 *
 * @returns Transformer that changes the tables of a page.
 */
export let rehypeTables: RehypePlugin = () => (tree, file) => {
  function visit(node: HastNode): void {
    if (node.tagName === 'table') {
      let titles = getTitles(node)
      if (titles.length >= 3 || titles.some(title => isMutantColumn(title))) {
        stackTable(node, titles)
      }
      if (titles.join(',') === 'Reason,Example,Rule') {
        markSkippedChanges(node)
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
    let [, body] = getElements(table)
    for (let row of getElements(body)) {
      let cell = getElements(row).at(-1)!
      let [rule, separator] = cell.children ?? []
      let category = /^,\s*(?<name>\w+)$/u.exec(separator?.value ?? '')
        ?.groups?.['name']
      if (!category || rule?.tagName !== 'code') {
        throw new Error(
          `${file.path}: skipped change "${getText(cell)}" needs a rule and a category`,
        )
      }
      cell.children = [rule, getCategory(category, [getTextNode(category)])]
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
