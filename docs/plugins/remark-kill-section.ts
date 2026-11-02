import type { RemarkPlugin } from '@astrojs/markdown-remark'

import type { MarkdownNode } from './markdown-node'

import { getText } from './get-text'

/**
 * Title of the section of a mutator page that shows a test catching a mutant.
 */
const SECTION_TITLE = 'Kill a surviving mutant'

/**
 * Line of a test that checks the result.
 */
const EXPECT_PATTERN = /\bexpect\(/u

/**
 * Shows the mutant of a mutator page in place. The section has a function, a
 * sentence with the mutant as `before` → `after`, the test that catches it and
 * a sentence that starts with "With the mutant". The function gets the mutant
 * as `-` and `+` lines, the check of the test stands out and the last sentence
 * becomes the verdict. A section of another shape stops the build, so a page
 * cannot lose these parts unnoticed.
 *
 * @returns Transformer that changes the section of a page.
 */
export let remarkKillSection: RemarkPlugin = () => (tree, file) => {
  let children = (tree as MarkdownNode).children ?? []
  let start = children.findIndex(
    node => isSectionHeading(node) && getText(node) === SECTION_TITLE,
  )
  if (start === -1) {
    return
  }
  let end = children.findIndex(
    (node, index) => index > start && isSectionHeading(node),
  )
  let section = children.slice(start + 1, end === -1 ? undefined : end)

  function fail(reason: string): never {
    throw new Error(`${file.path}: "${SECTION_TITLE}" ${reason}`)
  }

  let [source, test] = section.filter(({ type }) => type === 'code')
  if (!source || !test) {
    return fail('needs a function and a test in code blocks')
  }
  let between = section.slice(section.indexOf(source), section.indexOf(test))
  let mutant = between.flatMap(node => getMutants(node)).at(-1)
  if (!mutant) {
    return fail('needs the mutant as `before` → `after` before the test')
  }
  let sourceLines = source.value!.split('\n')
  let changed = sourceLines.filter(line => line.includes(mutant.before))
  if (changed.length !== 1) {
    return fail(`has ${changed.length} lines with ${mutant.before}`)
  }
  source.value = sourceLines
    .flatMap(line =>
      line.includes(mutant.before) ?
        [
          `${line}// [!code --]`,
          `${line.replace(mutant.before, () => mutant.after)}// [!code ++]`,
        ]
      : [line],
    )
    .join('\n')

  let testLines = test.value!.split('\n')
  if (testLines.filter(line => EXPECT_PATTERN.test(line)).length !== 1) {
    return fail('needs a test with one expect call')
  }
  test.value = testLines
    .map(line =>
      EXPECT_PATTERN.test(line) ? `${line}// [!code highlight]` : line,
    )
    .join('\n')

  let verdict = section[section.indexOf(test) + 1]
  if (
    verdict?.type !== 'paragraph' ||
    !getText(verdict).startsWith('With the mutant')
  ) {
    return fail('needs a sentence with "With the mutant" after the test')
  }
  verdict.data = { hProperties: { className: ['verdict'] } }
}

/**
 * Finds the mutants written as two pieces of inline code with an arrow.
 *
 * @param node - Node to search, usually a paragraph.
 * @returns Code before and after each mutant, in order.
 */
function getMutants(node: MarkdownNode): { before: string; after: string }[] {
  let children = node.children ?? []
  return children.flatMap((child, index) => {
    let arrow = children[index + 1]
    let after = children[index + 2]
    return (
        child.type === 'inlineCode' &&
          arrow?.type === 'text' &&
          arrow.value?.trim() === '→' &&
          after?.type === 'inlineCode'
      ) ?
        [{ before: child.value!, after: after.value! }]
      : []
  })
}

/**
 * Tells whether a node is a second level heading.
 *
 * @param node - Node to check.
 * @returns True for a heading that starts a section of a page.
 */
function isSectionHeading(node: MarkdownNode): boolean {
  return node.type === 'heading' && node.depth === 2
}
