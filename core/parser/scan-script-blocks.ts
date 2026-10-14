import type { ComponentFramework } from '../../types/component-framework'
import type { ScriptBlock } from '../../types/script-block'

/**
 * Opening or closing tag read from the markup.
 */
interface Tag {
  /**
   * Values by lowercased attribute name; an attribute without a value has an
   * empty one, and the first of repeated attributes wins.
   */
  attributes: Map<string, string>

  /**
   * Whether the tag ends with `/>`.
   */
  selfClosing: boolean

  /**
   * Lowercased tag name.
   */
  name: string

  /**
   * Offset just past the `>` of the tag, or the end of the text.
   */
  end: number
}

/**
 * Markup scan in progress.
 */
interface MarkupScan {
  /**
   * Framework whose markup rules apply.
   */
  framework: ComponentFramework

  /**
   * Blocks found so far.
   */
  blocks: ScriptBlock[]

  /**
   * Names of the open elements, outermost first; `#` stands for an open Svelte
   * block such as `{#if}`.
   */
  open: string[]

  /**
   * Text of the file.
   */
  source: string
}

/**
 * Values of the `type` attribute of a script that holds JavaScript or
 * TypeScript, lowercased.
 */
let scriptTypes = new Set([
  'application/typescript',
  'application/javascript',
  'application/ecmascript',
  'text/typescript',
  'text/javascript',
  'text/ecmascript',
  'module',
  'ts',
  '',
])

/**
 * Values of the `type` attribute, lowercased, that mark a script without a
 * `lang` attribute as TypeScript, as svelte-preprocess reads them.
 */
let typescriptTypes = new Set([
  'application/typescript',
  'text/typescript',
  'ts',
])

/**
 * Parser languages by lowercased value of the `lang` attribute.
 */
let languages = new Map<string, ScriptBlock['lang']>([
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['tsx', 'tsx'],
  ['jsx', 'jsx'],
  ['js', 'js'],
  ['ts', 'ts'],
  ['', 'js'],
])

/**
 * Elements that never have content or a closing tag.
 */
let voidElements = new Set([
  'source',
  'track',
  'embed',
  'input',
  'param',
  'area',
  'base',
  'link',
  'meta',
  'col',
  'img',
  'wbr',
  'br',
  'hr',
])

/**
 * Opening tags that close an open element of a name, by that name: HTML lets
 * authors omit the closing tag of these elements before them, and the Svelte
 * parser closes the innermost open element this way.
 */
let impliedClosings = new Map([
  [
    'p',
    new Set([
      'blockquote',
      'fieldset',
      'address',
      'article',
      'section',
      'footer',
      'header',
      'hgroup',
      'aside',
      'table',
      'main',
      'menu',
      'form',
      'div',
      'nav',
      'pre',
      'dl',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'ol',
      'ul',
      'p',
    ]),
  ],
  ['option', new Set(['optgroup', 'option'])],
  ['tbody', new Set(['tbody', 'tfoot'])],
  ['thead', new Set(['tbody', 'tfoot'])],
  ['optgroup', new Set(['optgroup'])],
  ['td', new Set(['td', 'th', 'tr'])],
  ['th', new Set(['td', 'th', 'tr'])],
  ['tr', new Set(['tbody', 'tr'])],
  ['tfoot', new Set(['tbody'])],
  ['dd', new Set(['dd', 'dt'])],
  ['dt', new Set(['dd', 'dt'])],
  ['rp', new Set(['rp', 'rt'])],
  ['rt', new Set(['rp', 'rt'])],
  ['li', new Set(['li'])],
])

/**
 * Words after which a `/` in an expression starts a regular expression rather
 * than a division: JavaScript keywords that take an operand and the Svelte
 * block and tag keywords.
 */
let regexKeywords = new Set([
  'instanceof',
  'typeof',
  'render',
  'delete',
  'return',
  'await',
  'throw',
  'yield',
  'each',
  'else',
  'case',
  'html',
  'void',
  'key',
  'new',
  'if',
  'in',
  'of',
  'do',
])

