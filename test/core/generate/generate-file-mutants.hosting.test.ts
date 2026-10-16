import { describe, expect, it } from 'vitest'

import type { Mutant } from '../../../types/mutant/mutant'

import { getSyntaxFingerprint } from '../../helpers/get-syntax-fingerprint'
import { getSourceBlocks } from '../../../core/parser/get-source-blocks'
import { generateMutants } from '../../helpers/generate-mutants'
import { parseFile } from '../../../core/parser/parse-file'
import { applyMutant } from '../../helpers/apply-mutant'
import { walkTree } from '../../../core/tree/walk-tree'

/**
 * Snippets whose mutants exercise the text rules and the hosting rule: the text
 * rules of catalog 14 (operator gaps with comments and parentheses, merges,
 * regrouped operands, missing outer guards, list removals, numeric and template
 * texts, unrepresented parentheses, chain edits), the review cases of 12.5,
 * statements without semicolons for the ASI guard, and the script blocks of
 * Vue, Svelte and Astro components, whose mutants must leave every block
 * parsing.
 */
const SNIPPETS: { lines: string[]; file: string }[] = [
  {
    lines: [
      'x = a /* + */ - b',
      ';(a) += 1',
      'x = a+-b',
      'x = a*/re/.source',
      'x = a<=!--b',
      'x = 1?.x',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'declare let a: number, b: number, c: number, q: boolean',
      'x = a < b < c',
      'x = q === a < b',
      'x = a < b as boolean',
      'x = a | b & c',
      'x = a ?? b ?? c',
      'x = a < b > (c)',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'let get = () => cfg || {}',
      'x = a / b ** 2',
      'x = a-++b',
      'x = 1..toFixed(2)',
      'x = b - -c',
      'x = a ** -b',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'f([ only ])',
      'x = [a, b,]',
      'x = [a, /* c */ b]',
      'g(a, /* b */)',
      'x = { a, b: 1, }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'x = 0x1f',
      'x = 1_000',
      'x = 1e3',
      'x = 10n',
      'x = 0',
      'x = 9007199254740992',
      'x = 0.5',
      'x = -1',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      `x = \`a\${b}c\``,
      'x = ``',
      `x = \`\${a}\${b}\``,
      String.raw`x = 'it\'s'`,
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'x = ((a)) + b',
      'if ((flag)) run()',
      'function f() { return (a + b) }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'x = a?.b.c',
      'x = a?.b!.c',
      'x = value?.trim()!.toLowerCase()',
      'v?.trim()!',
      'x = v?.trim()![0]',
      'v?.trim()!()',
      'x = l?.sort()!.at(0)',
      'x = a?.[k]',
      'x = a?.b?.c',
      'callback?.()',
      'x = a?.b()',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'let x = y',
      'a || b',
      'count++',
      'callback?.()',
      '[a, b].forEach(run)',
      ';`t`.trim()',
      'a && b',
      '-x',
      'run()',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'let i = 3, n = 2, k = 1',
      'while (i--) run()',
      'while (n-- > 0) run()',
      'do { run() } while (--k)',
      'outer: for (;;) { if (done()) break outer }',
      'for (let j = 0; ; j++) { if (j > 2) break }',
    ],
    file: 'example.js',
  },
  {
    lines: [
      'function f(a, b, x) {',
      "  if (x || '') go()",
      '  const y = compute()',
      "  emitter.emit('change', y)",
      '  return a + b',
      '}',
      `function g(a, b, x) { return \`\${a}\${b}\` + typeof x }`,
    ],
    file: 'example.js',
  },
  {
    lines: [
      "function f(x: number): string { return x >= 5 ? '' : 'small' }",
      'function g(ok: boolean): boolean { return ok ? true : false }',
      'function h(u: { isOwner: boolean; isActive: boolean }) { return u.isOwner && u.isActive }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'async function f(id: string) {',
      '  const user = await api.get(id)',
      '  if ((await count()) === 0) stop()',
      '  await tx.join()',
      '  return user',
      '}',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'const rows = items.filter(row => row.visible ?? false)',
      'const sorted = rows.toSorted((a, b) => a.n > b.n ? 1 : -1)',
      'const max = a > b ? a : b',
      "const tail = path.slice(-1) === '/' ? parts.slice(-1)[0] : s.slice(0)",
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'x = Boolean(y, extra)',
      'x = (Boolean)(y)',
      'class A { #x = 1; has(o: object) { return #x in o } }',
      'x ||= y',
      'x ??= y',
      'x &&= y',
      'delete s.trim()',
      'x = typeof f?.()',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'switch (k) {',
      '  case 1:',
      '    run()',
      '    break',
      '  case 2: {',
      '    stop()',
      '  }',
      '  default:',
      '    go()',
      '}',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(list: number[]) {',
      '  let sum = 0',
      '  for (const x of list) sum += x',
      '  using resource = open()',
      '  try { return sum } catch { return null } finally { close() }',
      '}',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'const view = ok && <A />',
      "const other = <B title={'x'} on={a || b} />",
    ],
    file: 'example.tsx',
  },
  {
    lines: [
      '<template>',
      '  <p v-if="count > 0">{{ count + 1 }}</p>',
      '</template>',
      '<script>',
      "export default { name: 'Counter' }",
      '</script>',
      '<script setup lang="ts">',
      'let count = ref(0)',
      'function add(step: number): number {',
      '  count.value += step',
      '  return count.value * 2',
      '}',
      'add(1)',
      '</script>',
    ],
    file: 'Counter.vue',
  },
  {
    lines: [
      '<script context="module">',
      'export let limit = 10',
      '</script>',
      '<script>',
      '  let items = []',
      '  $: full = items.length >= limit',
      "  function push(item) { if (item.trim() !== '') items = [...items, item] }",
      '</script>',
      '{#if full}<p>{items.length - 1}</p>{/if}',
    ],
    file: 'List.svelte',
  },
  {
    lines: [
      '---',
      'const { title } = Astro.props',
      "if (!title) return Astro.redirect('/404')",
      'const upper = title.toUpperCase()',
      '---',
      '<h1>{upper.length > 3 ? upper : title}</h1>',
      '<script>',
      "  document.addEventListener('click', () => { count += 1 })",
      '</script>',
      '<script is:inline>send(a && b)</script>',
    ],
    file: 'index.astro',
  },
]

/**
 * Mutant applied to its file, with what the hosting checks read.
 */
interface HostedMutant {
  /**
   * Syntax fingerprint of the mutated file, or null when it does not parse.
   */
  fingerprint: string | null

  /**
   * Whether an expression mutant at the start of a statement lost that
   * statement to the one before it.
   */
  absorbed: boolean

  /**
   * Mutator, original text and replacement, for failure messages.
   */
  label: string
}

/**
 * Applies a mutant to its file and records what the hosting checks read. The
 * ASI guard may put a semicolon before the replacement; the statement then
 * starts after it.
 *
 * @param snippet - Text and file name of the snippet.
 * @param statements - Start offsets of the expression statements of the
 *   snippet.
 * @param mutant - Mutant of the snippet.
 * @returns The fingerprint, the absorption check and a label of the mutant.
 */
function hostMutant(
  snippet: { source: string; file: string },
  statements: Set<number>,
  mutant: Mutant,
): HostedMutant {
  let { source, file } = snippet
  let text = applyMutant(source, mutant)
  let start = text[mutant.start] === ';' ? mutant.start + 1 : mutant.start
  return {
    absorbed:
      mutant.kind === 'expression' &&
      statements.has(mutant.start) &&
      !getStatementStarts(file, text).has(start),
    label: `${mutant.mutator} ${source.slice(mutant.start, mutant.end)} -> ${mutant.replacement}`,
    fingerprint: getSyntaxFingerprint(file, text),
  }
}

/**
 * Lists the offsets where expression statements start.
 *
 * @param file - File name, whose extension selects the language; the script
 *   blocks of a component file are parsed one by one.
 * @param source - Text of a file that parses.
 * @returns Start offsets of the expression statements.
 */
function getStatementStarts(file: string, source: string): Set<number> {
  let starts = new Set<number>()
  for (let block of getSourceBlocks(file, source)) {
    let outcome = parseFile(file, block.text, block)
    if (outcome.kind === 'parsed') {
      walkTree(outcome.parsed.program, node => {
        if (node.type === 'ExpressionStatement') {
          starts.add(node.start)
        }
        return true
      })
    }
  }
  return starts
}

describe('generateFileMutants', () => {
  it.each(
    SNIPPETS.flatMap(snippet =>
      ['recommended', 'strict'].map(preset => ({ ...snippet, preset })),
    ),
  )(
    'hosts every mutant of $lines.0 and the next lines under $preset',
    ({ preset, lines, file }) => {
      let source = lines.join('\n')
      let statements = getStatementStarts(file, source)
      // The fingerprint covers the scripts; template mutants are hosted by
      // the compile test of instrumentFile.
      let hosted = generateMutants(source, {
        settings: { templates: false },
        preset,
        file,
      }).map(mutant => hostMutant({ source, file }, statements, mutant))
      let fingerprints = hosted.map(mutant => mutant.fingerprint)

      expect(hosted.length).toBeGreaterThan(0)
      expect(
        hosted.filter(mutant => mutant.fingerprint === null),
      ).toStrictEqual([])
      expect(
        hosted.filter(
          mutant => mutant.fingerprint === getSyntaxFingerprint(file, source),
        ),
      ).toStrictEqual([])
      expect(
        hosted.filter(
          (mutant, index) => fingerprints.indexOf(mutant.fingerprint) !== index,
        ),
      ).toStrictEqual([])
      expect(hosted.filter(mutant => mutant.absorbed)).toStrictEqual([])
    },
  )
})
