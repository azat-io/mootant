import { describe, expect, it } from 'vitest'

import { isCaughtInLoop } from '../../../core/syntax/is-caught-in-loop'
import { createTestFile } from '../../helpers/create-test-file'

describe('isCaughtInLoop', () => {
  it.each([
    { source: 'while (x) { try { a } catch {} }', expected: true },
    { source: 'while (x) { try {} catch { a } finally {} }', expected: true },
    { source: 'do { try { a } finally {} } while (x)', expected: true },
    {
      source: 'for (;;) { try { if (b) { f((a)) } } catch {} }',
      expected: true,
    },
    {
      source: 'while (x) { try { try {} catch { a } } catch {} }',
      expected: true,
    },
    { source: 'while (x) { try { for (a; y;) {} } catch {} }', expected: true },
    {
      source: 'while (x) { for (y of z) { try { a } catch {} } }',
      expected: true,
    },
    { source: 'while (x) { try {} catch { a } }', expected: false },
    { source: 'while (x) { try {} finally { a } }', expected: false },
    { source: 'try { while (x) { a } } catch {}', expected: false },
    { source: 'for (y of z) { try { a } catch {} }', expected: false },
    { source: 'while (x) { try { f(() => a) } catch {} }', expected: false },
    { source: 'try { a } catch {}', expected: false },
    { source: 'for (; x; a) {}', expected: false },
  ])(
    'tells whether an error at a may be caught in a loop in $source',
    ({ expected, source }) => {
      let { find, tree } = createTestFile(source)

      expect(isCaughtInLoop(tree, find('Identifier', 'a'))).toBe(expected)
    },
  )

  it('returns false for the program', () => {
    let { find, tree } = createTestFile('while (x) { try { a } catch {} }')

    expect(isCaughtInLoop(tree, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a')
    let other = createTestFile('a')

    expect(() => isCaughtInLoop(tree, other.find('Identifier', 'a'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
