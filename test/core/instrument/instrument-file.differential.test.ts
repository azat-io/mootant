import { describe, expect, it } from 'vitest'

import { instrumentFile } from '../../../core/instrument/instrument-file'
import { runSwitchedProgram } from '../../helpers/run-switched-program'
import { generateMutants } from '../../helpers/generate-mutants'
import { applyMutant } from '../../helpers/apply-mutant'
import { runProgram } from '../../helpers/run-program'

/**
 * Programs whose mutants share ranges, nest, start statements and remove
 * statements, with the inputs of `f`.
 */
const PROGRAMS: { inputs: unknown[][]; lines: string[]; file: string }[] = [
  {
    lines: [
      String.raw`let word = /\b[a-z]{2}/gi`,
      'function f(text) {',
      '  let found = []',
      '  let match',
      '  while ((match = word.exec(text))) found.push(match[0])',
      String.raw`  return [found, text.replace(/^\s+|\s+$/g, ''), /^(?:a|b)c?$/m.test(text)]`,
      '}',
    ],
    inputs: [[''], ['ab'], [' Hi there '], ['bc\nx'], ['a1 b2']],
    file: 'example.js',
  },
  {
    lines: [
      String.raw`let digits = new RegExp('\\d+', 'g')`,
      'function f(text, word) {',
      String.raw`  let spaced = text.replace(RegExp(String.raw${'`'}\s+$${'`'}), '')`,
      `  return [spaced.match(digits), new RegExp(\`^\${word}\\\\b\`, "i").test(text)]`,
      '}',
    ],
    inputs: [
      ['', 'a'],
      ['ab 12 ', 'ab'],
      ['A1 b2', 'a'],
      ['x 3', 'ab'],
    ],
    file: 'example.js',
  },
  {
    lines: [
      'let total = 0',
      'function f(value, min, max) {',
      '  let result = value',
      '  if (value < min) result = min',
      '  else if (value > max) result = max',
      '  total += result',
      '  ;[min, max].forEach(x => run(x))',
      '  return result * 2 + total',
      '}',
    ],
    inputs: [
      [0, 1, 3],
      [2, 1, 3],
      [5, 1, 3],
      [3, 3, 3],
    ],
    file: 'example.js',
  },
  {
    lines: [
      'function f(text: string, items: { id: string; n: number }[]) {',
      '  if (text.trim().length === 0) return null',
      '  let parts = items.filter(item => item.n > 1).map(item => item.id)',
      '  emit(parts.length, text.toUpperCase())',
      "  return parts.join(',') || items.at(0)?.id || 'none'",
      '}',
    ],
    inputs: [
      ['', []],
      [' a ', []],
      ['b', [{ id: 'x', n: 1 }]],
      [
        'c',
        [
          { id: 'x', n: 2 },
          { id: 'y', n: 1 },
          { id: 'z', n: 3 },
        ],
      ],
    ],
    file: 'example.ts',
  },
  {
    lines: [
      'async function f(label, values) {',
      '  let count = 0',
      '  for (const value of values) count += value',
      '  await settle(label, count)',
      '  save(count)',
      "  return count > 1 && label !== ''",
      '}',
    ],
    inputs: [
      ['', []],
      ['a', [1]],
      ['b', [1, 2]],
    ],
    file: 'example.js',
  },
]

describe('instrumentFile', () => {
  it.each(
    PROGRAMS.flatMap(program =>
      ['recommended', 'strict'].map(preset => ({ ...program, preset })),
    ),
  )(
    'switches $lines.1 under $preset like each mutant applied alone',
    async ({ preset, inputs, lines, file }) => {
      let source = lines.join('\n')
      let mutants = generateMutants(source, { preset, file })
      let switched = instrumentFile({ mutants, source, file })
      let original = await runProgram(source, file, inputs)
      let expected = await Promise.all(
        mutants.map(mutant =>
          runProgram(applyMutant(source, mutant), file, inputs),
        ),
      )
      let actual = await Promise.all(
        mutants.map(mutant =>
          runSwitchedProgram({ active: mutant.id, switched, file }, inputs),
        ),
      )

      expect(mutants.length).toBeGreaterThan(0)
      await expect(
        runSwitchedProgram({ active: undefined, switched, file }, inputs),
      ).resolves.toStrictEqual(original)
      await expect(
        runSwitchedProgram({ active: null, switched, file }, inputs),
      ).resolves.toStrictEqual(original)
      expect(actual).toStrictEqual(expected)
    },
  )
})