/**
 * Characters after which a `/` in an expression starts a regular expression
 * rather than a division.
 */
let regexPunctuators = new Set('!%&(*+,-:;<=>?[^{|~')

/**
 * Characters that end a line of JavaScript.
 */
let lineTerminators = new Set(['\u{2028}', '\u{2029}', '\n', '\r'])

/**
 * Characters that separate attributes in a tag.
 */
let whitespace = new Set(['\t', '\n', '\f', '\r', ' '])

/**
 * Opening fence of an Astro frontmatter: `---` alone on the first line that is
 * not blank.
 */
const FRONTMATTER_OPENING_PATTERN = /^\s*---[\t ]*(?:\r\n?|\n)/u

/**
 * Closing fence of an Astro frontmatter: `---` alone on a line.
 */
const FRONTMATTER_CLOSING_PATTERN = /^---[\t ]*$/mu

/**
 * Character of an identifier, keyword or number.
 */
const WORD_CHARACTER_PATTERN = /[\w$]/u

/**
 * Letter that may start a tag name.
 */
const TAG_START_PATTERN = /[a-z]/iu

/**
 * Finds the script blocks of a Vue, Svelte or Astro component with a small
 * scanner of the markup, without a framework compiler. Vue and Svelte blocks
 * are the `<script>` elements at the top level of the markup, Astro blocks are
 * the frontmatter between the leading `---` lines, which is TypeScript, and
 * every `<script>` element. A script with a `src` attribute, a `type` that is
 * not JavaScript or TypeScript, or an unknown `lang` is skipped, and so is
 * markup inside HTML comments. A script ends at the first `</script`, in any
 * letter case, as in HTML. Vue interpolations, Svelte expressions and
 * expression attributes are skipped, so a tag inside one of their strings does
 * not count.
 *
 * @param source - Text of the component file.
 * @param framework - Framework of the file.
 * @returns Blocks in source order.
 */
export function scanScriptBlocks(
  source: string,
  framework: ComponentFramework,
): ScriptBlock[] {
  let scan: MarkupScan = { blocks: [], framework, open: [], source }
  let offset = 0
  if (framework === 'astro') {
    offset = scanFrontmatter(scan)
  }
  while (offset < source.length) {
    offset = scanMarkupAt(scan, offset)
  }
  return scan.blocks
}

/**
 * Reads one attribute and its value, if any.
 *
 * @param scan - Scan in progress.
 * @param nameStart - Offset of the first character of the attribute name.
 * @param attributes - Attributes of the tag, which the attribute joins unless
 *   the tag already has one of the same name.
 * @returns Offset past the attribute.
 */
function readAttribute(
  scan: MarkupScan,
  nameStart: number,
  attributes: Map<string, string>,
): number {
  let { framework, source } = scan
  let nameEnd = readName(source, nameStart + 1)
  let name = source.slice(nameStart, nameEnd).toLowerCase()
  let offset = skipWhitespace(source, nameEnd)
  let value = ''
  if (source[offset] === '=') {
    let valueStart = skipWhitespace(source, offset + 1)
    let quote = source[valueStart]
    if (quote === '"' || quote === "'") {
      offset = skipPast(source, quote, valueStart + 1)
      value = source.slice(valueStart + 1, offset - 1)
    } else if (quote === '{' && framework !== 'vue') {
      offset = skipExpression(source, valueStart)
      value = source.slice(valueStart, offset)
    } else {
      offset = valueStart
      while (
        offset < source.length &&
        source[offset] !== '>' &&
        !whitespace.has(source[offset]!)
      ) {
        offset++
      }
      value = source.slice(valueStart, offset)
    }
  } else {
    offset = nameEnd
  }
  if (!attributes.has(name)) {
    attributes.set(name, value)
  }
  return offset
}

