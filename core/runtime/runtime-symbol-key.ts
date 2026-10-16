/**
 * Key of the registered symbol under which `Math` holds the mutant runtime:
 * `Math[Symbol.for('mootant')]`. Vue templates reach the runtime there, since
 * the Vue compiler reads every other global name, `globalThis` included, as a
 * property of the component, but leaves `Math` and `Symbol` alone.
 */
export const RUNTIME_SYMBOL_KEY = 'mootant'
