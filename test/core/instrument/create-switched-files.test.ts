import { describe, expect, it } from 'vitest'
import * as svelte from 'svelte/compiler'
import * as vue from '@vue/compiler-dom'

import { createSwitchedFiles } from '../../../core/instrument/create-switched-files'
import { createMutant } from '../../helpers/create-mutant'

describe('createSwitchedFiles', () => {
  it('switches files with pending mutants and hosts only those', () => {
    expect(
      createSwitchedFiles([
        {
          mutants: [
            createMutant({ replacement: '2', start: 8, end: 9 }),
            createMutant({
              status: 'Ignored',
              start: 12,
              id: 'm2',
              end: 13,
            }),
          ],
          source: 'let a = 1 + 3',
          absolute: '/root/a.ts',
          file: 'a.ts',
        },
      ]),
    ).toStrictEqual({
      switched: [
        {
          switched: 'let a = (globalThis.__mootant?.hit("m1") ? (2) : (1)) + 3',
          original: 'let a = 1 + 3',
          file: '/root/a.ts',
        },
      ],
      diagnostics: [],
    })
  })

  it('leaves out unread files and files without pending mutants', () => {
    expect(
      createSwitchedFiles([
        {
          mutants: [createMutant({ start: 0, end: 1 })],
          absolute: '/root/a.ts',
          source: null,
          file: 'a.ts',
        },
        {
          mutants: [createMutant({ status: 'Ignored', start: 0, end: 1 })],
          absolute: '/root/b.ts',
          file: 'b.ts',
          source: 'a',
        },
        { absolute: '/root/c.ts', file: 'c.ts', source: 'a', mutants: [] },
      ]),
    ).toStrictEqual({ diagnostics: [], switched: [] })
  })

  it('reports a file whose mutants cannot be hosted and goes on', () => {
    expect(
      createSwitchedFiles([
        {
          mutants: [
            createMutant({ start: 0, end: 5 }),
            createMutant({ start: 3, id: 'm2', end: 7 }),
          ],
          absolute: '/root/a.ts',
          source: 'let a = 1',
          file: 'a.ts',
        },
        {
          mutants: [createMutant({ start: 0, end: 1 })],
          absolute: '/root/b.ts',
          file: 'b.ts',
          source: 'a',
        },
      ]),
    ).toStrictEqual({
      diagnostics: [
        {
          message:
            'Cannot host the mutants of a.ts. Mutant ranges of example.ts overlap at 3.',
          code: 'instrument-error',
          severity: 'error',
          column: null,
          file: 'a.ts',
          line: null,
        },
      ],
      switched: [
        {
          switched: ';(globalThis.__mootant?.hit("m1") ? (x) : (a))',
          file: '/root/b.ts',
          original: 'a',
        },
      ],
    })
  })
  it('reports a Svelte component whose switched text does not compile', () => {
    let source = '<script>let a = $state(1)</script><input bind:value={a} />'

    expect(
      createSwitchedFiles(
        [
          {
            mutants: [createMutant({ file: 'a.svelte', start: 53, end: 54 })],
            absolute: '/root/a.svelte',
            file: 'a.svelte',
            source,
          },
          {
            mutants: [createMutant({ file: 'b.svelte', start: 4, end: 5 })],
            absolute: '/root/b.svelte',
            source: '<p>{b}</p>',
            file: 'b.svelte',
          },
        ],
        { vue: null, svelte },
      ),
    ).toStrictEqual({
      diagnostics: [
        {
          message:
            'Cannot host the mutants of a.svelte. Svelte does not compile the switched file: Can only bind to an Identifier or MemberExpression or a `{get, set}` pair https://svelte.dev/e/bind_invalid_expression',
          code: 'instrument-error',
          severity: 'error',
          file: 'a.svelte',
          column: null,
          line: null,
        },
      ],
      switched: [
        {
          switched: '<p>{(globalThis.__mootant?.hit("m1") ? (x) : (b))}</p>',
          original: '<p>{b}</p>',
          file: '/root/b.svelte',
        },
      ],
    })
  })

  it('does not compile Svelte components without a compiler', () => {
    let source = '<script>let a = $state(1)</script><input bind:value={a} />'

    expect(
      createSwitchedFiles([
        {
          mutants: [createMutant({ file: 'a.svelte', start: 53, end: 54 })],
          absolute: '/root/a.svelte',
          file: 'a.svelte',
          source,
        },
      ]).diagnostics,
    ).toStrictEqual([])
  })

  it('reports a Vue component whose switched template does not compile', () => {
    let source = '<template><p @click="go(); n++">{{ a }}</p></template>'
    let compilers = { svelte: null, vue }
    let broken = createMutant({
      replacement: 'a +',
      file: 'a.vue',
      start: 35,
      end: 36,
    })
    let update = createMutant({
      replacement: 'n--',
      file: 'b.vue',
      start: 27,
      end: 30,
    })

    expect(
      createSwitchedFiles(
        [
          { absolute: '/root/a.vue', mutants: [broken], file: 'a.vue', source },
          { absolute: '/root/b.vue', mutants: [update], file: 'b.vue', source },
        ],
        compilers,
      ),
    ).toStrictEqual({
      diagnostics: [
        {
          message:
            'Cannot host the mutants of a.vue. Vue does not compile the switched template: Error parsing JavaScript expression: Unexpected token (1:47)',
          code: 'instrument-error',
          severity: 'error',
          file: 'a.vue',
          column: null,
          line: null,
        },
      ],
      switched: [
        {
          switched:
            '<template><p @click="go(); {}(Math[Symbol.for(`mootant`)]?.hit(`m1`) ? (n--) : (n++))">{{ a }}</p></template>',
          file: '/root/b.vue',
          original: source,
        },
      ],
    })
  })
})