/**
 * Skips a JavaScript expression in braces, with nested braces, strings,
 * template literals, regular expressions and comments. A `/` right after the
 * opening brace closes a Svelte block, as in `{/if}`, so it is not read as a
 * regular expression.
 *
 * @param source - Text of the file.
 * @param offset - Offset of the opening brace.
 * @returns Offset just past the matching closing brace, or the end of the text
 *   without one.
 */
function skipExpression(source: string, offset: number): number {
  let depth = 0
  let index = offset
  while (index < source.length) {
    let character = source[index]
    if (character === '"' || character === "'") {
      index = skipString(source, index)
    } else if (character === '`') {
      index = skipTemplate(source, index)
    } else if (source.startsWith('/*', index)) {
      index = skipPast(source, '*/', index + 2)
    } else if (source.startsWith('//', index)) {
      index = skipPast(source, '\n', index + 2)
    } else if (
      character === '/' &&
      index > offset + 1 &&
      isRegexStart(source, index)
    ) {
      index = skipRegex(source, index)
    } else {
      if (character === '{') {
        depth++
      } else if (character === '}') {
        depth--
        if (depth === 0) {
          return index + 1
        }
      }
      index++
    }
  }
  return source.length
}

/**
 * Scans the markup at one offset: skips a comment, an expression or a tag with
 * its raw content, or a single character of text.
 *
 * @param scan - Scan in progress.
 * @param offset - Offset to scan at.
 * @returns Offset to continue at, past the offset.
 */
function scanMarkupAt(scan: MarkupScan, offset: number): number {
  let { framework, source } = scan
  if (source.startsWith('<!--', offset)) {
    return skipPast(source, '-->', offset + 4)
  }
  if (source.startsWith('</', offset) && isTagStart(source, offset + 2)) {
    let tag = readTag(scan, offset + 2)
    closeElement(scan.open, tag.name)
    return tag.end
  }
  if (source[offset] === '<' && isTagStart(source, offset + 1)) {
    return scanElement(scan, readTag(scan, offset + 1))
  }
  if (framework === 'vue' && source.startsWith('{{', offset)) {
    return skipPast(source, '}}', offset + 2)
  }
  if (framework === 'svelte' && source[offset] === '{') {
    let marker = source[offset + 1]
    if (marker === '#') {
      scan.open.push('#')
    } else if (marker === '/') {
      closeElement(scan.open, '#')
    }
    return skipExpression(source, offset)
  }
  return offset + 1
}

/**
 * Handles an opening tag: closes the innermost open element when the tag
 * implies its closing tag, records a script block, skips the raw content of a
 * script, a style or a Vue custom block, and tracks the open elements.
 *
 * @param scan - Scan in progress.
 * @param tag - Opening tag just read.
 * @returns Offset past the tag, or past the closing tag of raw content.
 */
function scanElement(scan: MarkupScan, tag: Tag): number {
  let { framework, source, open } = scan
  if (impliedClosings.get(open.at(-1)!)?.has(tag.name)) {
    open.pop()
  }
  if (tag.selfClosing) {
    return tag.end
  }
  if (tag.name === 'script') {
    let end = findClosingTag(source, 'script', tag.end)
    let lang = getScriptLanguage(tag.attributes, framework)
    if (lang !== null && (framework === 'astro' || open.length === 0)) {
      scan.blocks.push({ frontmatter: false, start: tag.end, lang, end })
    }
    return skipPast(source, '>', end)
  }
  if (
    tag.name === 'style' ||
    (framework === 'vue' && open.length === 0 && tag.name !== 'template')
  ) {
    return skipPast(source, '>', findClosingTag(source, tag.name, tag.end))
  }
  if (!voidElements.has(tag.name)) {
    open.push(tag.name)
  }
  return tag.end
}

/**
 * Reads a tag from its name to its `>`. Quoted attribute values, and in Svelte
 * and Astro expression values and spreads in braces, may contain `>`.
 *
 * @param scan - Scan in progress.
 * @param nameStart - Offset of the first letter of the tag name.
 * @returns The tag; an unterminated tag ends at the end of the text.
 */
