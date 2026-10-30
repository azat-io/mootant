import { describe, expect, it } from 'vitest'
import * as svelte from 'svelte/compiler'
import * as vue from '@vue/compiler-dom'

import type {
  UnsoundSkips,
  MutantProbe,
  SkipProbe,
} from '../../helpers/find-unsound-skips'
import type { ExpressionCheck } from '../../helpers/check-expression-mutants'
import type { ActiveMutator } from '../../../types/mutator/active-mutator'
import type { FormulaDomains } from '../../helpers/get-formula-inputs'
import type { FileMutants } from '../../../types/mutant/file-mutants'
import type { WeakMutants } from '../../helpers/find-weak-mutants'
import type { Mutator } from '../../../types/mutator/mutator'
import type { Mutant } from '../../../types/mutant/mutant'

import { generateFileMutants } from '../../../core/generate/generate-file-mutants'
import { checkExpressionMutants } from '../../helpers/check-expression-mutants'
import { getClassicAlternatives } from '../../helpers/get-classic-alternatives'
import { getSyntaxFingerprint } from '../../helpers/get-syntax-fingerprint'
import { createMutantId } from '../../../core/identity/create-mutant-id'
import { getSourceBlocks } from '../../../core/parser/get-source-blocks'
import { updateOperator } from '../../../core/mutators/update-operator'
import { generateCandidates } from '../../helpers/generate-candidates'
import { stringLiteral } from '../../../core/mutators/string-literal'
import { findUnsoundSkips } from '../../helpers/find-unsound-skips'
import { getFormulaInputs } from '../../helpers/get-formula-inputs'
import { findWeakMutants } from '../../helpers/find-weak-mutants'
import { generateFormula } from '../../helpers/generate-formula'
import { generateMutants } from '../../helpers/generate-mutants'
import { parseFile } from '../../../core/parser/parse-file'
import { createReader } from '../../helpers/create-reader'
import { printFormula } from '../../helpers/print-formula'
import { createRandom } from '../../helpers/create-random'
import { applyMutant } from '../../helpers/apply-mutant'
import { walkTree } from '../../../core/tree/walk-tree'
import { runProgram } from '../../helpers/run-program'

/**
 * Idiom of the differential run whose comparisons have entries that a lower
 * bound rules out (catalog 3.4): a function `f`, the inputs it is called with,
 * and the skips that rest on the bound, which the run executes.
 */
interface BoundIdiom {
  /**
   * Skipped candidates whose outputs contradict their category under both
   * presets, documented with the idiom.
   */
  unsoundSkips?: Partial<UnsoundSkips>

  /**
   * Preset settings over those of the preset, such as `timeouts: false` for an
   * idiom whose loop mutants would hang.
   */
  settings?: { timeouts: boolean }

  /**
   * Arguments of `f`, one list per input.
   */
  inputs: unknown[][]

  /**
   * Skipped candidates that rest on a lower bound, as `mutator original ->
   * replacement (rule)`, in canonical order.
   */
  bounded: string[]

  /**
   * Mutants the run must emit, as `mutator original -> replacement`: entries
   * that the bound would leave constant in a guard it rests on, whose timeout
   * skips the run would not execute, and entries that no bound rules out.
   */
  kept?: string[]

  /**
   * Source lines of `f`.
   */
  lines: string[]

  /**
   * Name of the idiom.
   */
  name: string
}

/**
 * Idiom of the differential run: a function `f`, the inputs it is called with,
 * and the findings the catalog documents for it.
 */
interface Idiom {
  /**
   * Skipped candidates whose outputs contradict their category under both
   * presets, documented with the idiom.
   */
  unsoundSkips?: Partial<UnsoundSkips>

  /**
   * Findings documented as gaps of catalog 11.8 under `strict` only.
   */
  strictGaps?: Partial<WeakMutants>

  /**
   * Findings documented as gaps of catalog 11.8 under both presets.
   */
  gaps?: Partial<WeakMutants>

  /**
   * Arguments of `f`, one list per input.
   */
  inputs: unknown[][]

  /**
   * Source lines; only the mutants of `f` are checked, so lines before it can
   * hold helpers that `f` calls.
   */
  lines: string[]

  /**
   * Labels of mutants of `f` that both presets must run; none when omitted.
   */
  kept?: string[]

  /**
   * File name, whose extension selects the language.
   */
  file: string

  /**
   * Name of the idiom.
   */
  name: string
}

/**
 * Regular expression idiom of the differential run: a function `f`, the inputs
 * it is called with, and the rules of the regex skips it checks.
 */
interface RegexIdiom {
  /**
   * Preset settings over those of the preset, such as `timeouts: false` for an
   * idiom whose empty matches would hang.
   */
  settings?: { timeouts: boolean }

  /**
   * Arguments of `f`, one list per input.
   */
  inputs: unknown[][]

  /**
   * Rules of the skipped regex candidates of `f` whose claims the run checks,
   * in canonical order.
   */
  skips: string[]

  /**
   * Source lines of `f`.
   */
  lines: string[]

  /**
   * Name of the file, `example.ts` when not given.
   */
  file?: string

  /**
   * Name of the idiom.
   */
  name: string
}

/**
 * Idiom of the differential run whose `??` or `||` keeps the same value with
 * the other operator (catalog 4.8): a function `f`, the inputs it is called
 * with, and the skips of the swap and of the default that the run executes.
 */
interface DefaultIdiom {
  /**
   * Arguments of `f`, one list per input.
   */
  inputs: unknown[][]

  /**
   * Skipped candidates with the rules `never-falsy` and `falsy-default`, as
   * `mutator original -> replacement (rule)`, in canonical order.
   */
  defaults: string[]

  /**
   * Source lines of `f`.
   */
  lines: string[]

  /**
   * Name of the idiom.
   */
  name: string
}

/**
 * Idiom of the differential run whose array or regex match makes an
 * `[undefined]` or `?.` mutant change nothing (catalog 4.2 and 4.13): a
 * function `f`, the inputs it is called with, and the skips of the array and of
 * the links that the run executes.
 */
interface ShapeIdiom {
  /**
   * Arguments of `f`, one list per input.
   */
  inputs: unknown[][]

  /**
   * Skipped candidates with the rules `joined-array` and `named-groups`, as
   * `mutator original -> replacement (rule)`, in canonical order.
   */
  shapes: string[]

  /**
   * Source lines of `f`.
   */
  lines: string[]

  /**
   * Name of the idiom.
   */
  name: string
}

/**
 * Reason of the groups of a match of a regex with a named group.
 */
const GROUPS =
  'the regex has a named group, so groups is an object whenever the match is'

/**
 * Ids that ignore directives of the snippets may list.
 */
let knownMutatorIds = new Set([
  'arithmetic',
  'skipper',
  'removal',
  'probe',
  'copy',
  'same',
])

/**
 * Settings of a resolved preset when no applied preset sets any.
 */
const SETTINGS = Object.freeze({
  coarseMutants: false,
  templates: true,
  timeouts: false,
  loggers: [],
})

/**
 * Swaps `+` for `-`.
 */
const ARITHMETIC: Mutator = {
  create: context => ({
    BinaryExpression(node) {
      return [{ text: context.sourceCode.replaceOperator(node, '-'), node }]
    },
  }),
  meta: { description: 'Arithmetic.' },
}

/**
 * Removes expression statements as coarse mutants.
 */
const REMOVAL: Mutator = {
  create: () => ({
    ExpressionStatement(node) {
      return [{ solitary: [node], text: '', node }]
    },
  }),
  meta: { description: 'Removal.' },
}

/**
 * Returns every literal unchanged.
 */
const SAME: Mutator = {
  create: context => ({
    Literal(node) {
      return [{ text: context.sourceCode.getText(node), node }]
    },
  }),
  meta: { description: 'Same.' },
}

/**
 * Skips the drop of the right operand of every `+`, in favor of the swap.
 */
const SKIPPER: Mutator = {
  create: context => ({
    BinaryExpression(node) {
      return [
        {
          skip: {
            by: { mutator: 'arithmetic', node },
            reason: 'the swap covers it',
            heuristic: true,
            rule: 'O11',
          },
          text: context.sourceCode.getText(node.left),
          node,
        },
      ]
    },
  }),
  meta: { description: 'Skipper.' },
}

/**
 * Writes the lower bound of the identifier argument of every call, as the
 * syntax helpers tell it.
 */
const BOUND: Mutator = {
  create: context => ({
    CallExpression(node) {
      let [argument] = node.arguments
      return argument?.type === 'Identifier' ?
          [{ text: String(context.syntax.getLowerBound(argument)), node }]
        : []
    },
  }),
  meta: { description: 'Bound.' },
}

/**
 * Writes, for every `??`, the name it initializes when that name is only read
 * for its truth and why its left side is never falsy, as the syntax helpers
 * tell it, in a string literal, so the text stays one expression.
 */
const DEFAULTS: Mutator = {
  create: context => ({
    LogicalExpression(node) {
      let { syntax } = context
      return [
        {
          text: JSON.stringify(
            `${syntax.getTruthOnlyName(node)}: ${syntax.getNeverFalsyFact(node.left)}`,
          ),
          node,
        },
      ]
    },
  }),
  meta: { description: 'Defaults.' },
}

/**
 * Writes, for every empty array literal, whether it only collects the parts of
 * a string that `join('')` builds, and for every optional chain of a member,
 * why the object of that member is never nullish, as the syntax helpers tell
 * it, in a string literal, so the text stays one expression.
 */
const SHAPES: Mutator = {
  create: context => ({
    ChainExpression(node) {
      let { expression } = node
      return expression.type === 'MemberExpression' ?
          [
            {
              text: JSON.stringify(
                String(context.syntax.getNamedGroupsFact(expression.object)),
              ),
              node,
            },
          ]
        : []
    },
    ArrayExpression(node) {
      return node.elements.length === 0 ?
          [
            {
              text: JSON.stringify(String(context.syntax.isJoinedArray(node))),
              node,
            },
          ]
        : []
    },
  }),
  meta: { description: 'Shapes.' },
}

/**
 * Generates the mutants of a snippet without timeouts.
 *
 * @param lines - Source lines, joined with line feeds.
 * @param mutators - Active mutators in rank order.
 * @param setup - Whether the run keeps coarse mutants, lists skipped candidates
 *   and finds the regions of the mutants; none when omitted.
 * @returns Result of the file.
 */
function generate(
  lines: string[],
  mutators: ActiveMutator[],
  setup: { coarseMutants?: boolean; skipped?: boolean; regions?: boolean } = {},
): Omit<FileMutants, 'absolute'> {
  return generateFileMutants({
    settings: Object.freeze({
      coarseMutants: setup.coarseMutants ?? false,
      templates: true,
      timeouts: false,
      loggers: [],
    }),
    regions: setup.regions ?? false,
    skipped: setup.skipped ?? false,
    source: lines.join('\n'),
    file: 'src/example.ts',
    knownMutatorIds,
    mutators,
  })
}

/**
 * Generates the `arithmetic` and `removal` mutants of a Svelte component with
 * the Svelte compiler.
 *
 * @param lines - Lines of the component, joined with line feeds.
 * @param templates - Whether the `templates` setting is on; true when omitted.
 * @returns Result of the file.
 */
function generateSvelte(
  lines: string[],
  templates = true,
): Omit<FileMutants, 'absolute'> {
  return generateFileMutants({
    settings: Object.freeze({
      coarseMutants: true,
      timeouts: false,
      loggers: [],
      templates,
    }),
    mutators: [
      activate('arithmetic', 0, ARITHMETIC),
      activate('removal', 1, REMOVAL),
    ],
    compilers: { vue: null, svelte },
    source: lines.join('\n'),
    file: 'src/Card.svelte',
    knownMutatorIds,
    skipped: true,
  })
}

/**
 * Generates the mutants of a file with the Svelte and Vue compilers, so the
 * template of a component is mutated too.
 *
 * @param source - Text of the file.
 * @param file - Display path of the file.
 * @param mutators - Active mutators in rank order.
 * @returns Result of the file.
 */
function generateWithCompilers(
  source: string,
  file: string,
  mutators: ActiveMutator[],
): Omit<FileMutants, 'absolute'> {
  return generateFileMutants({
    compilers: { svelte, vue },
    settings: SETTINGS,
    knownMutatorIds,
    mutators,
    source,
    file,
  })
}

/**
 * Generates the `arithmetic` mutants of a component file.
 *
 * @param lines - Lines of the component, joined with line feeds.
 * @param file - Display path of the component.
 * @returns Result of the file.
 */
function generateComponent(
  lines: string[],
  file: string,
): Omit<FileMutants, 'absolute'> {
  return generateFileMutants({
    mutators: [activate('arithmetic', 0, ARITHMETIC)],
    source: lines.join('\n'),
    settings: SETTINGS,
    knownMutatorIds,
    file,
  })
}

/**
 * Turns a mutator on with empty options.
 *
 * @param id - Id of the mutator.
 * @param rank - Rank of the mutator.
 * @param mutator - Module of the mutator.
 * @returns Active mutator.
 */
function activate(id: string, rank: number, mutator: Mutator): ActiveMutator {
  return { options: Object.freeze({}), mutator, rank, id }
}

/**
 * Nothing found: the result of a check that passes.
 */
const NONE: WeakMutants = {
  equivalent: [],
  duplicates: [],
  uncovered: [],
  subsumed: [],
}

/**
 * No skipped candidate contradicts its category: the result of a check that
 * passes.
 */
const SOUND: UnsoundSkips = {
  equivalent: [],
  duplicate: [],
  subsumed: [],
  owned: [],
}

/**
 * Categories of skips whose claim the outputs can check; noise, timeout and
 * invalid candidates are not run.
 */
const CHECKED_CATEGORIES = new Set([
  'equivalent',
  'duplicate',
  'subsumed',
  'owned',
])

/**
 * Rules whose claim the outputs of one input cannot check: the solitary rule
 * says that a test which kills the finer mutant observes the removed code, not
 * that the coarse mutant differs on every input where the finer one does.
 */
const UNCHECKED_RULES = new Set(['solitary'])

/**
 * Lists of items with ids, numbers, flags and tags.
 */
const ITEMS = [
  [],
  [{ b: false, tags: [], id: 'a', a: true, n: 1 }],
  [
    { tags: ['x'], b: false, id: 'a', a: true, n: 1 },
    { a: false, tags: [], id: 'b', b: true, n: 5 },
    { tags: ['y', 'z'], a: false, b: false, id: 'c', n: 3 },
    { tags: ['w'], id: 'd', a: true, b: true, n: 2 },
  ],
]

/**
 * Rows to sort, with ties, negative numbers and an order to keep.
 */
