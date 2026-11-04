import { vitestAdapter } from 'mootant/vitest'

import { traceAdapter } from '../../tools/trace-adapter.js'

export default {
  run: {
    runner: traceAdapter(vitestAdapter(), process.env.TRACE_DIR),
    paths: ['src'],
    cache: false,
  },
}
