import { describe, expect, it } from 'vitest'

import { readNodeOptions } from '../../../adapters/shared/read-node-options'

describe('readNodeOptions', () => {
  it('splits words at spaces outside double quotes and drops the quotes', () => {
    expect(readNodeOptions('')).toStrictEqual([])
    expect(readNodeOptions('  --import  tsx ')).toStrictEqual([
      '--import',
      'tsx',
    ])
    expect(
      readNodeOptions('"--require" ./a.cjs --imp"ort"=./my_b.mjs --title ""'),
    ).toStrictEqual(['--require', './a.cjs', '--import=./my_b.mjs', '--title'])
    expect(readNodeOptions('--require "./my setup.cjs"')).toStrictEqual([
      '--require',
      './my setup.cjs',
    ])
  })

  it('keeps the character after a backslash inside quotes, and tabs in words', () => {
    expect(
      readNodeOptions(String.raw`"--insp\ect=0" "a\"b" "\"c" d\e`),
    ).toStrictEqual(['--inspect=0', 'a"b', '"c', String.raw`d\e`])
    expect(readNodeOptions('--title=a\t--import=./x.mjs')).toStrictEqual([
      '--title=a\t--import=./x.mjs',
    ])
  })
})