const SORT_ROWS = [
  [],
  [{ n: 2 }, { n: 1 }],
  [{ key: 'a', n: 1 }, { n: 3 }, { n: -2 }, { key: 'b', n: 1 }],
  [{ n: -1 }, { n: -3 }, { n: 0 }],
]

/**
 * Numbers around the literals of the idioms, with `-0` and `NaN`.
 */
const NUMBERS = [0, 1, 2, 3, 4, 5, 6, -1, -2, -0, Number.NaN]

/**
 * Times of dates before, at and after each other, and of an invalid date; each
 * run builds its own dates, so two equal dates are different objects.
 */
const TIMES = [0, 1000, Number.NaN]

/**
 * Strings that tell apart cases, prefixes, suffixes and lookup keys, with
 * letters whose case change alters the length.
 */
const STRINGS = [
  '',
  'a',
  'yes',
  'YES',
  'Yes',
  'abc#',
  '#x',
  '#',
  '/',
  'a/',
  '/a',
  '.md',
  '.mdx',
  'README.MD',
  'admin',
  'ADMIN',
  'an admin',
  'Get',
  'GET',
  'get',
  '404',
  'untitled',
  'anon',
  'foo',
  'ß',
  'aß',
  'İ',
]

/**
 * Strings that tell apart anchors, cases, line breaks, digits, word boundaries
 * and repeated matches of the regular expression idioms.
 */
const REGEX_STRINGS = [
  '',
  'a',
  'A',
  'aa',
  'ba',
  'abab',
  'ab\nab',
  '\nab',
  'xab',
  'abx',
  'a1',
  '123',
  '123-ab',
  '123-AB',
  '12-ab',
  '1234-ab',
  ' 123-ab',
  '123-ab ',
  '123-',
  '1x3-ab',
  'foo',
  'foobar',
  'a foo',
  '_foo',
  'foo.',
  'x1y22',
  'a\nb',
  'a.b',
  'acb',
  'bc',
  'b',
]

/**
 * Idioms whose lower bounds come from the data flow of the function: a counter,
 * a guarded counter, a count map, the size of a Set, and a loop operand whose
 * entry a bound makes the constant that logical-operator owns; and a Set with a
 * size of its own, which has no bound.
 */
const BOUND_IDIOMS: BoundIdiom[] = [
  {
    lines: [
      'function f(items: string[]) {',
      "  let out = ''",
      '  let row = 0',
      '  for (let item of items) {',
      "    out += row === 0 ? item : ',' + row + ':' + item",
      '    row++',
      '  }',
      '  return out',
      '}',
    ],
    bounded: ['comparison-operator row === 0 -> row <= 0 (lower-bound)'],
    inputs: [[[]], [['a']], [['a', 'b', 'c']]],
    name: 'a counter compared with its start',
  },
  {
    lines: [
      'function f(text: string) {',
      '  let depth = 0',
      '  for (let char of text) {',
      "    if (char === '(') depth++",
      '    else if (depth > 0) depth--',
      '  }',
      '  return depth === 0',
      '}',
    ],
    bounded: [
      'comparison-operator depth > 0 -> depth != 0 (lower-bound)',
      'comparison-operator depth === 0 -> depth <= 0 (lower-bound)',
    ],
    inputs: ['', '(', ')', '()', '())', '(()', ')(', '(())', '(()())'].map(
      text => [text],
    ),
    name: 'a counter that goes down only after a guard',
  },
  {
    lines: [
      'function f(names: string[]) {',
      '  let counts = new Map<string, number>()',
      '  for (let name of names) counts.set(name, (counts.get(name) ?? 0) + 1)',
      '  if (counts.size === 0) return null',
      '  let out: string[] = []',
      '  for (let [name, count] of counts) out.push(count > 1 ? name + count : name)',
      '  return out',
      '}',
    ],
    bounded: [
      'comparison-operator counts.size === 0 -> counts.size <= 0 (lower-bound)',
      'comparison-operator count > 1 -> count != 1 (lower-bound)',
    ],
    inputs: [[[]], [['a']], [['a', 'a']], [['a', 'b', 'a', 'a']]],
    name: 'the values and the size of a count map',
  },
  {
    lines: [
      'function f(items: string[]) {',
      '  let seen = new Set(items)',
      '  return seen.size > 0',
      '}',
    ],
    bounded: [
      'comparison-operator seen.size > 0 -> seen.size != 0 (lower-bound)',
    ],
    inputs: [[[]], [['a']], [['a', 'b']], [['a', 'a']]],
    name: 'the size of a Set',
  },
  {
    lines: [
      'function f(items: string[], limit: number) {',
      '  let queue = [...items]',
      '  let out: string[] = []',
      '  for (let i = 0; i < limit && queue.length > 0; i++) {',
      '    out.push(queue.shift()!.toUpperCase())',
      '  }',
      '  return out',
      '}',
    ],
    /*
     * The constants of the loop test and the false of `i < limit` belong to
     * logical-operator, whose constant and drop of `i < limit` the running
     * mutant `i <= limit` makes redundant (R2), as it does without the bound.
     */
    unsoundSkips: {
      owned: [
        'condition i < limit && queue.length > 0 -> true (O1)',
        'condition i < limit && queue.length > 0 -> false (O1)',
        'comparison-operator i < limit -> false (O3)',
      ],
    },
    bounded: [
      'comparison-operator queue.length > 0 -> queue.length >= 0 (O3)',
      'comparison-operator queue.length > 0 -> queue.length != 0 (lower-bound)',
    ],
    inputs: combine([[], ['a'], ['a', 'b']], [0, 1, 3]),
    name: 'a loop operand that a bound makes constant',
    settings: { timeouts: false },
  },
  {
    lines: [
      'function f(limit: number) {',
      '  let retries = 3',
      '  let calls = 0',
      '  while (retries > 0) {',
      '    retries--',
      '    calls++',
      '    if (calls === limit) return calls',
      '  }',
      '  return -calls',
      '}',
    ],
    bounded: ['comparison-operator retries > 0 -> retries != 0 (lower-bound)'],
    name: 'a loop test that guards the decrement of its operand',
    kept: ['comparison-operator retries > 0 -> retries >= 0'],
    inputs: [[1], [3], [4], [10]],
    settings: { timeouts: false },
  },
  {
    lines: [
      'function f(queue: string[], tokens: string) {',
      '  let budget = 0',
      '  let out: string[] = []',
      "  for (let token of tokens) if (token === '+') budget++",
      '  while (queue.length > 0 && budget > 0) {',
      '    budget--',
      '    out.push(queue.shift()!.toUpperCase())',
      '  }',
      '  return out',
      '}',
    ],
    bounded: [
      'comparison-operator queue.length > 0 -> queue.length >= 0 (O3)',
      'comparison-operator queue.length > 0 -> queue.length != 0 (lower-bound)',
      'comparison-operator budget > 0 -> budget != 0 (lower-bound)',
    ],
    /*
     * The constants of the loop test belong to logical-operator, which emits
     * neither of them here, as without the bound.
     */
    unsoundSkips: {
      owned: [
        'condition queue.length > 0 && budget > 0 -> true (O1)',
        'condition queue.length > 0 && budget > 0 -> false (O1)',
      ],
    },
    inputs: combine([[], ['a'], ['a', 'b', 'c']], ['', '+', '++', '+-+']),
    name: 'a last loop operand that guards the decrement of its operand',
    kept: ['comparison-operator budget > 0 -> budget >= 0'],
    settings: { timeouts: false },
  },
  {
    lines: [
      'function f(steps: string) {',
      '  let left = 0',
      '  let seen: string[] = []',
      "  for (let step of steps) if (step === '+') left += 1",
      '  while (left >= 1) {',
      '    left -= 1',
      '    seen.push(steps[left]!.trim())',
      '  }',
      '  return seen',
      '}',
    ],
    name: 'a guard whose shifted literal its decrement crosses',
    inputs: ['', '+', '++', '+-+'].map(steps => [steps]),
    kept: ['comparison-operator left >= 1 -> left >= 0'],
    settings: { timeouts: false },
    bounded: [],
  },
  {
    lines: [
      'function f(items: string[], hide: boolean) {',
      '  const unique = new Set(items)',
      "  if (hide) Object.defineProperty(unique, 'size', { value: -1 })",
      "  return unique.size === 0 ? 'empty' : 'full'",
      '}',
    ],
    kept: ['comparison-operator unique.size === 0 -> unique.size <= 0'],
    name: 'a Set whose size an own property shadows',
    inputs: combine([[], ['a']], [false, true]),
    bounded: [],
  },
]

/**
 * Idioms whose swap between `??` and `||` the left side makes equivalent, as it
 * is never falsy when defined, and a falsy default whose name is only read for
 * its truth.
 */
const DEFAULT_IDIOMS: DefaultIdiom[] = [
  {
    lines: [
      'function f(time: number | undefined) {',
      '  let date = time === undefined ? undefined : new Date(time)',
      '  return date?.toISOString() ?? null',
      '}',
    ],
    defaults: [
      'logical-operator date?.toISOString() ?? null -> date?.toISOString() || null (never-falsy)',
    ],
    inputs: [[undefined], [0], [1000], [Number.NaN]],
    name: 'a date formatter',
  },
  {
    lines: [
      'function f(value: number | undefined) {',
      "  return value?.toFixed(1) || 'n/a'",
      '}',
    ],
    defaults: [
      "logical-operator value?.toFixed(1) || 'n/a' -> value?.toFixed(1) ?? 'n/a' (never-falsy)",
    ],
    inputs: [[undefined], [0], [-0], [1.25], [Number.NaN]],
    name: 'a number formatter',
  },
  {
    defaults: [
      "logical-operator /[a-z]+$/u.exec(hue)?.[0] ?? 'deg' -> /[a-z]+$/u.exec(hue)?.[0] || 'deg' (never-falsy)",
    ],
    lines: [
      'function f(hue: string) {',
      "  return /[a-z]+$/u.exec(hue)?.[0] ?? 'deg'",
      '}',
    ],
    inputs: ['', '10', '10deg', '1.5turn', 'rad', '0 '].map(hue => [hue]),
    name: 'the whole match of a regex',
  },
  {
    lines: [
      'function f(names: string[]) {',
      '  let counts = new Map<string, number>()',
      '  for (let name of names) counts.set(name, (counts.get(name) ?? 0) + 1)',
      "  return names.map(name => counts.get(name) ?? 0).join(',')",
      '}',
    ],
    defaults: [
      'logical-operator counts.get(name) ?? 0 -> counts.get(name) || 0 (never-falsy)',
      'logical-operator counts.get(name) ?? 0 -> counts.get(name) || 0 (never-falsy)',
    ],
    inputs: [[[]], [['a']], [['a', 'b', 'a']]],
    name: 'the values of a count map',
  },
  {
    lines: [
      'function f(options: { quiet?: unknown }) {',
      '  let quiet = options.quiet ?? false',
      "  let out = quiet ? 'quiet' : 'loud'",
      "  if (!quiet) out += '!'",
      '  return out',
      '}',
    ],
    defaults: [
      'logical-operator options.quiet ?? false -> options.quiet || false (falsy-default)',
      'logical-operator options.quiet ?? false -> options.quiet (falsy-default)',
    ],
    inputs: [true, false, 0, '', null, undefined, 'yes'].map(quiet => [
      { quiet },
    ]),
    name: 'a falsy default read only for its truth',
  },
  {
    lines: [
      'class Store {',
      '  values: unknown[] = []',
      '  find(callback: () => unknown) {',
      '    this.values.push(callback())',
      '  }',
      '}',
      'function f(options: { live?: unknown }) {',
      '  let store = new Store()',
      '  let live = options.live ?? false',
      '  store.find(() => live)',
      '  return store.values',
      '}',
    ],
    name: 'a falsy default that a callback named like a predicate returns',
    inputs: [true, false, 0, null, undefined].map(live => [{ live }]),
    defaults: [],
  },
  {
    lines: [
      'function note(text: string): undefined {',
      '  save(text)',
      '  return undefined',
      '}',
      'function f(options: { strict?: unknown }) {',
      "  let strict = options.strict ?? void note('defaulted')",
      "  return strict ? 'strict' : 'loose'",
      '}',
    ],
    inputs: [true, false, 0, null, undefined].map(strict => [{ strict }]),
    name: 'a falsy default that calls a function',
    defaults: [],
  },
  {
    lines: [
      'const word = /[a-z]+/u',
      'function relax() {',
      "  word.compile('[a-z]*', 'u')",
      '}',
      'function f(text: string, relaxed: boolean) {',
      '  if (relaxed) relax()',
      "  return word.exec(text)?.[0] ?? 'none'",
      '}',
    ],
    name: 'the whole match of a regex that compile changes in place',
    inputs: combine(['', '!', 'ab'], [false, true]),
    defaults: [],
  },
]

/**
 * Idioms whose `[undefined]` an array that is only pushed to and joined with an
 * empty separator makes equivalent, and whose `?.` links the groups of a regex
 * match make equivalent, with an optional group whose link stays.
 */
const SHAPE_IDIOMS: ShapeIdiom[] = [
  {
    lines: [
      'function f(items: string[]) {',
      '  let parts: string[] = []',
      '  for (let item of items) parts.push(item.trim())',
      "  return parts.join('')",
      '}',
    ],
    shapes: ['array-element [] -> [undefined] (joined-array)'],
    name: 'an array that is only pushed to and joined',
    inputs: [[[]], [['a']], [[' a', 'b ', '']]],
  },
  {
    lines: [
      'function f(items: string[], undefined: string) {',
      '  let parts: string[] = []',
      '  for (let item of items) parts.push(item.trim())',
      "  return parts.join('')",
      '}',
    ],
    inputs: [
      [[], 'prefix'],
      [['a'], 'prefix'],
    ],
    name: 'a parameter named undefined beside a joined array',
    shapes: [],
  },
  {
    shapes: [
      "optional-chaining match?.groups?.['key']?.trim() -> match?.groups['key']?.trim() (named-groups)",
      "optional-chaining match?.groups?.['key']?.trim() -> match?.groups?.['key'].trim() (named-groups)",
    ],
    lines: [
      'function f(text: string) {',
      '  let match = text.match(/(?<key>[^:]+):/u)',
      "  return match?.groups?.['key']?.trim()",
      '}',
    ],
    inputs: ['', 'a', 'a:', ' key : value', ':'].map(text => [text]),
    name: 'a named group that takes part in every match',
  },
  {
    shapes: [
      'optional-chaining /(?:x(?<tail>y))?z/u.exec(text)?.groups?.tail?.length -> /(?:x(?<tail>y))?z/u.exec(text)?.groups.tail?.length (named-groups)',
    ],
    lines: [
      'function f(text: string) {',
      '  return /(?:x(?<tail>y))?z/u.exec(text)?.groups?.tail?.length',
      '}',
    ],
    inputs: ['', 'z', 'xyz', 'xz', 'q'].map(text => [text]),
    name: 'a named group that a match may leave out',
  },
  {
    lines: [
      'function f(text: string, clear: boolean) {',
      '  const found = /(?<key>[a-z]+)=/u.exec(text)',
      '  if (clear) {',
      '    if (found) found.groups = undefined',
      '  }',
      '  return found?.groups?.key',
      '}',
    ],
    inputs: combine(['', 'a=1'], [false, true]),
    name: 'a match whose groups are cleared',
    shapes: [],
  },
  {
    lines: [
      'function f(text: string) {',
      '  const found = /(?<key>[a-z]+)=/u.exec(text)',
      '  if (found?.groups) delete found.groups.key',
      '  return found?.groups!.key?.toUpperCase()',
      '}',
    ],
    inputs: ['', 'a=1'].map(text => [text]),
    name: 'a match whose group is deleted',
    shapes: [],
  },
  {
    lines: [
      'const assignment = /(?<key>[a-z]+)=/u',
      'function relax() {',
      "  assignment.compile('[a-z]*=', 'u')",
      '}',
      'function f(text: string, relaxed: boolean) {',
      '  if (relaxed) relax()',
      '  return assignment.exec(text)?.groups?.key',
      '}',
    ],
    inputs: combine(['', '=', 'a=1'], [false, true]),
    name: 'a regex that compile changes in place',
    shapes: [],
  },
]

