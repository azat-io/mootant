import { describe, expect, it } from 'vitest'

import { listScriptDefines } from '../../../adapters/vitest/list-script-defines'

describe('listScriptDefines', () => {
  it('lists the defines each project runs as a script, with whether each value is code, those of environment variables only as code', () => {
    let vitest = {
      projects: [
        {
          config: {
            _scriptDefines: {
              'import.meta.env.MODE': 'process.env.MOOTANT_MODE',
              'process.env.API': 'process.env.MOOTANT_API',
              'process.env.NAME': JSON.stringify('name'),
              'import.meta.flag': 'globalThis.flag',
              'app.version': JSON.stringify('1'),
              __FLAG__: 'process.env.FLAG',
              'app.count': 2,
            },
          },
          name: 'web',
        },
        { config: {}, name: '' },
      ],
    }

    expect(listScriptDefines(vitest as never)).toStrictEqual({
      web: {
        'import.meta.env.MODE': true,
        'import.meta.flag': true,
        'process.env.API': true,
        'app.version': false,
        'app.count': false,
        __FLAG__: true,
      },
      '': {},
    })
  })
})
