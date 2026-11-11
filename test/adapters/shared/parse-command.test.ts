import { describe, expect, it } from 'vitest'

import { parseCommand } from '../../../adapters/shared/parse-command'

describe('parseCommand', () => {
  it('splits commands at shell operators and words at whitespace', () => {
    expect(parseCommand('a b  c && d || e; f | g & h\ni\t j')).toStrictEqual([
      ['a', 'b', 'c'],
      ['d'],
      ['e'],
      ['f'],
      ['g'],
      ['h'],
      ['i', 'j'],
    ])
  })

  it('removes quotes and honours escapes', () => {
    expect(
      parseCommand(String.raw`node --test 'a b/**/*.js' "c \"d\" \$e \x" f\ g h\
i "" \$HOME`),
    ).toStrictEqual([
      [
        'node',
        '--test',
        'a b/**/*.js',
        String.raw`c "d" $e \x`,
        'f g',
        'hi',
        '',
        '$HOME',
      ],
    ])
  })

  it('marks a $ and a backtick the shell keeps as written, for a caller that expands them', () => {
    expect(
      parseCommand(
        'a \'$b\' \\$c "\\$d" "$e" $f \'`g\' "\\`h" "i$"j $\'k\' $"l"',
        '+',
      ),
    ).toStrictEqual([
      [
        'a',
        '+$b',
        '+$c',
        '+$d',
        '$e',
        '$f',
        '+`g',
        '+`h',
        'i+$j',
        '+$k',
        '+$l',
      ],
    ])
  })

  it('keeps operators inside quotes and ignores empty commands', () => {
    expect(parseCommand(`;; echo 'a && b' "c;d"`)).toStrictEqual([
      ['echo', 'a && b', 'c;d'],
    ])
    expect(parseCommand('trailing\\')).toStrictEqual([['trailing\\']])
    expect(parseCommand('')).toStrictEqual([])
  })
})
