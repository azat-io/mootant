import { describe, expect, it } from 'vitest'

import { createCommentProgram } from '../../../core/parser/create-comment-program'

describe('createCommentProgram', () => {
  it('builds an empty program over the blanked text of the file', () => {
    let { handlers, parsed, hosts } = createCommentProgram({
      source: '<p>a</p>\r\n<i />',
      file: 'a.svelte',
      lang: 'js',
    })

    expect(parsed).toMatchObject({
      text: `${' '.repeat(8)}\r\n${' '.repeat(5)}`,
      language: 'javascript',
      sourceType: 'module',
      lineStarts: [0, 10],
      file: 'a.svelte',
      comments: [],
    })
    expect(parsed.program.body).toStrictEqual([])
    expect(hosts).toStrictEqual(new Set([parsed.program]))
    expect(handlers).toStrictEqual(new Set())
  })
})
