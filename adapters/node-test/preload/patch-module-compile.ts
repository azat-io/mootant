import type { SourceSwitcher } from '../types/source-switcher'

/**
 * `Module.prototype._compile`, which compiles and runs the text of a CommonJS
 * module.
 */
type Compile = (
  this: unknown,
  ...parameters: [content: string, filename: string, ...rest: unknown[]]
) => unknown

/**
 * Patches `Module.prototype._compile`, through which every CommonJS module
 * runs, so it reports the file and runs the text the switcher gives. Module
 * hooks do not see every such module: `module.register()` hooks never see
 * `require()`, and a loader such as tsx reads a CommonJS file again after the
 * hooks served it, so the switched text would be lost.
 *
 * @param prototype - `Module.prototype` of `node:module`.
 * @param switcher - Switcher of module texts.
 * @param record - Receives the absolute path of every module compiled.
 */
export function patchModuleCompile(
  prototype: object,
  switcher: SourceSwitcher,
  record: (file: string) => void,
): void {
  let compile = Reflect.get(prototype, '_compile') as Compile
  /**
   * Compiles a module with the text the switcher gives.
   *
   * @param parameters - Text, path and the rest of Node's arguments.
   * @returns What Node's `_compile` returns.
   */
  function patched(this: unknown, ...parameters: Parameters<Compile>): unknown {
    let [content, filename, ...rest] = parameters
    record(filename)
    let text =
      switcher.has(filename) ? switcher.switch(filename, content) : null
    return compile.call(this, text ?? content, filename, ...rest)
  }
  Reflect.set(prototype, '_compile', patched)
}