/**
 * The idioms of the catalog's differential run (12.6): filter predicates and
 * sort comparators of every form, `||` defaults of each type, case swaps,
 * branch returns, ternaries with literal branches, `slice(-1)`, boolean
 * results, a returned local, update statements, `||`/`&&` with literal operands
 * in a test, awaits, `typeof`, the min/max idiom and `??` defaults.
 */
const IDIOMS: Idiom[] = [
  {
    lines: [
      'function f(items: { id: string }[], id: string) {',
      '  return items.filter(item => item.id !== id)',
      '}',
    ],
    inputs: combine(ITEMS, ['a', 'b', 'z']),
    name: 'a filter with !==',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: { n: number }[], min: number) {',
      '  return items.filter(item => item.n >= min)',
      '}',
    ],
    inputs: combine(ITEMS, NUMBERS),
    name: 'a filter with >=',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: { a: boolean; b: boolean }[]) {',
      '  return items.filter(item => item.a || item.b)',
      '}',
    ],
    name: 'a filter with ||',
    inputs: combine(ITEMS),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: { a: boolean; b: boolean }[]) {',
      '  return items.filter(item => item.a && item.b)',
      '}',
    ],
    name: 'a filter with &&',
    inputs: combine(ITEMS),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: object[]) {',
      "  return items.filter(item => 'id' in item)",
      '}',
    ],
    inputs: combine([[], [{ id: 1 }], [{ id: 1 }, {}]]),
    name: 'a filter with in',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: { tags: string[] }[]) {',
      '  return items.filter(item => item.tags.length > 0)',
      '}',
    ],
    name: 'a filter with a length',
    inputs: combine(ITEMS),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(rows: { done: boolean }[]) {',
      '  return rows.filter(row => !row.done)',
      '}',
    ],
    inputs: combine([[], [{ done: true }], [{ done: false }, { done: true }]]),
    name: 'a filter with !',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(rows) {',
      '  return rows.filter(row => { if (row.x) return true; return false })',
      '}',
    ],
    inputs: combine([[], [{ x: 1 }], [{ x: 0 }, { x: 2 }]]),
    name: 'a filter with a return switch',
    file: 'example.js',
  },
  {
    lines: [
      'function f(rows: { visible?: boolean }[]) {',
      '  return rows.filter(row => row.visible ?? false)',
      '}',
    ],
    inputs: combine([
      [],
      [{ visible: false }, {}],
      [{ visible: true }, {}, { visible: false }],
    ]),
    name: 'a filter with ?? false',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(rows, min) {',
      '  return rows.filter(row => { const n = row.n * 2; return n > min })',
      '}',
    ],
    inputs: combine([[], [{ n: 1 }, { n: 3 }, { n: 2 }, { n: 0 }]], NUMBERS),
    name: 'a filter with a sole return',
    file: 'example.js',
  },
  {
    lines: [
      'function f(rows: { n: number }[]) {',
      '  return rows.toSorted((a, b) => a.n - b.n)',
      '}',
    ],
    inputs: combine(SORT_ROWS),
    name: 'a sort comparator',
    file: 'example.ts',
  },
  {
    gaps: {
      duplicates: [
        'comparison-operator a.n > b.n -> a.n != b.n | number-literal -1 -> 0',
      ],
    },
    lines: [
      'function f(rows) {',
      '  return rows.toSorted((a, b) => a.n > b.n ? 1 : -1)',
      '}',
    ],
    name: 'a sort comparator with a ternary',
    inputs: combine(SORT_ROWS),
    file: 'example.js',
  },
  {
    lines: [
      'function f(name: string | undefined) {',
      "  return name || 'anon'",
      '}',
    ],
    name: 'an || default of a nullable string',
    inputs: [[undefined], [''], ['bob']],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(title: string) {',
      "  const heading = title || 'untitled'",
      '  return heading',
      '}',
    ],
    name: 'an || default of a string',
    inputs: [[''], ['x']],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(n: number) {',
      '  const value = n || -1',
      '  return value',
      '}',
    ],
    name: 'an || default of a number',
    inputs: [[0], [1], [-1], [5]],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(n: number | undefined) {',
      '  const value = n || -1',
      '  return value',
      '}',
    ],
    inputs: [[undefined], [0], [1], [-1], [5]],
    name: 'an || default of a nullable number',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(answer: string) {',
      "  const yes = answer.toLowerCase() === 'yes'",
      '  return yes',
      '}',
    ],
    inputs: STRINGS.map(text => [text]),
    name: 'a case swap with ===',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(method: string) {',
      "  if (method.toUpperCase() !== 'GET') reject()",
      '}',
    ],
    name: 'a case swap with !== in a test',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(code: string) {',
      "  return code.toLowerCase() === '404'",
      '}',
    ],
    name: 'a case swap without cased letters',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(name: string) {',
      "  if (name.toLowerCase().includes('admin')) grant()",
      '}',
    ],
    name: 'a case swap before includes',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(file: string) {',
      "  if (file.toLowerCase().endsWith('.md')) render()",
      '}',
    ],
    name: 'a case swap before endsWith',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(user: { isAdmin: boolean }): boolean {',
      '  if (user.isAdmin) return true',
      '  return false',
      '}',
    ],
    inputs: [[{ isAdmin: true }], [{ isAdmin: false }]],
    name: 'boolean returns after an if',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(ok: boolean): string {',
      "  if (ok) { return 'yes' } else { return '' }",
      '}',
    ],
    name: 'string returns of an if and else',
    inputs: [[true], [false]],
    file: 'example.ts',
  },
  {
    lines: ['function f(flag) {', '  return flag ? 1 : 0', '}'],
    inputs: [[true], [false], [0], ['x']],
    name: 'a ternary of numbers',
    file: 'example.js',
  },
  {
    gaps: {
      subsumed: [
        "comparison-operator path.slice(-1) === '/' -> false < method-call path.slice(-1) -> path",
        "comparison-operator path.slice(-1) === '/' -> false < unary-operator -1 -> 1",
      ],
    },
    lines: [
      'function f(path: string) {',
      "  return path.slice(-1) === '/'",
      '}',
    ],
    inputs: STRINGS.map(text => [text]),
    name: 'a comparison of slice(-1)',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(parts: string[]) {',
      '  return parts.slice(-1)[0]',
      '}',
    ],
    gaps: { subsumed: ['number-literal 0 -> 1 < unary-operator -1 -> 1'] },
    inputs: [[[]], [['a']], [['a', 'b']]],
    name: 'an element of slice(-1)',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(text: string): boolean {',
      "  return text.startsWith('#')",
      '}',
    ],
    name: 'a boolean result of startsWith',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(roles: string[]): boolean {',
      "  return roles.includes('admin')",
      '}',
    ],
    inputs: [[[]], [['user']], [['admin', 'user']]],
    name: 'a boolean result of includes',
    file: 'example.ts',
  },
  {
    lines: ['function f(user) {', "  return user.roles.includes('admin')", '}'],
    inputs: [[{ roles: [] }], [{ roles: ['admin'] }]],
    name: 'a returned includes in JavaScript',
    file: 'example.js',
  },
  {
    lines: [
      'function f(path: string): boolean {',
      "  return path === '/'",
      '}',
    ],
    inputs: STRINGS.map(text => [text]),
    name: 'a boolean result of ===',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(a: number): boolean {',
      '  const ok = a > 2',
      '  return ok',
      '}',
    ],
    inputs: NUMBERS.map(value => [value]),
    name: 'a returned local comparison',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(x: { valid: boolean }): boolean {',
      '  return !x.valid',
      '}',
    ],
    inputs: [[{ valid: true }], [{ valid: false }]],
    name: 'a returned negation',
    file: 'example.ts',
  },
  {
    lines: ['function f(x: number) {', '  if (x > 1) save(x)', '}'],
    name: 'a then-branch under a comparison',
    inputs: NUMBERS.map(value => [value]),
    file: 'example.ts',
  },
  {
    lines: ['function f() {', '  if (1) run()', '}'],
    name: 'a then-branch under a literal',
    file: 'example.js',
    inputs: [[]],
  },
  {
    lines: ['function f(count: number) {', '  count++', '  return count', '}'],
    inputs: NUMBERS.map(value => [value]),
    name: 'an update statement',
    file: 'example.ts',
  },
  {
    lines: ['function f(x: string | undefined) {', "  if (x || '') go()", '}'],
    inputs: [[undefined], [''], ['a']],
    name: "an || '' in a test",
    file: 'example.ts',
  },
  {
    lines: [
      'function f(n: number | undefined) {',
      "  if (n && 'yes') go()",
      '}',
    ],
    inputs: [[undefined], [0], [3]],
    name: "an && 'yes' in a test",
    file: 'example.ts',
  },
  {
    lines: [
      'const api = {',
      '  get: (key: string) =>',
      "    key === 'bad' ? Promise.reject(new Error('nope')) : Promise.resolve({ key }),",
      '}',
      'async function f(id: string) {',
      '  const user = await api.get(id)',
      '  return user',
      '}',
    ],
    name: 'an awaited returned local',
    inputs: [['a'], ['bad']],
    file: 'example.ts',
  },
  {
    lines: [
      'const api = {',
      '  get: (key: string) =>',
      "    key === 'bad' ? Promise.reject(new Error('nope')) : Promise.resolve({ key }),",
      '}',
      'async function f(id: string) {',
      '  const user = await await api.get(id)',
      '  return user',
      '}',
    ],
    kept: ['return-value user -> undefined'],
    name: 'a twice awaited returned local',
    inputs: [['a'], ['bad']],
    file: 'example.ts',
  },
  {
    lines: [
      'function count(n: number): Promise<number> {',
      '  return Promise.resolve(n)',
      '}',
      'async function f(n: number) {',
      '  if ((await count(n)) === 0) stop()',
      '  return n',
      '}',
    ],
    name: 'an awaited number in a comparison',
    inputs: NUMBERS.map(value => [value]),
    file: 'example.ts',
  },
  {
    lines: [
      'function ask(text: string): Promise<string> {',
      '  return Promise.resolve(text)',
      '}',
      'async function f(text: string) {',
      "  const yes = (await ask(text)) === 'y'",
      '  return yes',
      '}',
    ],
    name: 'an awaited string in a comparison',
    inputs: [['y'], ['n']],
    file: 'example.ts',
  },
  {
    lines: [
      'const client = {',
      '  search: (query: string) => Promise.resolve({ hits: [query] }),',
      '}',
      'async function f(query: string) {',
      '  const result = await client.search(query)',
      '  return result.hits',
      '}',
    ],
    name: 'a member of an awaited local',
    file: 'example.ts',
    inputs: [['a']],
  },
  {
    lines: [
      'function f(text: string) {',
      "  const found = text.includes('foo')",
      '  return found',
      '}',
    ],
    name: 'a returned local of includes',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    gaps: {
      duplicates: [
        'comparison-operator a.n < b.n -> false | number-literal -1 -> 0',
      ],
      equivalent: ['statement-removal return 1 -> ;'],
    },
    lines: [
      'function f(rows) {',
      '  return rows.toSorted((a, b) => { if (a.n < b.n) return -1; return 1 })',
      '}',
    ],
    name: 'a sort comparator with a return switch',
    inputs: combine(SORT_ROWS),
    file: 'example.js',
  },
  {
    lines: [
      'function f(text: string) {',
      "  const found = text.includes('foo')",
      '  use(found)',
      '  return 1',
      '}',
    ],
    inputs: [...STRINGS, 'a foo'].map(text => [text]),
    name: 'a used local of includes',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(value: unknown) {',
      "  return typeof value === 'string'",
      '}',
    ],
    inputs: [[1], ['a'], [undefined]],
    name: 'a typeof check',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(a: number, b: number) {',
      '  return a > b ? a : b',
      '}',
    ],
    unsoundSkips: {
      equivalent: ['comparison-operator a > b -> a >= b (min-max-idiom)'],
    },
    inputs: combine(NUMBERS, NUMBERS),
    name: 'the max idiom',
    file: 'example.ts',
  },
  {
    lines: ['function f(count: number | null) {', '  return count ?? 0', '}'],
    inputs: [[null], [0], [5], [-0], [Number.NaN]],
    name: 'a ?? default of a nullable number',
    file: 'example.ts',
  },
  {
    lines: ['function f(value) {', '  return value ?? 0', '}'],
    inputs: [[null], [undefined], [0], [''], [false], [5]],
    name: 'a ?? default of an unknown value',
    file: 'example.js',
  },
  {
    lines: [
      'function f(ok: boolean): boolean {',
      '  return ok ? true : false',
      '}',
    ],
    name: 'a ternary of booleans as a result',
    inputs: [[true], [false]],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(ok: boolean): boolean {',
      '  const label = ok ? true : false',
      '  return label',
      '}',
    ],
    name: 'a ternary of booleans in a returned local',
    inputs: [[true], [false]],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(x: number): boolean {',
      '  return x > 0 ? true : false',
      '}',
    ],
    name: 'a ternary of booleans under a comparison',
    inputs: NUMBERS.map(value => [value]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(ok: boolean, a: boolean): boolean {',
      '  return ok ? a : false',
      '}',
    ],
    inputs: combine([true, false], [true, false]),
    name: 'a ternary with one boolean literal',
    file: 'example.ts',
  },
  {
    lines: ['function f(x: number) {', '  return x >= 5 ? 0 : 1', '}'],
    name: 'a ternary of numbers under a comparison',
    inputs: NUMBERS.map(value => [value]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(rows: { n: number }[]) {',
      '  rows.sort((a, b) => a.n - b.n)',
      '  return rows.length',
      '}',
    ],
    name: 'an in-place sort of an input',
    inputs: combine(SORT_ROWS),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: string[], item: string) {',
      '  if (!items.includes(item)) items.push(item)',
      '  return items',
      '}',
    ],
    inputs: combine([[], ['a'], ['a', 'b']], ['a', 'c']),
    name: 'a push into an input',
    file: 'example.ts',
  },
  {
    inputs: [
      ...combine(TIMES, TIMES).map(times =>
        times.map(time => new Date(time as number)),
      ),
      ...TIMES.map(time => {
        let date = new Date(time)
        return [date, date]
      }),
    ],
    lines: [
      'function f(start: Date, end: Date) {',
      '  return start < end',
      '}',
    ],
    name: 'a comparison of dates',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(start: Date, end: Date) {',
      '  return start.getTime() === end.getTime() ? start : end',
      '}',
    ],
    inputs: combine(TIMES, TIMES).map(times =>
      times.map(time => new Date(time as number)),
    ),
    name: 'a date chosen by its time',
    file: 'example.ts',
  },
  {
    inputs: [
      [undefined],
      [createReader({ name: 'ada' })],
      [createReader({ name: undefined })],
      [createReader({ name: '' })],
    ],
    lines: [
      'function f(user: { name?: string } | undefined) {',
      "  return user?.name ?? 'anon'",
      '}',
    ],
    name: 'an optional read of a getter',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(config: { debug: boolean; level: number }) {',
      '  return config.debug && config.level > 1',
      '}',
    ],
    inputs: combine([true, false], [0, 1, 2]).map(([debug, level]) => [
      createReader({ debug, level }),
    ]),
    name: 'a && of getter reads',
    file: 'example.ts',
  },
  {
    lines: [
      'async function f(id: string) {',
      "  await settle('save', id)",
      '  run(id)',
      '}',
    ],
    name: 'an awaited effect before a call',
    file: 'example.ts',
    inputs: [['a']],
  },
  {
    lines: [
      'async function f(ids: string[]) {',
      "  for (const id of ids) await settle('load', id)",
      '  return ids.length',
      '}',
    ],
    inputs: [[[]], [['a']], [['a', 'b']]],
    name: 'awaits in a loop',
    file: 'example.ts',
  },
  {
    lines: [
      'async function f(ok: boolean) {',
      '  try {',
      "    return await (ok ? settle('load', 1) : fail('load'))",
      '  } catch {',
      '    return 0',
      '  }',
      '}',
    ],
    name: 'a returned await inside try',
    inputs: [[true], [false]],
    file: 'example.ts',
  },
  {
    lines: [
      'function start(key: string): Promise<void> {',
      "  return key === 'bad' ? fail(key) : settle(key)",
      '}',
      'function f(key: string): Promise<void> {',
      '  return start(key)',
      '}',
    ],
    kept: ['return-value start(key) -> Promise.resolve(void 0)'],
    name: 'a promise returned without async',
    inputs: [['ok'], ['bad']],
    file: 'example.ts',
  },
  {
    lines: [
      'function load(ok: boolean) {',
      "  return { loading: ok ? settle('load') : fail('load') }",
      '}',
      'async function f(ok: boolean): Promise<void> {',
      '  const loader = load(ok)',
      '  return loader.loading',
      '}',
    ],
    name: 'a stored promise returned from an async void function',
    kept: ['return-value loader.loading -> undefined'],
    inputs: [[true], [false]],
    file: 'example.ts',
  },
  {
    gaps: {
      equivalent: [
        [
          'method-call rows.filter(',
          '    (row): Promise<boolean> => Promise.resolve(row.allowed),',
          '  ) -> rows',
        ].join('\n'),
        'return-value Promise.resolve(row.allowed) -> true',
      ],
    },
    lines: [
      'function f(rows: { allowed: boolean }[]) {',
      '  return rows.filter(',
      '    (row): Promise<boolean> => Promise.resolve(row.allowed),',
      '  ).length',
      '}',
    ],
    kept: ['return-value Promise.resolve(row.allowed) -> false'],
    inputs: [[[{ allowed: true }, { allowed: false }]], [[]]],
    name: 'a predicate callback that returns a promise',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(options) {',
      '  setTimeout(run, options && options.delay)',
      '}',
    ],
    gaps: {
      equivalent: ['logical-operator options && options.delay -> options'],
    },
    inputs: [[null], [undefined], [{}], [{ delay: 5 }]],
    name: 'a timer delay behind a guard',
    file: 'example.js',
  },
  {
    gaps: {
      equivalent: [
        'comparison-operator options != null -> false',
        'arithmetic-operator options.delay * 1000 -> options.delay / 1000',
      ],
    },
    lines: [
      'function f(options) {',
      '  setTimeout(run, options != null ? options.delay * 1000 : 0)',
      '}',
    ],
    name: 'a timer delay behind a conditional guard',
    inputs: [[null], [{}], [{ delay: 5 }]],
    file: 'example.js',
  },
  {
    gaps: {
      equivalent: [
        "logical-operator typeof DELAY !== 'undefined' && DELAY -> typeof DELAY !== 'undefined'",
        "comparison-operator typeof DELAY !== 'undefined' -> false",
      ],
    },
    lines: [
      'function f() {',
      "  setTimeout(run, typeof DELAY !== 'undefined' && DELAY)",
      '}',
    ],
    unsoundSkips: { subsumed: ["string-literal 'undefined' -> '' (O4)"] },
    name: 'a timer delay behind a check of an undeclared global',
    file: 'example.js',
    inputs: [[]],
  },
  {
    gaps: {
      equivalent: [
        "comparison-operator typeof ms === 'number' -> false",
        'arithmetic-operator ms * 1000 -> ms / 1000',
      ],
    },
    lines: [
      'function f(ms) {',
      "  setTimeout(run, typeof ms === 'number' ? ms * 1000 : 0)",
      '}',
    ],
    unsoundSkips: { subsumed: ["string-literal 'number' -> '' (O4)"] },
    name: 'a timer delay behind a type check',
    inputs: [[1], [1n], [null]],
    file: 'example.js',
  },
  {
    gaps: {
      equivalent: [
        "arithmetic-operator -ms * (60 * 1000) - emit('delay', ms) -> -ms * (60 * 1000) + emit('delay', ms)",
        'arithmetic-operator -ms * (60 * 1000) -> -ms / (60 * 1000)',
        'unary-operator -ms -> ms',
      ],
    },
    lines: [
      'function f(ms) {',
      "  setTimeout(run, -ms * (60 * 1000) - emit('delay', ms))",
      '}',
    ],
    name: 'literals in a timer delay next to an effect',
    inputs: [[1], [1n], [null]],
    file: 'example.js',
  },
  {
    lines: ['function f(x) {', "  setTimeout(run, x + '0')", '}'],
    name: 'a string operand in a timer delay',
    inputs: [[1], [1n]],
    file: 'example.js',
  },
  {
    lines: [
      "import { setTimeout as sleep } from 'node:timers/promises'",
      'async function f(ok) {',
      "  let operation = ok ? settle('a') : fail('b')",
      '  try {',
      '    await sleep(100, operation)',
      '  } catch (error) {',
      '    return error.message',
      '  }',
      "  return 'done'",
      '}',
    ],
    name: 'a promise timer that resolves with a pending operation',
    inputs: [[true], [false]],
    file: 'example.js',
  },
  {
    lines: [
      "import { setTimeout as sleep } from 'node:timers/promises'",
      'async function f(value) {',
      '  await sleep(100, null)',
      '  save(value)',
      '}',
    ],
    name: 'a promise timer that only waits',
    inputs: [[1], [2]],
    file: 'example.js',
  },
  {
    lines: [
      'function f(count: number) {',
      "  let rules = new Intl.PluralRules('en-US', { type: 'cardinal' })",
      "  return rules.select(count) === 'one' ? 'item' : 'items'",
      '}',
    ],
    name: 'plural rules with an option at its default',
    inputs: combine([0, 1, 1.5, 2]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(value: number) {',
      "  return new Intl.NumberFormat('en', {",
      "    style: 'decimal',",
      '    get minimumIntegerDigits() {',
      "      return this.style === 'decimal' ? 2 : 1",
      '    },',
      '  }).format(value)',
      '}',
    ],
    gaps: {
      equivalent: ["comparison-operator this.style === 'decimal' -> true"],
    },
    name: 'number format options with a getter that reads an option at its default',
    inputs: combine([1, 12]),
    file: 'example.ts',
  },
]

/**
 * Regular expression idioms: anchors, edge wildcards, global replaces and
 * matches, unused flags, assertions and a loop over global matches. Mutants of
 * regex patterns often subsume each other, so only the equivalence of regex
 * mutants and the claims of skips are checked.
 */
const REGEX_IDIOMS: RegexIdiom[] = [
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return /^\d{3}-[a-z]+$/i.test(s)`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, '123-z', '123-Z', '123-a']),
    name: 'a regular expression test with anchors',
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return /^[^]*ab[\s\S]*$/.exec(s)?.[0]`,
      '}',
    ],
    skips: ['edge-wildcard', 'any-character', 'edge-wildcard'],
    name: 'a regular expression with edge wildcards',
    inputs: combine([...REGEX_STRINGS, 'ab12']),
  },
  {
    lines: ['function f(s: string) {', "  return s.replace(/^a+/g, '-')", '}'],
    name: 'a global replace anchored at the start',
    inputs: combine(REGEX_STRINGS),
    skips: ['anchored-global'],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/\s+$/g, '!')`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, 'a  ', ' a \n ', '\n\n']),
    name: 'a global replace anchored at the end',
    skips: ['anchored-global'],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/\s*$/g, '!')`,
      '}',
    ],
    name: 'a global replace anchored at the end that matches empty',
    inputs: combine([...REGEX_STRINGS, 'a  ', ' a \n ']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/[\q{ab|}--\q{z}]$/gv, '!')`,
      '}',
    ],
    name: 'a global replace anchored after a set operation',
    inputs: combine([...REGEX_STRINGS, 'ab', 'zab']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return /a[\s\S\q{}]$/v.test(s)`,
      '}',
    ],
    name: 'a class of any character and the empty string',
    inputs: combine([...REGEX_STRINGS, 'ab', 'a ', 'b ']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.match(/\d/g) ? 1 : 2`,
      '}',
    ],
    name: 'a global match used as a condition',
    inputs: combine(REGEX_STRINGS),
    skips: ['unused-flag'],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/\d+/gims, '#')`,
      '}',
    ],
    skips: ['unused-flag', 'unused-flag', 'unused-flag'],
    name: 'a global replace with unused flags',
    inputs: combine(REGEX_STRINGS),
  },
  {
    lines: ['function f(s: string) {', '  return s.match(/^a.|bc?$/gms)', '}'],
    name: 'a global match with line flags',
    inputs: combine(REGEX_STRINGS),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/\bfoo(?!bar)/g, 'X')`,
      '}',
    ],
    name: 'a replace with a word boundary and a lookahead',
    inputs: combine([...REGEX_STRINGS, 'FOO', 'foo foo']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      '  let pattern = /a+b?/g',
      '  let found = []',
      '  let match',
      '  while ((match = pattern.exec(s))) {',
      '    found.push(match.index)',
      '  }',
      '  return found',
      '}',
    ],
    inputs: combine(['', 'b', 'Ab', 'aab', 'ab aa']),
    name: 'a loop over global matches',
    settings: { timeouts: false },
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return new RegExp('^\\d{3}-[a-z]+$', 'i').test(s)`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, '123-z', '123-Z', '123-a']),
    name: 'a RegExp call with an escaped string pattern',
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return RegExp("\\\\|\"|b").test(s)`,
      '}',
    ],
    name: 'a RegExp call with escaped quotes and backslashes',
    inputs: combine([...REGEX_STRINGS, '\\', '"', 'b']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      "  return s.replace(new RegExp(String.raw`\\s+(?=\\d)`, 'g'), '_')",
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, 'a 1', 'a  1 b', ' 1 2']),
    name: 'a RegExp call with a String.raw pattern',
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      "  return s.replace(RegExp(`^a+`, 'g'), '-')",
      '}',
    ],
    name: 'a RegExp call with a template pattern anchored at the start',
    inputs: combine(REGEX_STRINGS),
    skips: ['anchored-global'],
  },
  {
    lines: [
      'function f(s: string, word: string) {',
      `  return new RegExp(\`^\${word}$\`).test(s)`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, 'b', '$'], ['a', 'ab', '\\']),
    name: 'a RegExp call with a template that has an expression',
    skips: [],
  },
  {
    inputs: combine(
      [
        ...REGEX_STRINGS,
        'b',
        '1.a',
        '11.a',
        '.a',
        'x.a',
        '1.A',
        'z1.a',
        '1.az',
        '1xa',
      ],
      ['a', 'ab'],
    ),
    lines: [
      'function f(s, word) {',
      `  return new RegExp(\`^\${word}$\`).test(s) ||`,
      '    new RegExp(String.raw`^\\d+\\.a$`).test(s)',
      '}',
    ],
    name: 'RegExp calls with templates in JavaScript',
    file: 'example.js',
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return new RegExp('^\0?1').test(s)`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, '\u{0}1', '1', '\u{0}', '2']),
    name: 'a RegExp call with a null escape before a digit',
    skips: [],
  },
]

/**
 * Mutants and checked skipped candidates of `f` in a snippet, with the outputs
 * of each and of the original.
 */
interface IdiomProbes {
  /**
   * Skipped candidates of `f` whose category the outputs can check.
   */
  skipProbes: ({ reason: string; rule: string } & SkipProbe)[]

  /**
   * Skipped candidates of `f` in a timer delay or a timer wait, with their
   * outputs under timers that ignore the delay.
   */
  delayProbes: SkipProbe[]

  /**
   * Mutants of `f` with their outputs.
   */
  probes: MutantProbe[]

  /**
   * Outputs of the original snippet.
   */
  original: string[]
}

/**
 * Generates the mutants and skipped candidates of a snippet without coarse
 * mutants, and runs the original and every mutant and checked skipped candidate
 * of `f` on every input.
 *
 * @param source - Snippet; only the code from `function f(` on is checked.
 * @param inputs - Arguments of `f`, one list per input.
 * @param setup - File name, whose extension selects the language, preset of the
 *   run and preset settings over those of the preset.
 * @returns Outputs of the original, the mutants and the skipped candidates.
 */
async function probeIdiom(
  source: string,
  inputs: unknown[][],
  setup: { settings?: { timeouts: boolean }; preset: string; file: string },
): Promise<IdiomProbes> {
  let { settings, preset, file } = setup
  let start = source.indexOf('function f(')
  let { mutants, skipped } = generateCandidates(source, {
    settings: { ...settings, coarseMutants: false },
    preset,
    file,
  })
  let probes = await Promise.all(
    mutants
      .filter(mutant => mutant.start >= start)
      .map(async mutant => ({
        label: `${mutant.mutator} ${source.slice(mutant.start, mutant.end)} -> ${mutant.replacement}`,
        outputs: await runProgram(applyMutant(source, mutant), file, inputs),
        mutator: mutant.mutator,
        start: mutant.start,
        id: mutant.id,
      })),
  )
  let skipProbes = await Promise.all(
    skipped
      .filter(
        candidate =>
          candidate.start >= start &&
          candidate.kind !== null &&
          CHECKED_CATEGORIES.has(candidate.category) &&
          !UNCHECKED_RULES.has(candidate.rule),
      )
      .map(async candidate => ({
        outputs: await runProgram(
          applyMutant(source, { ...candidate, kind: candidate.kind! }),
          file,
          inputs,
        ),
        label: `${candidate.mutator} ${source.slice(candidate.start, candidate.end)} -> ${candidate.replacement} (${candidate.rule})`,
        category: candidate.category,
        mutator: candidate.mutator,
        reason: candidate.reason,
        start: candidate.start,
        rule: candidate.rule,
        by: candidate.by,
      })),
  )
  let delayProbes = await Promise.all(
    skipped
      .filter(
        candidate =>
          candidate.start >= start &&
          candidate.kind !== null &&
          candidate.rule === 'timer-delay',
      )
      .map(async candidate => ({
        outputs: await runProgram(
          applyMutant(source, { ...candidate, kind: candidate.kind! }),
          file,
          inputs,
        ),
        label: `${candidate.mutator} ${source.slice(candidate.start, candidate.end)} -> ${candidate.replacement} (${candidate.rule})`,
        category: candidate.category,
        mutator: candidate.mutator,
        start: candidate.start,
        by: candidate.by,
      })),
  )
  let original = await runProgram(source, file, inputs)
  return { delayProbes, skipProbes, original, probes }
}

/**
 * Lists every combination of one value from each list.
 *
 * @param lists - Values of each argument.
 * @returns Argument lists, one per combination.
 */
function combine(...lists: unknown[][]): unknown[][] {
  let combinations: unknown[][] = [[]]
  for (let values of lists) {
    combinations = combinations.flatMap(combination =>
      values.map(value => [...combination, value]),
    )
  }
  return combinations
}

/**
 * Finds the skipped candidates of a timer delay or a timer wait that change
 * more than how long a timer waits: the run uses timers that ignore the delay,
 * so such a candidate must have the outputs of the original.
 *
 * @param original - Outputs of the original program, in input order.
 * @param probes - Skipped candidates with the `timer-delay` rule.
 * @returns Labels of the candidates whose outputs differ from the original.
 */
function findDelayChanges(original: string[], probes: SkipProbe[]): string[] {
  return probes
    .filter(probe =>
      probe.outputs.some((output, index) => output !== original[index]),
    )
    .map(probe => probe.label)
}

/**
 * Snippets whose mutants exercise the text rules and the hosting rule: the text
 * rules of catalog 14 (operator gaps with comments and parentheses, merges,
 * regrouped operands, missing outer guards, list removals, numeric and template
 * texts, unrepresented parentheses, chain edits), the review cases of 12.5,
 * statements without semicolons for the ASI guard, and the script blocks of
 * Vue, Svelte and Astro components, whose mutants must leave every block
 * parsing.
 */
const HOSTED_SNIPPETS: { lines: string[]; file: string }[] = [
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

/**
 * Snippets full of code that scope analysis sees but the runtime tree leaves
 * out: ambient declarations of every kind, logging calls that read and write
 * locals (also inside loops and returns), type positions, decorators, enums,
 * `import()` and `require` arguments.
 */
const NON_RUNTIME_SNIPPETS: { lines: string[]; file: string }[] = [
  {
    lines: [
      'declare const VERSION: string',
      'export function v() { return VERSION }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'declare const cfg: { url: string; on: boolean }',
      'export function u() { return cfg.url }',
      'export function o() { return cfg.on }',
      'export const a = () => cfg.url',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'declare let count: number',
      'declare var flag: boolean',
      'export function c() { count++; count += 2; return count }',
      'export function f() { if (flag) return flag; flag = !flag; return !flag }',
      'export function w() { while (count < 3) { count = count + 1 } return count > 0 }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'declare function load(): Promise<string>',
      'declare function load(id: number): Promise<string>',
      'declare const pending: Promise<number>',
      'export async function g() { const u = await load(); return u }',
      'export async function h() { const v = await pending; return v }',
      'export async function* pages(ids: number[]) { for (const id of ids) yield await load(id) }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'declare class Foo { x: number; m(): boolean }',
      'declare enum E { A, B }',
      'declare namespace N { const x: number }',
      "declare module 'm' { export const y: number }",
      'declare global { var G: string }',
      'export function h(f: Foo) { return f.x > 0 ? f.m() : null }',
      'export function e() { return E.A === E.B }',
      'export function n() { return N.x + 1 }',
      "export function gg() { return G || 'x' }",
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'export declare const ready: boolean',
      'export declare function check(a: number): boolean',
      'class A { declare x: number; m() { return this.x } }',
      'abstract class B { abstract y: number; abstract m(): number; f(a: string): string; f(a: any) { return a } }',
      'export function r(a: A) { return check(a.m()) && ready }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'enum Color { Red = 1, Green = Red + 1, Blue = Green * 2 }',
      'const enum Size { S = 1, L = S << 2 }',
      'export function col(c: Color) { return c === Color.Red ? Size.S : Size.L }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'function run(ts) { let done = 0; for (const t of ts) { t(); console.log(++done) } return done }',
      'async function f() { const u = await load(); return console.log(u) }',
      "async function g() { const u = await load(); return debug('loaded %o', u) }",
      'function h(a) { let x = a; console.log(x = x + 1, x > 0 && x); while (x < 10) { logger.info(x++) } return x }',
      'function k(a) { let ok = false; console.log((ok = a > 1)); return ok }',
      'function m(a) { let s = ""; console.warn(s += a); return s.length > 0 ? s : null }',
      'let t = 0; console.log(t += 1); export const read = () => t',
      'function n(xs) { let i = 0; while (i < xs.length) { console.log(i++) } return i }',
      'function p() { let q = 1; console.log((() => { let z = q; return z })()); return q }',
    ],
    file: 'example.js',
  },
  {
    lines: [
      'export function f(x?: number) { console.log(x ??= 1); return x }',
      'export function g(a: number[]) { let total = 0; for (const v of a) { console.debug(total += v) } return total }',
      'export async function h() { const u = await fetchUser(); return console.log(u as unknown) }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      "function f<T extends string = 'a'>(x: T): T { let y: typeof x = x; return y }",
      'let base = 1',
      'type K = typeof base',
      'interface I { k: typeof base }',
      'function g(a: number): K { let r: Array<typeof a> = []; return r.length > 0 ? base : a }',
      'let z = <const>[1, 2]',
      'let s = { a: 1 } satisfies Record<string, number>',
      'export function h(v: string | null) { return v!.length > 0 && z.length > 1 }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'function dec(v: number) { return (t: any) => t }',
      'let n = 1',
      '@dec(n + 1) class A { @dec(n++) m() { return n } @dec(n > 0 ? 1 : 2) p = n }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      "let p = 'x'",
      "export async function i() { const m = await import(p + '.js'); return m }",
      "export function r(name: string) { const mod = require('./' + name); return mod }",
      "import fs = require('fs')",
      "export function q() { return fs.readFileSync('a') }",
      "export * from './other'",
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'namespace NS { export const a = 1; export function f() { return a > 0 } }',
      'export function nf() { return NS.f() && NS.a === 1 }',
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'async function f(rs) { for (await using r of rs) { return await r.read() } }',
      'async function g(r0) { await using r = r0; return await r.read() }',
      'function h(rs) { for (using r of rs) { return r.size > 0 } }',
    ],
    file: 'example.ts',
  },
]

/**
 * Value context of the catalog's value brute force (12.3).
 */
interface ValueContext {
  /**
   * Faults of the context around the formula.
   */
  outer(formula: string): string[]

  /**
   * Alternatives that no kept mutant covers, by formula: documented gaps.
   */
  gaps: Record<string, string[]>

  /**
   * Writes the observed expression around a formula.
   */
  wrap(formula: string): string

  /**
   * Text of the snippet before the expression.
   */
  prefix: string

  /**
   * Text of the snippet after the expression.
   */
  suffix: string

  /**
   * File name of the snippet.
   */
  file: string

  /**
   * Seed of the formulas.
   */
  seed: number
}

/**
 * Truth position of the catalog's `??` brute force (12.4).
 */
interface NullishContext {
  /**
   * Writes the condition around an expression, with the other operand and
   * operator of the enclosing group when the position has one.
   */
  wrap(expression: string, operand?: string, operator?: string): string

  /**
   * Operator of the enclosing group with its operands swapped, or null when the
   * position has no group.
   */
  swapped: string | null
}

/**
 * Formula of a brute force case, with what its check needs.
 */
interface FormulaCase {
  /**
   * Classic alternatives of the formula, each written as a whole formula.
   */
  alternatives: string[]

  /**
   * Values of the names, one row per input.
   */
  inputs: unknown[][]

  /**
   * Text of the formula.
   */
  expression: string

  /**
   * Names of the formula, in the order of the input values.
   */
  names: string[]
}

/**
 * How the formulas of a brute force are generated.
 */
interface FormulaSetup {
  /**
   * Values of each kind of name.
   */
  domains: FormulaDomains

  /**
   * Boolean names, of which each formula uses a random prefix.
   */
  booleans: string[]

  /**
   * Whether a comparison may compare two number names instead of a name and the
   * literal 1.
   */
  pairs: boolean
}

/**
 * Language of the `??` brute force, with the types and values of its names.
 */
interface NullishLanguage {
  /**
   * Values of the default name `y`.
   */
  defaults: unknown[]

  /**
   * Values of the left operand `x`.
   */
  values: unknown[]

  /**
   * Text of the snippet before the condition.
   */
  prefix: string

  /**
   * File name of the snippet.
   */
  file: string
}

/**
 * Parameters of `f` in the TypeScript snippets of the brute force.
 */
const PARAMETERS = [
  'a: boolean',
  'b: boolean',
  'c: boolean',
  'x1: number',
  'x2: number',
  'x3: number',
  'y1: number',
  'y2: number',
  'y3: number',
].join(', ')

/**
 * Values of a number name: below, at and above the literal 1, with room for the
 * shifted literals.
 */
const FORMULA_NUMBERS = [-1, 0, 1, 2, 3]

/**
 * Alternatives that no kept mutant covers in the JavaScript value context, all
 * of the gap catalog 11.8 documents for value-mode logical expressions whose
 * operands have unknown types: each forces an operand of unknown type to a
 * boolean constant, a type-changing value that the drops and the nullish swap
 * avoid.
 */
const UNKNOWN_OPERAND_GAPS: Record<string, string[]> = {
  '(((a && 1 === x1) || b) && (x2 <= 1 || !(1 < x3)))': [
    '(((a && 1 === x1) || false) && (x2 <= 1 || !(1 < x3)))',
  ],
  '((1 <= x1 || a) && b)': ['((1 <= x1 || a) && false)'],
  '((1 < x1 && a) || b)': ['((1 < x1 && a) || false)'],
  '(1 < x1 && (a || b))': ['(1 < x1 && (a || false))'],
  '(a || b)': ['(a || false)'],
  '(a && b)': ['(a && false)'],
}

/**
 * The value contexts of 12.3: `(F) && object` and `(F) || object` with typed
 * operands, and `return F` in plain JavaScript, where every name has an unknown
 * type.
 */
const VALUE_CONTEXTS: Record<string, ValueContext> = {
  '|| object': {
    prefix: [
      'interface Marker { tag: string }',
      'declare function use(value: unknown): void',
      `function f(${PARAMETERS}, marker: Marker, fallback: Marker) {`,
      '  const value = ',
    ].join('\n'),
    outer: formula => [
      `(${formula}) && fallback`,
      'fallback',
      `(${formula})`,
      'true',
    ],
    wrap: formula => `(${formula}) || fallback`,
    suffix: '\n  use(value)\n}\n',
    file: 'example.ts',
    seed: 202,
    gaps: {},
  },
  '&& object': {
    prefix: [
      'interface Marker { tag: string }',
      'declare function use(value: unknown): void',
      `function f(${PARAMETERS}, marker: Marker, fallback: Marker) {`,
      '  const value = ',
    ].join('\n'),
    outer: formula => [
      `(${formula}) || marker`,
      'marker',
      `(${formula})`,
      'false',
    ],
    wrap: formula => `(${formula}) && marker`,
    suffix: '\n  use(value)\n}\n',
    file: 'example.ts',
    seed: 101,
    gaps: {},
  },
  'JavaScript return': {
    prefix: ['export function f(a, b, c, x1, x2, x3) {', '  return '].join(
      '\n',
    ),
    gaps: UNKNOWN_OPERAND_GAPS,
    wrap: formula => formula,
    file: 'example.js',
    outer: () => [],
    suffix: '\n}\n',
    seed: 303,
  },
}

/**
 * Defaults of `x ?? D` in the `??` brute force, with the truthiness flip of
 * each.
 */
const NULLISH_DEFAULTS: Record<string, string> = {
  false: 'true',
  true: 'false',
  null: 'true',
  "'a'": "''",
  "''": "'a'",
  y: '!y',
  0: '1',
  1: '0',
}

/**
 * Truth positions of the `??` brute force.
 */
const NULLISH_CONTEXTS: Record<string, NullishContext> = {
  'right operand of ||': {
    wrap: (expression, operand = 'a', operator = '||') =>
      `${operand} ${operator} (${expression})`,
    swapped: '&&',
  },
  'right operand of &&': {
    wrap: (expression, operand = 'a', operator = '&&') =>
      `${operand} ${operator} (${expression})`,
    swapped: '||',
  },
  'left operand of &&': {
    wrap: (expression, operand = 'a', operator = '&&') =>
      `(${expression}) ${operator} ${operand}`,
    swapped: '||',
  },
  negation: {
    wrap: expression => `!(${expression})`,
    swapped: null,
  },
  condition: {
    wrap: expression => expression,
    swapped: null,
  },
}

/**
 * Languages of the `??` brute force: nullable booleans in TypeScript, and names
 * of unknown type in JavaScript.
 */
const NULLISH_LANGUAGES: Record<string, NullishLanguage> = {
  TypeScript: {
    prefix: [
      'declare function hit(): void',
      'export function f(x: boolean | undefined, y: boolean | undefined, a: boolean) {',
      '  if (',
    ].join('\n'),
    defaults: [undefined, false, true],
    values: [undefined, false, true],
    file: 'example.ts',
  },
  JavaScript: {
    prefix: ['export function f(x, y, a) {', '  if ('].join('\n'),
    values: [undefined, null, false, true, 0, '', 1, 'a'],
    defaults: [undefined, false, true, 0, 'a'],
    file: 'example.js',
  },
}

/**
 * Alternatives of `x ?? D` that no kept mutant covers, the two `??` gaps of
 * catalog 11.8: a `null` default has no truthiness flip, so "a nullish left
 * side becomes truthy" is not probed; and an unknown default gets no swap to
 * `||` (D14).
 */
const NULLISH_GAPS: Record<string, string> = {
  'TypeScript null': 'x ?? true',
  'JavaScript null': 'x ?? true',
  'JavaScript y': 'x || y',
}

/**
 * Lists the cases of the `??` brute force: every language, default and truth
 * position.
 *
 * @returns One case per combination, with its expected gap.
 */
function createNullishCases(): {
  check: ExpressionCheck
  uncovered: string[]
}[] {
  return Object.entries(NULLISH_LANGUAGES).flatMap(([language, setup]) =>
    Object.entries(NULLISH_DEFAULTS).flatMap(([fallback, flip]) =>
      Object.values(NULLISH_CONTEXTS).map(({ swapped, wrap }) => {
        let original = `x ?? ${fallback}`
        let alternatives = [
          fallback,
          'x',
          `x || ${fallback}`,
          `x ?? ${flip}`,
          `true ?? ${fallback}`,
          `false ?? ${fallback}`,
          `undefined ?? ${fallback}`,
          'true',
          'false',
          `!(${original})`,
          `x && ${fallback}`,
        ].map(expression => wrap(expression))
        alternatives.push('true', 'false', `!(${wrap(original)})`)
        if (swapped !== null) {
          alternatives.push(
            wrap(original, 'true'),
            wrap(original, 'false'),
            wrap(original, 'a', swapped),
          )
        }
        let gap = NULLISH_GAPS[`${language} ${fallback}`]
        let defaults = fallback === 'y' ? setup.defaults : [undefined]
        return {
          check: {
            inputs: setup.values.flatMap(x =>
              defaults.flatMap(y => [false, true].map(a => [x, y, a])),
            ),
            expression: wrap(original),
            observe: 'truth' as const,
            names: ['x', 'y', 'a'],
            suffix: ') hit()\n}\n',
            prefix: setup.prefix,
            file: setup.file,
            alternatives,
          },
          uncovered: gap === undefined ? [] : [wrap(gap)],
        }
      }),
    ),
  )
}

/**
 * Generates the random read-once formulas of a brute force with a fixed seed.
 *
 * @param seed - Seed of the generator.
 * @param count - Number of formulas.
 * @param setup - Names and values of the formulas.
 * @returns The formulas with their inputs and classic alternatives.
 */
function createFormulaCases(
  seed: number,
  count: number,
  setup: FormulaSetup,
): FormulaCase[] {
  let random = createRandom(seed)
  return Array.from({ length: count }, () => {
    let booleans = setup.booleans.slice(0, random(setup.booleans.length + 1))
    let numberCount = 1 + random(3)
    let total = booleans.length + numberCount
    let formula = generateFormula(
      random,
      {
        others: setup.pairs ? ['y1', 'y2', 'y3'].slice(0, numberCount) : [],
        numbers: ['x1', 'x2', 'x3'].slice(0, numberCount),
        booleans,
      },
      Math.min(2 + random(Math.max(1, total - 1)), total),
    )
    return {
      alternatives: getClassicAlternatives(formula).map(alternative =>
        printFormula(alternative),
      ),
      ...getFormulaInputs(formula, setup.domains),
      expression: printFormula(formula),
    }
  })
}

describe('generateFileMutants', () => {
  it('returns the parse errors of a file that does not parse', () => {
    let result = generate(
      ['let x = ;'],
      [activate('arithmetic', 0, ARITHMETIC)],
    )

    expect(result).toMatchObject({
      file: 'src/example.ts',
      source: 'let x = ;',
      parsed: false,
      mutants: [],
    })
    expect(result.diagnostics[0]).toMatchObject({
      code: 'parse-error',
      severity: 'error',
    })
  })

  it('lists the mutants of every mutator in canonical order', () => {
    let result = generate(
      ['function add(a: number, b: number) {', '  return a + b', '}', 'x = 1'],
      [
        activate('arithmetic', 0, ARITHMETIC),
        activate('removal', 1, REMOVAL),
        activate('same', 2, SAME),
      ],
    )

    expect(result).toStrictEqual({
      mutants: [
        {
          id: createMutantId({
            path: 'src/example.ts',
            mutator: 'arithmetic',
            replacement: 'a - b',
            original: 'a + b',
            occurrence: 0,
            scope: 'add',
          }),
          file: 'src/example.ts',
          mutator: 'arithmetic',
          replacement: 'a - b',
          kind: 'expression',
          status: 'Pending',
          ignoredBy: null,
          reason: null,
          scope: 'add',
          start: 46,
          end: 51,
        },
        {
          id: createMutantId({
            path: 'src/example.ts',
            mutator: 'removal',
            original: 'x = 1',
            replacement: '',
            occurrence: 0,
            scope: '',
          }),
          file: 'src/example.ts',
          mutator: 'removal',
          status: 'Pending',
          replacement: '',
          ignoredBy: null,
          kind: 'block',
          reason: null,
          scope: null,
          start: 54,
          end: 59,
        },
      ],
      source: [
        'function add(a: number, b: number) {',
        '  return a + b',
        '}',
        'x = 1',
      ].join('\n'),
      file: 'src/example.ts',
      diagnostics: [],
      parsed: true,
      skipped: [],
    })
  })

  it('gives every mutant the digest of its region on request', () => {
    let lines = [
      'function add(a: number, b: number) {',
      '  return a + b',
      '}',
      'x = 1',
    ]
    let mutators = [
      activate('arithmetic', 0, ARITHMETIC),
      activate('removal', 1, REMOVAL),
    ]
    let { regions, mutants } = generate(lines, mutators, { regions: true })

    expect([...regions!.keys()]).toStrictEqual(mutants.map(mutant => mutant.id))
    expect(new Set(regions!.values())).toHaveProperty('size', 2)
    expect(generate(lines, mutators)).not.toHaveProperty('regions')
  })

  it('answers isEnabled and isActive with the ignore directives of the file', () => {
    let answers: string[] = []
    let probe: Mutator = {
      create: context => ({
        BinaryExpression(node) {
          answers.push(
            [
              context.sourceCode.getText(node),
              context.isActive('arithmetic', node),
              context.isActive('copy', node),
              context.isEnabled('arithmetic'),
              context.isEnabled('copy'),
            ].join(' '),
          )
          return []
        },
      }),
      meta: { description: 'Probe.' },
    }

    generate(
      [
        '// mootant-ignore-next-line arithmetic',
        'x = a + b',
        '// mootant-ignore-start',
        'x = c + d',
        '// mootant-ignore-end',
        'x = e + f',
      ],
      [activate('arithmetic', 0, ARITHMETIC), activate('probe', 1, probe)],
    )
    generate(
      ['x = g + h', '// mootant-ignore-file arithmetic'],
      [activate('arithmetic', 0, ARITHMETIC), activate('probe', 1, probe)],
    )

    expect(answers).toStrictEqual([
      'a + b false false true false',
      'c + d false false true false',
      'e + f true false true false',
      'g + h false false true false',
    ])
  })

  it('assigns ids before duplicates are dropped', () => {
    let lines = ['x = a + b']
    let alone = generate(lines, [activate('arithmetic', 1, ARITHMETIC)])
    let duplicated = generate(lines, [
      activate('copy', 0, ARITHMETIC),
      activate('arithmetic', 1, ARITHMETIC),
    ])

    expect(duplicated.mutants.map(mutant => mutant.mutator)).toStrictEqual([
      'copy',
    ])

    let copied = generate(lines, [
      activate('arithmetic', 1, ARITHMETIC),
      activate('copy', 2, ARITHMETIC),
    ])

    expect(copied.mutants).toStrictEqual(alone.mutants)
  })

  it.each([
    {
      name: 'drops a coarse mutant that holds a finer pending one',
      expected: ['arithmetic'],
      coarseMutants: false,
      loggers: [],
    },
    {
      name: 'keeps a coarse mutant that holds a finer one with coarse mutants on',
      expected: ['arithmetic', 'removal'],
      coarseMutants: true,
      loggers: [],
    },
  ])('$name', ({ coarseMutants, expected }) => {
    let result = generate(
      ['total = a + b'],
      [activate('arithmetic', 0, ARITHMETIC), activate('removal', 1, REMOVAL)],
      { coarseMutants },
    )

    expect(
      result.mutants.map(mutant => mutant.mutator).toSorted(),
    ).toStrictEqual(expected)
  })

  it('surfaces a coarse mutant with its usual id when its finer one is ignored', () => {
    let lines = [
      '// mootant-ignore-next-line arithmetic: checked elsewhere',
      'total = a + b',
    ]
    let result = generate(lines, [
      activate('arithmetic', 0, ARITHMETIC),
      activate('removal', 1, REMOVAL),
    ])
    let removalOnly = generate(lines, [activate('removal', 1, REMOVAL)])

    expect(result.mutants).toMatchObject([
      { mutator: 'removal', status: 'Pending', ignoredBy: null, reason: null },
      {
        ignoredBy: {
          directive: 'mootant-ignore-next-line',
          column: 1,
          line: 1,
        },
        reason: 'checked elsewhere',
        mutator: 'arithmetic',
        status: 'Ignored',
      },
    ])
    expect(result.mutants[0]!.id).toBe(removalOnly.mutants[0]!.id)
  })

  it('returns mutator errors, then directive and region warnings', () => {
    let broken: Mutator = {
      create: () => {
        throw new Error('Broken.')
      },
      meta: { description: 'Broken.' },
    }

    let result = generate(
      ['// mootant-ignore-next-line typo', 'x = 1', '// mootant-ignore-end'],
      [activate('probe', 0, broken)],
    )

    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toStrictEqual(
      ['mutator-error', 'unknown-mutator', 'unmatched-ignore-end'],
    )
  })

  it('merges the mutants of every script block with one id numbering per file', () => {
    let result = generateComponent(
      [
        '<template><p>{{ a + b }}</p></template>',
        '<script>x = a + b</script>',
        '<script setup lang="ts">',
        'x = a + b',
        '</script>',
      ],
      'src/App.vue',
    )

    expect(
      result.mutants.map(mutant => [
        mutant.start,
        mutant.replacement,
        mutant.id,
      ]),
    ).toStrictEqual(
      [
        [52, 0],
        [96, 1],
      ].map(([start, occurrence]) => [
        start,
        'a - b',
        createMutantId({
          occurrence: occurrence!,
          mutator: 'arithmetic',
          replacement: 'a - b',
          path: 'src/App.vue',
          original: 'a + b',
          scope: '',
        }),
      ]),
    )
    expect(result).toMatchObject({ diagnostics: [], parsed: true })
  })

  it('applies a file directive of any block to every block', () => {
    let result = generateComponent(
      [
        '---',
        'x = a + b',
        '---',
        '<script>',
        '// mootant-ignore-file arithmetic',
        'y = c + d',
        '</script>',
        '<script>',
        '// mootant-ignore-next-line',
        'z = e + f',
        '</script>',
      ],
      'src/index.astro',
    )

    expect(
      result.mutants.map(mutant => [
        mutant.replacement,
        mutant.ignoredBy?.directive,
      ]),
    ).toStrictEqual([
      ['a - b', 'mootant-ignore-file'],
      ['c - d', 'mootant-ignore-file'],
      ['e - f', 'mootant-ignore-next-line'],
    ])
  })

  it('reports a block that fails to parse and mutates the others', () => {
    let result = generateComponent(
      [
        '<script context="module">let a = (</script>',
        '<p>{a + b}</p>',
        '<script>',
        'x = c + d',
        '// mootant-ignore-end',
        '</script>',
      ],
      'src/Card.svelte',
    )

    expect(result.mutants.map(mutant => mutant.replacement)).toStrictEqual([
      'c - d',
    ])
    expect(result.parsed).toBe(true)
    expect(
      result.diagnostics.map(diagnostic => [diagnostic.code, diagnostic.line]),
    ).toStrictEqual([
      ['parse-error', 1],
      ['unmatched-ignore-end', 5],
    ])
  })

  it.each([
    {
      lines: ['<script>let a = (</script>', '<script>let b = )</script>'],
      name: 'is not parsed when every block fails',
      parseErrors: 2,
      parsed: false,
    },
    {
      name: 'is parsed without mutants when it has no block',
      lines: ['<template><p>{{ a + b }}</p></template>'],
      parseErrors: 0,
      parsed: true,
    },
  ])('a component $name', ({ parseErrors, parsed, lines }) => {
    let result = generateComponent(lines, 'src/App.vue')

    expect(result).toMatchObject({ mutants: [], parsed })
    expect(result.diagnostics).toHaveLength(parseErrors)
  })

  it('mutates the expressions of a Svelte template with the scope <template>', () => {
    let result = generateSvelte([
      '<script lang="ts">',
      '  function f(n: number) { log(n + 1) }',
      '</script>',
      '<p>{(a as number) + b}</p>',
      '<!-- mootant-ignore-next-line arithmetic: shown as is -->',
      '{#if c + d}<button onclick={() => { f(e + g) }}>x</button>{/if}',
    ])

    expect(
      result.mutants.map(mutant => [
        mutant.mutator,
        mutant.replacement,
        mutant.scope,
        mutant.status,
      ]),
    ).toStrictEqual([
      ['removal', '', 'f', 'Pending'],
      ['arithmetic', 'n - 1', 'f', 'Pending'],
      ['arithmetic', '(a as number) - b', '<template>', 'Pending'],
      ['arithmetic', 'c - d', '<template>', 'Ignored'],
      ['arithmetic', 'e - g', '<template>', 'Ignored'],
    ])
    expect(result.skipped).toStrictEqual([])
    expect(result.diagnostics).toStrictEqual([])
  })

  it('skips the position swap of an update an event handler returns', () => {
    let result = generateFileMutants({
      source: [
        '<script>let { Comp } = $props(); let count = 0; let f = () => count++</script>',
        '<button onclick={() => count++} on:blur={() => (count--)}>{count++}</button>',
        '<Comp onchange={() => count++} />',
      ].join('\n'),
      mutators: [activate('update-operator', 0, updateOperator)],
      compilers: { vue: null, svelte },
      file: 'src/Card.svelte',
      settings: SETTINGS,
      knownMutatorIds,
      skipped: true,
    })

    expect(result.mutants.map(mutant => mutant.replacement)).toStrictEqual([
      'count--',
      '++count',
      'count--',
      'count++',
      'count--',
      '++count',
      'count--',
      '++count',
    ])
    expect(
      result.skipped.map(mutant => [mutant.replacement, mutant.rule]),
    ).toStrictEqual([
      ['++count', 'unused-result'],
      ['--count', 'unused-result'],
    ])
  })

  it('mutates the expressions of a Vue template in the forms Vue compiles', () => {
    let result = generateFileMutants({
      source: [
        '<script setup>let count = 0; let save = () => count + 1</script>',
        '<template>',
        '  <p :title="count + 1">{{ count - 1 }}</p>',
        '  <!-- mootant-ignore-next-line -->',
        '  <i v-if="count + 2" />',
        '  <button @click="count++" @input="save" @blur="() => count++">x</button>',
        '</template>',
      ].join('\n'),
      mutators: [
        activate('arithmetic', 0, ARITHMETIC),
        activate('update-operator', 1, updateOperator),
      ],
      compilers: { svelte: null, vue },
      file: 'src/Card.vue',
      settings: SETTINGS,
      knownMutatorIds,
      skipped: true,
    })

    expect(
      result.mutants.map(mutant => [
        mutant.replacement,
        mutant.scope,
        mutant.status,
      ]),
    ).toStrictEqual([
      ['count - 1', 'save', 'Pending'],
      ['count - 1', '<template>', 'Pending'],
      ['count - 2', '<template>', 'Ignored'],
      ['count--', '<template>', 'Pending'],
      ['count--', '<template>', 'Pending'],
    ])
    expect(
      result.skipped.map(mutant => [mutant.replacement, mutant.rule]),
    ).toStrictEqual([
      ['++count', 'unused-result'],
      ['++count', 'unused-result'],
    ])
    expect(
      generateFileMutants({
        mutators: [activate('arithmetic', 0, ARITHMETIC)],
        source: '<template>{{ a + b }}</template>',
        compilers: { vue: null, svelte },
        file: 'src/Card.vue',
        settings: SETTINGS,
        knownMutatorIds,
      }).mutants,
    ).toStrictEqual([])
  })

  it.each([
    {
      source: [
        '<script setup>let a = 1</script>',
        `<template><p :title='\`\${a} px\`' :alt="\`\${a}\`">{{ \`n \${a}\` }}</p></template>`,
      ].join('\n'),
      expected: ['""', "''"],
      file: 'src/Card.vue',
    },
    {
      source: `<script>let a = 1</script>\n<p title={\`\${a} px\`}>{\`n \${a.b}\`}</p>`,
      file: 'src/Card.svelte',
      expected: ["''", "''"],
    },
  ])(
    'empties a template of plain reads in a $file template',
    ({ expected, source, file }) => {
      let result = generateWithCompilers(source, file, [
        activate('string-literal', 0, stringLiteral),
      ])

      expect(result.mutants.map(mutant => mutant.replacement)).toStrictEqual(
        expected,
      )
      expect(
        result.mutants.every(mutant => mutant.scope === '<template>'),
      ).toBe(true)
    },
  )

  it.each([
    {
      source: "let at = s.indexOf(':'); f(at)",
      title: 'a let of a module',
      file: 'src/a.ts',
      expected: '-1',
    },
    {
      source: "<script>let at = s.indexOf(':'); f(at)</script>",
      title: 'a top-level let of a component',
      file: 'src/Card.svelte',
      expected: 'null',
    },
    {
      source: "{let at = s.indexOf(':'), b = f(at)}",
      title: 'a let of a Svelte declaration tag',
      file: 'src/Card.svelte',
      expected: 'null',
    },
    {
      source:
        '<template><i @click="let at = s.indexOf(\':\'); f(at)" /></template>',
      title: 'a let of a Vue event handler',
      file: 'src/App.vue',
      expected: '-1',
    },
    {
      source:
        '<script>let page = 0; function next() { page += 1 }; f(page)</script>',
      title: 'a top-level counter of a component',
      file: 'src/Card.svelte',
      expected: 'null',
    },
    {
      source: [
        '<script>',
        'let opened = 0',
        'export function track() { opened += 1; f(opened) }',
        '</script>',
        '<script setup>',
        'opened -= 1',
        '</script>',
      ].join('\n'),
      title: 'a counter of one script block of a component',
      file: 'src/Pager.vue',
      expected: 'null',
    },
    {
      source: '<script>function g() { let row = 0; row++; f(row) }</script>',
      title: 'a function-local counter of a component',
      file: 'src/Card.svelte',
      expected: '0',
    },
    {
      source: [
        '<script module>',
        'export class Set { size = -1 }',
        '</script>',
        '<script>',
        'function g(list) { const size = new Set(list).size; f(size) }',
        '</script>',
      ].join('\n'),
      title: 'a Set that the module script of a Svelte component declares',
      file: 'src/Tally.svelte',
      expected: 'null',
    },
    {
      source: [
        '<script>',
        'export class Set { size = -1 }',
        '</script>',
        '<script setup>',
        'function g(list) { const size = new Set(list).size; f(size) }',
        '</script>',
      ].join('\n'),
      title: 'a Set that the other script block of a Vue component declares',
      file: 'src/Tally.vue',
      expected: 'null',
    },
    {
      source: [
        '<script setup>',
        'class Set { size = -1 }',
        'const items = []',
        '</script>',
        '<template><i @click="let size = new Set(items).size; f(size)" /></template>',
      ].join('\n'),
      title: 'a Set that the script of a Vue template declares',
      file: 'src/Tally.vue',
      expected: 'null',
    },
  ])(
    'tells the syntax helpers whether other code shares $title',
    ({ expected, source, file }) => {
      let result = generateWithCompilers(source, file, [
        activate('bound', 0, BOUND),
      ])

      expect(result.mutants.map(mutant => mutant.replacement)).toStrictEqual([
        expected,
      ])
    },
  )

  it.each([
    {
      source: [
        'let counts = new Map()',
        'counts.set(key, 1)',
        'let found = counts.get(key) ?? false',
        'if (found) run()',
      ].join('\n'),
      expected:
        'found: it is a number of at least 1, since every value stored in `counts` is at least 1',
      title: 'names of a module',
      file: 'src/a.ts',
    },
    {
      source: [
        '<script>',
        'let counts = new Map()',
        'counts.set(key, 1)',
        'let found = counts.get(key) ?? false',
        '$: label = found ? 1 : 2',
        '</script>',
      ].join('\n'),
      title: 'top-level names of a Svelte component',
      file: 'src/Card.svelte',
      expected: 'null: null',
    },
    {
      source: [
        '<script setup>',
        "const note = props.note ?? ''",
        'if (note) run()',
        '</script>',
        '<template><p :data-note="note" /></template>',
      ].join('\n'),
      title: 'top-level names of a Vue component',
      expected: 'null: null',
      file: 'src/Size.vue',
    },
    {
      source: [
        '---',
        'const on = Astro.props.on ?? false',
        'if (on) run()',
        '---',
        '<p>{on}</p>',
      ].join('\n'),
      title: 'top-level names of an Astro component',
      expected: 'null: null',
      file: 'src/Page.astro',
    },
    {
      source: [
        '<script>',
        'function size() {',
        'let total = 1',
        'total += items.length',
        'let found = total ?? false',
        'return found ? 1 : 2',
        '}',
        '</script>',
      ].join('\n'),
      expected:
        'found: it is a number of at least 1, since `total` starts at 1 and only grows',
      title: 'function locals of a Svelte component',
      file: 'src/Card.svelte',
    },
    {
      source: [
        '<script>',
        'function size() {',
        'let counts = new Map()',
        'counts.set(key, 1)',
        'let found = counts.get(key) ?? false',
        'return found ? 1 : 2',
        '}',
        '</script>',
      ].join('\n'),
      title:
        'a function-local Map of a Svelte component, as Map may be the name of another block',
      file: 'src/Card.svelte',
      expected: 'found: null',
    },
  ])(
    'tells the syntax helpers whether other code shares the defaults of $title',
    ({ expected, source, file }) => {
      let result = generateWithCompilers(source, file, [
        activate('defaults', 0, DEFAULTS),
      ])

      expect(
        result.mutants.map(mutant => JSON.parse(mutant.replacement) as string),
      ).toStrictEqual([expected])
    },
  )

  it.each([
    {
      source: [
        'let parts = []',
        'parts.push(a)',
        "x = parts.join('')",
        'let match = s.match(/(?<a>b)/u)',
        'x = match?.groups?.a',
      ].join('\n'),
      title: 'names of a module',
      expected: ['true', GROUPS],
      file: 'src/a.ts',
    },
    {
      source: [
        '<script setup lang="ts">',
        'const labels: string[] = []',
        "labels.push('a')",
        "function title() { return labels.join('') }",
        'const match = s.match(/(?<a>b)/u)',
        'x = match?.groups?.a',
        '</script>',
        '<template><i v-for="label in labels">{{ label }}</i></template>',
      ].join('\n'),
      title: 'top-level consts of a Vue component',
      expected: ['false', 'null'],
      file: 'src/Size.vue',
    },
    {
      source: [
        '<script lang="ts">',
        'export let content: string[] = []',
        "x = content.join('')",
        'let match = s.match(/(?<a>b)/u)',
        'x = match?.groups?.a',
        '</script>',
      ].join('\n'),
      title: 'top-level names of a Svelte component',
      expected: ['false', 'null'],
      file: 'src/Note.svelte',
    },
    {
      source: [
        '---',
        'const parts = []',
        'parts.push(a)',
        "const text = parts.join('')",
        '---',
        '<p>{text}</p>',
      ].join('\n'),
      title: 'top-level names of an Astro component',
      file: 'src/Page.astro',
      expected: ['false'],
    },
    {
      source: [
        '<script>',
        'function title() {',
        'let parts = []',
        'parts.push(a)',
        'let match = s.match(/(?<a>b)/u)',
        "return parts.join('') + match?.groups?.a",
        '}',
        '</script>',
      ].join('\n'),
      title: 'function locals of a Svelte component',
      expected: ['true', GROUPS],
      file: 'src/Card.svelte',
    },
  ])(
    'tells the syntax helpers whether other code shares the arrays and matches of $title',
    ({ expected, source, file }) => {
      let result = generateWithCompilers(source, file, [
        activate('shapes', 0, SHAPES),
      ])

      expect(
        result.mutants.map(mutant => JSON.parse(mutant.replacement) as string),
      ).toStrictEqual(expected)
    },
  )

  it('reads a Svelte template that follows a byte order mark', () => {
    let source = `${String.fromCodePoint(0xfe_ff)}<p>{a + 12}</p>`
    let result = generateSvelte([source])

    expect(
      result.mutants.map(mutant => source.slice(mutant.start, mutant.end)),
    ).toStrictEqual(['a + 12'])
    expect(result.diagnostics).toStrictEqual([])
  })

  it('says an unclosed start in a template covers the rest of the template', () => {
    let result = generateSvelte([
      '<script>x = a + b</script>',
      '<!-- mootant-ignore-start -->',
      '<p>{a + 1}</p>',
    ])

    expect(
      result.diagnostics.map(diagnostic => diagnostic.message),
    ).toStrictEqual([
      'mootant-ignore-start has no matching mootant-ignore-end; it covers the rest of the template.',
    ])
    expect(result.mutants.map(mutant => mutant.status)).toStrictEqual([
      'Pending',
      'Pending',
      'Ignored',
    ])
  })

  it.each([
    { name: 'the templates setting is off', templates: false },
    { name: 'the template has no expressions', templates: true },
  ])('mutates only the scripts when $name', ({ templates }) => {
    let lines = [
      '<script>x = a + b</script>',
      templates ? '<p><!-- a + b --></p>' : '<p>{a + b}</p>',
    ]

    expect(
      generateSvelte(lines, templates).mutants.map(mutant => mutant.scope),
    ).toStrictEqual([null, null])
  })

  it.each([
    {
      lines: [
        '<script>x = a + b</script>',
        '<template><!-- mootant-ignore-file --><p>a</p></template>',
      ],
      file: 'src/Card.vue',
    },
    {
      lines: [
        '<script>x = a + b</script>',
        '<!-- mootant-ignore-file -->',
        '<p>a</p>',
      ],
      file: 'src/Card.svelte',
    },
  ])(
    'applies a file directive of a template without expressions in $file',
    ({ lines, file }) => {
      let result = generateWithCompilers(lines.join('\n'), file, [
        activate('arithmetic', 0, ARITHMETIC),
      ])

      expect(
        result.mutants.map(mutant => [mutant.replacement, mutant.status]),
      ).toStrictEqual([['a - b', 'Ignored']])
      expect(result.diagnostics).toStrictEqual([])
    },
  )

  it('warns about an unclosed start in a template without expressions', () => {
    let result = generateSvelte([
      '<script>x = a + b</script>',
      '<!-- mootant-ignore-start -->',
      '<p>a</p>',
    ])

    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toStrictEqual(
      ['unclosed-ignore-start'],
    )
    expect(result.mutants.map(mutant => mutant.status)).toStrictEqual([
      'Pending',
      'Pending',
    ])
  })

  it('warns about a template that does not parse and mutates the scripts', () => {
    let result = generateSvelte([
      '<script>x = a + b</script>',
      '<p>{#if a}</p>',
    ])

    expect(result.mutants.map(mutant => mutant.replacement)).toStrictEqual([
      '',
      'a - b',
    ])
    expect(result.parsed).toBe(true)
    expect(
      result.diagnostics.map(diagnostic => [diagnostic.code, diagnostic.line]),
    ).toStrictEqual([['template-skipped', 2]])
  })

  it('applies a file directive of a Vue template whose expression oxc rejects', () => {
    let result = generateWithCompilers(
      [
        '<script setup>x = a + b</script>',
        '<template><!-- mootant-ignore-file --><p>{{ a + }}</p></template>',
      ].join('\n'),
      'src/Card.vue',
      [activate('arithmetic', 0, ARITHMETIC)],
    )

    expect(
      result.mutants.map(mutant => [mutant.replacement, mutant.status]),
    ).toStrictEqual([['a - b', 'Ignored']])
    expect(
      result.diagnostics.map(diagnostic => [diagnostic.code, diagnostic.line]),
    ).toStrictEqual([['template-skipped', 2]])
  })

  it('warns about the template of a component whose scripts do not parse', () => {
    let result = generateSvelte([
      '<script>let a = (</script>',
      '<p>{a + b}</p>',
    ])

    expect(result).toMatchObject({ parsed: false, mutants: [] })
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toStrictEqual(
      ['parse-error', 'template-skipped'],
    )
  })

  it('lists skipped candidates in canonical order with their rules', () => {
    let lines = ['total = a + b']
    let mutators = [
      activate('arithmetic', 0, ARITHMETIC),
      activate('copy', 1, ARITHMETIC),
      activate('removal', 2, REMOVAL),
      activate('skipper', 3, SKIPPER),
    ]
    let result = generate(lines, mutators, { skipped: true })
    let arithmeticId = result.mutants[0]!.id

    expect(result.mutants.map(mutant => mutant.mutator)).toStrictEqual([
      'arithmetic',
    ])
    expect(result.skipped).toStrictEqual([
      {
        reason:
          'a finer arithmetic mutant lies inside the code it removes, and killing that mutant needs a test that observes this code',
        by: { mutator: 'arithmetic', id: arithmeticId, start: 8 },
        file: 'src/example.ts',
        category: 'subsumed',
        mutator: 'removal',
        rule: 'solitary',
        heuristic: true,
        replacement: '',
        kind: 'block',
        start: 0,
        end: 13,
      },
      {
        reason:
          'it produces the same mutated file as an earlier arithmetic mutant',
        by: { mutator: 'arithmetic', id: arithmeticId, start: 8 },
        file: 'src/example.ts',
        category: 'duplicate',
        replacement: 'a - b',
        kind: 'expression',
        rule: 'duplicate',
        heuristic: false,
        mutator: 'copy',
        start: 8,
        end: 13,
      },
      {
        by: { mutator: 'arithmetic', start: 8, id: null },
        reason: 'the swap covers it',
        file: 'src/example.ts',
        mutator: 'skipper',
        kind: 'expression',
        category: 'owned',
        replacement: 'a',
        heuristic: true,
        rule: 'O11',
        start: 8,
        end: 13,
      },
    ])
  })

  it('names no id for a justifying candidate that is not listed', () => {
    let probe: Mutator = {
      create: () => ({
        Identifier(node) {
          return node.name === 'c' ? [{ text: 'd', node }] : []
        },
        BlockStatement(node) {
          return [{ text: '{ f(d) }', node }]
        },
      }),
      meta: { description: 'Probe.' },
    }
    let result = generate(
      ['{ f(c) }'],
      [activate('probe', 0, probe), activate('removal', 1, REMOVAL)],
      { skipped: true },
    )

    expect(
      result.skipped.map(candidate => [candidate.rule, candidate.by]),
    ).toStrictEqual([
      ['solitary', { mutator: 'probe', start: 4, id: null }],
      ['duplicate', { id: result.mutants[0]!.id, mutator: 'probe', start: 0 }],
    ])
  })

  it.each([false, true])(
    'keeps the mutants and their ids when skipped candidates are listed (coarse mutants %s)',
    coarseMutants => {
      let lines = ['total = a + b', 'x = c + d']
      let mutators = [
        activate('arithmetic', 0, ARITHMETIC),
        activate('copy', 1, ARITHMETIC),
        activate('removal', 2, REMOVAL),
        activate('skipper', 3, SKIPPER),
      ]

      expect(
        generate(lines, mutators, { skipped: true, coarseMutants }).mutants,
      ).toStrictEqual(generate(lines, mutators, { coarseMutants }).mutants)
    },
  )

  it('does not list a skipped no-op', () => {
    let noOp: Mutator = {
      create: context => ({
        Literal(node) {
          return [
            {
              skip: { reason: 'the literal mutator owns it', rule: 'O7' },
              text: context.sourceCode.getText(node),
              node,
            },
          ]
        },
      }),
      meta: { description: 'No-op.' },
    }

    expect(
      generate(['x = 1'], [activate('probe', 0, noOp)], { skipped: true })
        .skipped,
    ).toStrictEqual([])
  })

  /*
   * Strict keeps every coarse mutant, which duplicates or subsumes the finer
   * mutants inside it on purpose, so its run here turns them off to check the
   * finer mutants alone.
   */
  it.each(
    IDIOMS.flatMap(idiom => [
      {
        expected: { ...NONE, ...idiom.gaps },
        preset: 'recommended',
        ...idiom,
      },
      {
        expected: { ...NONE, ...idiom.gaps, ...idiom.strictGaps },
        preset: 'strict',
        ...idiom,
      },
    ]),
  )(
    'keeps no weak mutant and no unsound skip in $name under $preset',
    async ({
      unsoundSkips,
      kept = [],
      expected,
      inputs,
      preset,
      lines,
      file,
    }) => {
      let { delayProbes, skipProbes, original, probes } = await probeIdiom(
        lines.join('\n'),
        inputs,
        { preset, file },
      )

      expect(probes.length).toBeGreaterThan(0)
      expect(probes.map(probe => probe.label)).toStrictEqual(
        expect.arrayContaining(kept),
      )
      expect(findWeakMutants(original, probes)).toStrictEqual(expected)
      expect(findUnsoundSkips(original, probes, skipProbes)).toStrictEqual({
        ...SOUND,
        ...unsoundSkips,
      })
      expect(findDelayChanges(original, delayProbes)).toStrictEqual([])
    },
  )

  it.each(
    BOUND_IDIOMS.flatMap(idiom => [
      { preset: 'recommended', ...idiom },
      { preset: 'strict', ...idiom },
    ]),
  )(
    'runs the entries that a bound rules out in $name under $preset',
    async ({
      unsoundSkips,
      kept = [],
      settings,
      bounded,
      inputs,
      preset,
      lines,
    }) => {
      let { skipProbes, original, probes } = await probeIdiom(
        lines.join('\n'),
        inputs,
        { file: 'example.ts', settings, preset },
      )

      expect(
        skipProbes
          .filter(probe => probe.reason.startsWith('a lower bound'))
          .map(probe => probe.label),
      ).toStrictEqual(bounded)
      expect(probes.map(probe => probe.label)).toStrictEqual(
        expect.arrayContaining(kept),
      )
      expect(findUnsoundSkips(original, probes, skipProbes)).toStrictEqual({
        ...SOUND,
        ...unsoundSkips,
      })
    },
  )

  it.each(
    DEFAULT_IDIOMS.flatMap(idiom => [
      { preset: 'recommended', ...idiom },
      { preset: 'strict', ...idiom },
    ]),
  )(
    'runs the swaps and defaults that || keeps in $name under $preset',
    async ({ defaults, inputs, preset, lines }) => {
      let { skipProbes, original, probes } = await probeIdiom(
        lines.join('\n'),
        inputs,
        { file: 'example.ts', preset },
      )

      expect(
        skipProbes
          .filter(
            probe =>
              probe.rule === 'never-falsy' || probe.rule === 'falsy-default',
          )
          .map(probe => probe.label),
      ).toStrictEqual(defaults)
      expect(findUnsoundSkips(original, probes, skipProbes)).toStrictEqual(
        SOUND,
      )
    },
  )

  it.each(
    SHAPE_IDIOMS.flatMap(idiom => [
      { preset: 'recommended', ...idiom },
      { preset: 'strict', ...idiom },
    ]),
  )(
    'runs the arrays and links that join and regex groups keep in $name under $preset',
    async ({ inputs, preset, shapes, lines }) => {
      let { skipProbes, original, probes } = await probeIdiom(
        lines.join('\n'),
        inputs,
        { file: 'example.ts', preset },
      )

      expect(
        skipProbes
          .filter(
            probe =>
              probe.rule === 'joined-array' || probe.rule === 'named-groups',
          )
          .map(probe => probe.label),
      ).toStrictEqual(shapes)
      expect(findUnsoundSkips(original, probes, skipProbes)).toStrictEqual(
        SOUND,
      )
    },
  )

  it.each(
    REGEX_IDIOMS.flatMap(idiom => [
      { preset: 'recommended', ...idiom },
      { preset: 'strict', ...idiom },
    ]),
  )(
    'keeps no equivalent regex mutant and no unsound skip in $name under $preset',
    async ({ file = 'example.ts', settings, inputs, preset, skips, lines }) => {
      let { skipProbes, original, probes } = await probeIdiom(
        lines.join('\n'),
        inputs,
        { settings, preset, file },
      )

      expect(
        probes.filter(probe => probe.mutator.startsWith('regex-')).length,
      ).toBeGreaterThan(0)
      expect(
        findWeakMutants(original, probes).equivalent.filter(label =>
          label.startsWith('regex-'),
        ),
      ).toStrictEqual([])
      expect(
        skipProbes
          .filter(probe => probe.mutator.startsWith('regex-'))
          .map(probe => probe.rule),
      ).toStrictEqual(skips)
      expect(findUnsoundSkips(original, probes, skipProbes)).toStrictEqual(
        SOUND,
      )
    },
  )

  it.each(
    HOSTED_SNIPPETS.flatMap(snippet =>
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

  it.each(
    createFormulaCases(12_345, 200, {
      domains: { numbers: FORMULA_NUMBERS, booleans: [false, true] },
      booleans: ['a', 'b', 'c'],
      pairs: true,
    }),
  )(
    'keeps no weak mutant and covers every fault of if ($expression)',
    ({ alternatives, expression, inputs, names }) => {
      expect(
        checkExpressionMutants({
          prefix: [
            'declare function hit(): void',
            `function f(${PARAMETERS}) {`,
            '  if (',
          ].join('\n'),
          suffix: ') hit()\n}\n',
          file: 'example.ts',
          observe: 'truth',
          alternatives,
          expression,
          inputs,
          names,
        }),
      ).toStrictEqual(NONE)
    },
  )

  it.each(
    Object.entries(VALUE_CONTEXTS).flatMap(([context, value]) =>
      createFormulaCases(value.seed, 100, {
        domains: {
          booleans:
            value.file === 'example.js' ?
              [undefined, null, false, true, 0, '']
            : [false, true],
          numbers: FORMULA_NUMBERS,
        },
        booleans: ['a', 'b'],
        pairs: false,
      }).map(formula => ({ ...formula, context, value })),
    ),
  )(
    'keeps no weak mutant and covers every fault of the $context $expression',
    ({ alternatives, expression, inputs, value, names }) => {
      expect(
        checkExpressionMutants({
          alternatives: [
            ...alternatives.map(alternative => value.wrap(alternative)),
            ...value.outer(expression),
          ],
          inputs: inputs.map(input => [
            ...input,
            { tag: 'marker' },
            { tag: 'fallback' },
          ]),
          names: [...names, 'marker', 'fallback'],
          expression: value.wrap(expression),
          prefix: value.prefix,
          suffix: value.suffix,
          observe: 'value',
          file: value.file,
        }),
      ).toStrictEqual({
        ...NONE,
        uncovered: value.gaps[expression] ?? [],
      })
    },
  )

  it.each(createNullishCases())(
    'keeps no weak mutant and covers every fault of $check.file if ($check.expression)',
    ({ uncovered, check }) => {
      expect(checkExpressionMutants(check)).toStrictEqual({
        ...NONE,
        uncovered,
      })
    },
  )
})

describe('generateFileMutants on non-runtime code', () => {
  it.each(
    NON_RUNTIME_SNIPPETS.flatMap(snippet =>
      ['recommended', 'strict'].map(preset => ({ ...snippet, preset })),
    ),
  )('runs every mutator without errors ($file, $preset)', snippet => {
    expect(() =>
      generateMutants(snippet.lines.join('\n'), {
        preset: snippet.preset,
        file: snippet.file,
      }),
    ).not.toThrow()
  })
})

describe('runProgram', () => {
  it.each([
    [
      'function f(items) { return items }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{value:*.arguments[0]}}',
    ],
    [
      'function f(items) { return [...items] }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{value:["a"]}}',
    ],
    [
      'function f(items) { items.pop() }',
      '{arguments:@.arguments[@.arguments[0][]],events:[["returned"]],result:{value:undefined:undefined}}',
    ],
    [
      'function f(items) { items[0] = items.at(0) }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{value:undefined:undefined}}',
    ],
    ['function f() { for (;;) {} }', 'hung'],
    ['async function f() { await null; for (;;) {} }', 'hung'],
    [
      'function f() { return new Promise(() => {}) }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[],result:{pending:boolean:true}}',
    ],
    [
      "async function f() { settle('a'); run() }",
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["run"],["returned"],["settled","a"]],result:{value:undefined:undefined}}',
    ],
    [
      "function f() { void (async () => { await settle('a'); await settle('b'); save() })() }",
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"],["settled","a"],["settled","b"],["save"]],result:{value:undefined:undefined}}',
    ],
    [
      "async function f() { try { await fail('a') } catch (error) { return error.message } }",
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["failed","a"],["returned"]],result:{value:"a"}}',
    ],
    [
      "function f() { throw new Error('no') }",
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{thrown:"no"}}',
    ],
    [
      'function f() { let list = []; Object.defineProperty(list, 0, { get: () => run(), enumerable: true }); return list }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{value:[<get>]}}',
    ],
  ])('observes %s', async (source, expected) => {
    await expect(
      runProgram(source, 'example.js', [[['a']]]),
    ).resolves.toStrictEqual([expected])
  })

  it('tells a replaced object from the one that existed before the run', async () => {
    let input = [[{ items: ['a'] }]]
    let [replaced] = await runProgram(
      'function f(box) { box.items = box.items.filter(() => true) }',
      'example.js',
      input,
    )
    let [kept] = await runProgram(
      'function f(box) { box.items = box.items }',
      'example.js',
      input,
    )

    expect(replaced).not.toBe(kept)
  })

  it('observes the reads of a getter without calling it when describing', async () => {
    await expect(
      runProgram(
        'function f(user) { return user.name + user.name }',
        'example.js',
        [[createReader({ name: 'a' })]],
      ),
    ).resolves.toStrictEqual([
      '{arguments:@.arguments[@.arguments[0]{name:<get>}],events:[["read","name"],["read","name"],["returned"]],result:{value:"aa"}}',
    ])
  })
})