function readTag(scan: MarkupScan, nameStart: number): Tag {
  let { framework, source } = scan
  let offset = readName(source, nameStart)
  let tag: Tag = {
    name: source.slice(nameStart, offset).toLowerCase(),
    attributes: new Map(),
    end: source.length,
    selfClosing: false,
  }
  while (offset < source.length) {
    let character = source[offset]!
    if (character === '>') {
      tag.end = offset + 1
      return tag
    }
    if (source.startsWith('/>', offset)) {
      tag.end = offset + 2
      tag.selfClosing = true
      return tag
    }
    if (character === '/' || whitespace.has(character)) {
      offset++
    } else if (character === '{' && framework !== 'vue') {
      offset = skipExpression(source, offset)
    } else {
      offset = readAttribute(scan, offset, tag.attributes)
    }
  }
  return tag
}

/**
 * Picks the parser language of a script from its attributes.
 *
 * @param attributes - Attributes of the `<script>` tag.
 * @param framework - Framework of the file.
 * @returns Language of the script, or null when it is external or not
 *   JavaScript or TypeScript. Without `lang` a script with a TypeScript `type`
 *   is TypeScript and any other is JavaScript, except an Astro script without
 *   any attribute, which Astro processes as TypeScript.
 */
function getScriptLanguage(
  attributes: Map<string, string>,
  framework: ComponentFramework,
): ScriptBlock['lang'] | null {
  let type = attributes.get('type')?.trim().toLowerCase()
  if (attributes.has('src') || (type !== undefined && !scriptTypes.has(type))) {
    return null
  }
  let lang = attributes.get('lang')
  if (lang !== undefined) {
    return languages.get(lang.trim().toLowerCase()) ?? null
  }
  if (type !== undefined && typescriptTypes.has(type)) {
    return 'ts'
  }
  return framework === 'astro' && attributes.size === 0 ? 'ts' : 'js'
}

/**
 * Skips a regular expression literal with its character classes. A regular
 * expression cannot span lines, so a `/` without a closing one on its line is a
 * division.
 *
 * @param source - Text of the file.
 * @param offset - Offset of the opening `/`.
 * @returns Offset just past the closing `/`, or past the opening one when the
 *   line has no closing one.
 */
function skipRegex(source: string, offset: number): number {
  let inClass = false
  let index = offset + 1
  while (index < source.length) {
    let character = source[index]!
    if (character === '\\') {
      index += 2
    } else if (lineTerminators.has(character)) {
      break
    } else if (character === '/' && !inClass) {
      return index + 1
    } else {
      if (character === '[') {
        inClass = true
      } else if (character === ']') {
        inClass = false
      }
      index++
    }
  }
  return offset + 1
}

/**
 * Adds the frontmatter of an Astro file to the blocks.
 *
 * @param scan - Scan of an Astro file.
 * @returns Offset where the markup starts: past the closing fence, or 0 when
 *   the file has no frontmatter.
 */
function scanFrontmatter(scan: MarkupScan): number {
  let opening = FRONTMATTER_OPENING_PATTERN.exec(scan.source)
  if (!opening) {
    return 0
  }
  let start = opening[0].length
  let closing = FRONTMATTER_CLOSING_PATTERN.exec(scan.source.slice(start))
  if (!closing) {
    return 0
  }
  let end = start + closing.index
  scan.blocks.push({ frontmatter: true, lang: 'ts', start, end })
  return end + closing[0].length
}

/**
 * Skips a template literal with its substitutions.
 *
 * @param source - Text of the file.
 * @param offset - Offset of the opening backtick.
 * @returns Offset just past the closing backtick, or the end of the text
 *   without one.
 */
function skipTemplate(source: string, offset: number): number {
  let index = offset + 1
  while (index < source.length) {
    let character = source[index]
    if (character === '\\') {
      index += 2
    } else if (character === '`') {
      return index + 1
    } else if (source.startsWith('${', index)) {
      index = skipExpression(source, index + 1)
    } else {
      index++
    }
  }
  return source.length
}

