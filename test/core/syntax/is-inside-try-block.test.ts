import { describe, expect, it } from 'vitest'

import { isInsideTryBlock } from '../../../core/syntax/is-inside-try-block'
import { createTestFile } from '../../helpers/create-test-file'

describe('isInsideTryBlock', () => {
  it.each([
    { source: 'try { a } catch {}', expected: true },
    { source: 'try { if (b) { f((a)) } } finally {}', expected: true },
    { source: 'try {} catch { a } finally {}', expected: true },
    { source: 'try {} catch (a) {} finally {}', expected: true },
    { source: 'try {} catch { a }', expected: false },
    { source: 'try {} finally { a }', expected: false },
    { source: 'try { x = () => a } catch {}', expected: false },
    { source: 'try { x = function () { a } } catch {}', expected: false },
    { source: 'try { function f() { a } } catch {}', expected: false },
    { source: 'try { class C { x = a } } catch {}', expected: false },
    { source: 'try { class C { static { a } } } catch {}', expected: false },
    {
      source: 'function f() { try { g(() => b) } catch {} a }',
      expected: false,
    },
    { expected: false, source: 'a' },
  ])(
    'tells whether a is inside a try block in $source',
    ({ expected, source }) => {
      let { find, tree } = createTestFile(source)

      expect(isInsideTryBlock(tree, find('Identifier', 'a'))).toBe(expected)
    },
  )

  it('returns false for the program', () => {
    let { find, tree } = createTestFile('try { a } catch {}')

    expect(isInsideTryBlock(tree, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a')
    let other = createTestFile('a')

    expect(() => isInsideTryBlock(tree, other.find('Identifier', 'a'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
