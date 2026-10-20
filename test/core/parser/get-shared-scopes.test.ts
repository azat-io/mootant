import type { Program, Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'
import * as svelte from 'svelte/compiler'
import * as vue from '@vue/compiler-dom'

import { parseComponentTemplate } from '../../../core/parser/parse-component-template'
import { getSharedScopes } from '../../../core/parser/get-shared-scopes'
import { getSourceBlocks } from '../../../core/parser/get-source-blocks'
import { parseFile } from '../../../core/parser/parse-file'

/**
 * Lists the shared scopes of the template program of a component as the types
 * of their nodes, with the index of each top-level statement.
 *
 * @param file - Path of the component.
 * @param source - Text of the component.
 * @returns Node type of the program, then `<index>:<type>` of each statement.
 * @throws Error - When the template does not parse.
 */
function describeTemplateScopes(file: string, source: string): string[] {
  let template = parseComponentTemplate(
    { svelte, vue },
    { lang: 'js', source, file },
  )
  if (template.kind !== 'parsed') {
    throw new Error(`The template of ${file} does not parse.`)
  }
  let { program } = template.parsed
  let statements: readonly Node[] = program.body
  return [...getSharedScopes(file, program, template.expressions)].map(scope =>
    scope === program ?
      scope.type
    : `${statements.indexOf(scope)}:${scope.type}`,
  )
}

/**
 * Parses the first script block of a file, or the whole text of a JavaScript or
 * TypeScript file.
 *
 * @param file - Path of the file.
 * @param source - Text of the file.
 * @returns Program of the block.
 * @throws Error - When the block does not parse.
 */
function parseScript(file: string, source: string): Program {
  let [block] = getSourceBlocks(file, source)
  let outcome = parseFile(file, block!.text, block)
  if (outcome.kind === 'failed') {
    throw new Error(`The first block of ${file} does not parse.`)
  }
  return outcome.parsed.program
}

describe('getSharedScopes', () => {
  it.each([
    { source: 'let n = 1', file: 'src/a.ts' },
    { source: 'let n = $state(0)', file: 'src/store.svelte.ts' },
  ])('shares no scope of $file', ({ source, file }) => {
    expect(getSharedScopes(file, parseScript(file, source), null).size).toBe(0)
  })

  it.each([
    { source: '<script>let n = 1</script>', file: 'src/Card.svelte' },
    { source: '<script setup>let n = 1</script>', file: 'src/App.vue' },
    { source: '---\nlet n = 1\n---\n<p>{n}</p>', file: 'src/Page.astro' },
  ])('shares the program of a script block of $file', ({ source, file }) => {
    let program = parseScript(file, source)

    expect([...getSharedScopes(file, program, null)]).toStrictEqual([program])
  })

  it('shares the blocks of the declaration tags of a Svelte template', () => {
    expect(
      describeTemplateScopes(
        'src/Card.svelte',
        [
          "{let at = s.indexOf(':')}",
          '<p>{at}</p>',
          '{#if at > 0}{@const k = at + 1}<i>{k}</i>{/if}',
        ].join('\n'),
      ),
    ).toStrictEqual(['Program', '0:BlockStatement', '3:BlockStatement'])
  })

  it('shares only the program of a Vue template with event handlers', () => {
    expect(
      describeTemplateScopes(
        'src/App.vue',
        '<template><i @click="let n = 0; go(n)">{{ n }}</i></template>',
      ),
    ).toStrictEqual(['Program'])
  })
})
