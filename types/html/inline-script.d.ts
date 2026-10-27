/// <reference types="vite/client" />

/**
 * Bundled code of a browser module, imported with `?inline-script`.
 */
declare module '*?inline-script' {
  let script: string
  export default script
}
