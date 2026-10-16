/**
 * Tells which file a module id loads as written, so the plugin may switch its
 * text: the id itself when it has no query, or the path of an external script
 * of a Vue component, `<script src="./a.ts">`, which `@vitejs/plugin-vue` loads
 * as `a.ts?vue&type=script&src=true` with the text of the file. Virtual modules
 * and other ids with a query, such as `?raw` or the compiled script of a
 * component, are not switchable.
 *
 * @param id - Module id the transform hook received.
 * @returns Path of the file the id loads as written, or null.
 */
export function getSwitchablePath(id: string): string | null {
  if (id.startsWith('\0')) {
    return null
  }
  let separator = id.indexOf('?')
  if (separator === -1) {
    return id
  }
  let query = new URLSearchParams(id.slice(separator + 1))
  if (query.has('vue') && query.get('type') === 'script' && query.has('src')) {
    return id.slice(0, separator)
  }
  return null
}