/**
 * Tells whether a `/` in an expression starts a regular expression, from the
 * code before it: a punctuator or a keyword that takes an operand.
 *
 * @param source - Text of the file.
 * @param offset - Offset of the `/`, past the opening brace of the expression.
 * @returns Whether a regular expression may start there.
 */
function isRegexStart(source: string, offset: number): boolean {
  let end = offset
  while (whitespace.has(source[end - 1]!)) {
    end--
  }
  let start = end
  while (WORD_CHARACTER_PATTERN.test(source[start - 1]!)) {
    start--
  }
  if (start < end) {
    return regexKeywords.has(source.slice(start, end))
  }
  return regexPunctuators.has(source[end - 1]!)
}

/**
 * Skips a quoted string literal.
 *
 * @param source - Text of the file.
 * @param offset - Offset of the opening quote.
 * @returns Offset just past the closing quote, or the end of the text without
 *   one.
 */
function skipString(source: string, offset: number): number {
  let quote = source[offset]
  let index = offset + 1
  while (index < source.length) {
    let character = source[index]
    if (character === '\\') {
      index += 2
    } else if (character === quote) {
      return index + 1
    } else {
      index++
    }
  }
  return source.length
}

/**
 * Finds the closing tag of raw content: the first `</` followed by the element
 * name in any letter case.
 *
 * @param source - Text of the file.
 * @param name - Lowercased element name.
 * @param offset - Offset where the content starts.
 * @returns Offset of the closing tag, or the end of the text without one.
 */
function findClosingTag(source: string, name: string, offset: number): number {
  let index = source.indexOf('</', offset)
  while (index !== -1) {
    if (
      source.slice(index + 2, index + 2 + name.length).toLowerCase() === name
    ) {
      return index
    }
    index = source.indexOf('</', index + 2)
  }
  return source.length
}

/**
 * Skips past the next occurrence of a text.
 *
 * @param source - Text of the file.
 * @param text - Text to find.
 * @param offset - Offset to search from.
 * @returns Offset just past the occurrence, or the end of the text without one.
 */
function skipPast(source: string, text: string, offset: number): number {
  let index = source.indexOf(text, offset)
  return index === -1 ? source.length : index + text.length
}

/**
 * Skips whitespace.
 *
 * @param source - Text of the file.
 * @param offset - Offset to start at.
 * @returns Offset of the first character that is not whitespace.
 */
function skipWhitespace(source: string, offset: number): number {
  let end = offset
  while (end < source.length && whitespace.has(source[end]!)) {
    end++
  }
  return end
}

/**
 * Tells whether a character ends a tag or attribute name.
 *
 * @param character - Character to check.
 * @returns Whether it is whitespace, `/`, `>` or `=`.
 */
function isNameEnd(character: string): boolean {
  return (
    whitespace.has(character) ||
    character === '/' ||
    character === '>' ||
    character === '='
  )
}

/**
 * Finds where a tag or attribute name ends.
 *
 * @param source - Text of the file.
 * @param offset - Offset inside the name.
 * @returns Offset of the first whitespace, `/`, `>` or `=` at or after the
 *   offset, or the end of the text.
 */
function readName(source: string, offset: number): number {
  let end = offset
  while (end < source.length && !isNameEnd(source[end]!)) {
    end++
  }
  return end
}

/**
 * Closes the innermost open element of a name and every element inside it,
 * whose closing tags HTML lets authors omit. A closing tag without an open
 * element of its name is ignored.
 *
 * @param open - Names of the open elements, outermost first.
 * @param name - Lowercased name of the closing tag, or `#` for a Svelte block.
 */
function closeElement(open: string[], name: string): void {
  let index = open.lastIndexOf(name)
  if (index !== -1) {
    open.length = index
  }
}

/**
 * Tells whether a tag name starts at an offset.
 *
 * @param source - Text of the file.
 * @param offset - Offset after `<` or `</`.
 * @returns Whether an ASCII letter is there.
 */
function isTagStart(source: string, offset: number): boolean {
  return TAG_START_PATTERN.test(source[offset] ?? '')
}
