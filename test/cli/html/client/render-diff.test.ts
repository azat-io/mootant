import { describe, expect, it } from 'vitest'

import { getLineStarts } from '../../../../core/text/get-line-starts'
import { renderDiff } from '../../../../cli/html/client/render-diff'

describe('renderDiff', () => {
  it('shows the touched line before and after, without its indentation', () => {
    let source = 'let a = 1\n  if (a < b) {\n}\n'

    expect(
      renderDiff(source, getLineStarts(source), {
        replacement: 'a <= b',
        start: 16,
        end: 21,
      }),
    ).toBe(
      '<div class="removed"><span class="sign">-</span> if (<span class="changed">a &lt; b</span>) {</div><div class="added"><span class="sign">+</span> if (<span class="changed">a &lt;= b</span>) {</div>',
    )
  })

  it('puts a space where the replacement would merge with the text before it', () => {
    let source = 'return!flag\n'

    expect(
      renderDiff(source, getLineStarts(source), {
        replacement: 'true',
        start: 6,
        end: 11,
      }),
    ).toBe(
      '<div class="removed"><span class="sign">-</span> return<span class="changed">!flag</span></div><div class="added"><span class="sign">+</span> return<span class="changed"> true</span></div>',
    )
  })

  it('takes the indentation of the first line off every row', () => {
    let source = '    call(a,\n      b,\n  c)\n'

    expect(
      renderDiff(source, getLineStarts(source), {
        replacement: 'call()',
        start: 4,
        end: 25,
      }),
    ).toBe(
      '<div class="removed"><span class="sign">-</span> <span class="changed">call(a,</span></div><div class="removed"><span class="sign">-</span> <span class="changed">  b,</span></div><div class="removed"><span class="sign">-</span> <span class="changed">c)</span></div><div class="added"><span class="sign">+</span> <span class="changed">call()</span></div>',
    )
  })

  it('splits rows at every line terminator', () => {
    let source = 'a(1,\r  2)\u{2028}b\r'

    expect(
      renderDiff(source, getLineStarts(source), {
        replacement: 'a()',
        start: 0,
        end: 9,
      }),
    ).toBe(
      '<div class="removed"><span class="sign">-</span> <span class="changed">a(1,</span></div><div class="removed"><span class="sign">-</span> <span class="changed">  2)</span></div><div class="added"><span class="sign">+</span> <span class="changed">a()</span></div>',
    )
  })

  it('marks only the focus of the change', () => {
    let source = 'let r = /ab+c/u'

    expect(
      renderDiff(source, getLineStarts(source), {
        focus: { replacement: 'b', start: 10, end: 12 },
        replacement: '/abc/u',
        start: 8,
        end: 15,
      }),
    ).toBe(
      '<div class="removed"><span class="sign">-</span> let r = /a<span class="changed">b+</span>c/u</div><div class="added"><span class="sign">+</span> let r = /a<span class="changed">b</span>c/u</div>',
    )
  })

  it('marks the whole range when the replacement differs from its focus', () => {
    let source = 'x = a ^ b & c'

    expect(
      renderDiff(source, getLineStarts(source), {
        focus: { replacement: '|', start: 10, end: 11 },
        replacement: '(b | c)',
        start: 8,
        end: 13,
      }),
    ).toBe(
      '<div class="removed"><span class="sign">-</span> x = a ^ <span class="changed">b &amp; c</span></div><div class="added"><span class="sign">+</span> x = a ^ <span class="changed">(b | c)</span></div>',
    )
  })

  it('cuts long lines around the change and long removals', () => {
    let head = `call(${'x'.repeat(40)}, `
    let tail = `, ${'y'.repeat(50)})`
    let source = `${head}value${tail}\n${Array.from({ length: 10 }, (_, line) => `line${line}`).join('\n')}\n`
    let lines = getLineStarts(source)

    expect(
      renderDiff(source, lines, {
        end: head.length + 5,
        start: head.length,
        replacement: '',
      }),
    ).toBe(
      `<div class="removed"><span class="sign">-</span> …${'x'.repeat(27)}, <span class="changed">value</span>, ${'y'.repeat(37)}…</div><div class="added"><span class="sign">+</span> …${'x'.repeat(27)}, , ${'y'.repeat(37)}…</div>`,
    )
    let block = renderDiff(source, lines, {
      end: source.length - 1,
      start: lines[1]!,
      replacement: '',
    })

    expect(block).toContain('<span class="cut">… 3 more lines</span>')
    expect(block.match(/class="removed"/gu)).toHaveLength(8)
    expect(block).toContain('<span class="changed">line9</span>')
  })
})
