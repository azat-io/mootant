/**
 * The oracle of the list acceptance test (architecture 13.5). It reads the
 * hand-written expectations.json next to it and the listed source files, adds
 * only the mechanical, spec-defined arithmetic (offsets, positions, source
 * lines before and after each mutant, canonical order, ids, descriptions,
 * counts) and writes the whole expected `--json --verbose` report once per
 * preset: expected-mutants.json for `recommended` and
 * expected-mutants-strict.json for `strict`.
 *
 * It never imports the implementation; which mutants exist is decided by the
 * expectations alone. Run it by hand from any directory, as `node
 * test/fixtures/list/derive-expected-mutants.mjs`.
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

/**
 * Directory of this script: test/fixtures/list.
 */
const FIXTURE_DIRECTORY = import.meta.dirname

/**
 * Repository root, the working directory of the acceptance run, against which
 * the display paths of the expectations resolve.
 */
const ROOT_DIRECTORY = path.resolve(FIXTURE_DIRECTORY, '../../..')

/**
 * Output file of each preset, in the order the oracle runs them.
 */
const OUTPUT_FILES = {
  recommended: 'expected-mutants.json',
  strict: 'expected-mutants-strict.json',
}

/**
 * Exact `meta.description` of every core mutator, copied from the catalog
 * (sections 0.1 and 4).
 */
const DESCRIPTIONS = {
  'arithmetic-operator':
    'Swaps an arithmetic operator, or drops the right operand of a + that is not known to be numeric.',
  'array-element':
    'Removes one element from an array literal, or puts undefined into an empty one.',
  'assignment-operator':
    'Swaps a compound assignment operator, or makes a logical assignment unconditional, never happen, or swapped between ?? and ||.',
  'bitwise-operator':
    'Swaps a bitwise or shift operator, or drops a | 0 truncation.',
  'boolean-literal': 'Inverts a boolean literal.',
  'comparison-operator':
    "Moves a comparison's boundary or literal, flips its direction, or makes it constant: the minimal set that subsumes all other comparison mutants.",
  condition:
    'Forces a condition that is not a logical expression to true or false.',
  'logical-operator':
    'Drops one operand of &&, || or ??, swaps ?? and || where falsy values differ, or makes a whole condition constant.',
  'method-call':
    'Swaps a method with its opposite (startsWith/endsWith, min/max, ...) or removes a transforming call (trim, filter, sort, ...).',
  'missing-await': 'Removes an await, as if the promise was not awaited.',
  'number-literal': 'Adds one to a numeric constant.',
  'object-property': 'Removes one property or spread from an object literal.',
  'optional-chaining':
    'Replaces ?. with ., as if the value could never be nullish.',
  'regex-flag':
    'Removes a flag of a regular expression (i, m, s, or g where it picks all matches).',
  'regex-pattern':
    'Removes an anchor, assertion or alternative of a regular expression, makes an optional part required, or widens a class to any character.',
  'return-value':
    "Replaces a returned value with an empty default ('', 0, false and true, [] or undefined), or a promise of one.",
  'statement-removal':
    'Removes one statement with an effect: a call, assignment, delete, throw, early return or case break.',
  'string-literal':
    'Empties a string or the static text of a template literal, or fills an empty one.',
  'unary-operator': 'Removes a numeric unary operator (-x, +x, ~x).',
  'update-operator':
    'Swaps ++ and --, or prefix and postfix when the value is used.',
}

/**
 * The 20 core mutator ids, copied from the catalog (section 0.1).
 */
const CORE_MUTATOR_IDS = [
  'arithmetic-operator',
  'array-element',
  'assignment-operator',
  'bitwise-operator',
  'boolean-literal',
  'comparison-operator',
  'condition',
  'logical-operator',
  'method-call',
  'missing-await',
  'number-literal',
  'object-property',
  'optional-chaining',
  'regex-flag',
  'regex-pattern',
  'return-value',
  'statement-removal',
  'string-literal',
  'unary-operator',
  'update-operator',
]

/**
 * Active mutator ids of each built-in preset: both turn on every core mutator
 * (catalog 0.1 and 7.1).
 */
const PRESET_MUTATOR_IDS = {
  recommended: CORE_MUTATOR_IDS,
  strict: CORE_MUTATOR_IDS,
}

/**
 * Presets an expectation without a `presets` field belongs to (architecture
 * 13.4).
 */
const DEFAULT_PRESETS = ['recommended', 'strict']

/**
 * Tag hashed in front of every identity (architecture 9.2).
 */
const ID_TAG = 'mootant:mutant-id:v1'

/**
 * Number of base32 characters of an id (architecture 9.2).
 */
const ID_LENGTH = 12

/**
 * Base32 alphabet of ids: lowercase, without `i`, `l`, `o` and `u`
 * (architecture 9.2).
 */
const BASE32_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * Characters that end a line on their own; CRLF is handled before them.
 */
const LINE_TERMINATORS = new Set(['\u{2028}', '\u{2029}', '\n', '\r'])

/**
 * Directives that may credit an ignored mutant (architecture 10).
 */
const IGNORE_DIRECTIVES = new Set([
  'mootant-ignore-next-line',
  'mootant-ignore-start',
  'mootant-ignore-file',
])

/**
 * Compares two strings by UTF-16 code units, never by locale.
 *
 * @param {string} left - First string.
 * @param {string} right - Second string.
 * @returns {number} Negative, zero or positive, like a sort comparator.
 */
function compareCodeUnits(left, right) {
  if (left === right) {
    return 0
  }
  return left < right ? -1 : 1
}

/**
 * Compares two values that may be null, null first.
 *
 * @param {null | number | string} left - First value.
 * @param {null | number | string} right - Second value.
 * @returns {number} Negative, zero or positive, like a sort comparator.
 */
function compareNullable(left, right) {
  if (left === right) {
    return 0
  }
  if (left === null) {
    return -1
  }
  if (right === null) {
    return 1
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }
  return compareCodeUnits(String(left), String(right))
}

/**
 * Throws an error that names the expectation it is about.
 *
 * @param {object} expectation - Expectation that failed.
 * @param {string} message - What is wrong with it.
 * @returns {never} Never returns.
 * @throws {Error} Always.
 */
function fail(expectation, message) {
  throw new Error(`${message}\nExpectation: ${JSON.stringify(expectation)}`)
}

/**
 * Encodes bytes as base32, most significant bit first, 5 bits per character
 * (architecture 9.2).
 *
 * @param {Uint8Array} bytes - Bytes to encode.
 * @param {number} length - Number of characters to produce.
 * @returns {string} The first `length * 5` bits of the bytes as base32.
 */
function encodeBase32(bytes, length) {
  let text = ''
  for (let index = 0; index < length; index++) {
    let value = 0
    for (let bit = index * 5; bit < index * 5 + 5; bit++) {
      let byte = bytes[Math.floor(bit / 8)]
      value = value * 2 + ((byte >> (7 - (bit % 8))) & 1)
    }
    text += BASE32_ALPHABET[value]
  }
  return text
}

/**
 * Replaces CRLF and CR line breaks with LF in hashed text (architecture 9.2).
 *
 * @param {string} text - Text to normalize.
 * @returns {string} The text with LF line breaks only.
 */
function normalizeLineBreaks(text) {
  return text.replaceAll(/\r\n?/gu, '\n')
}

/**
 * Creates a mutant id from its identity (architecture 9.2).
 *
 * @param {object} identity - Texts the id hashes, and the occurrence.
 * @param {string} identity.path - Display path of the file.
 * @param {string} identity.scope - Dotted names of the enclosing declarations,
 *   empty without any.
 * @param {string} identity.mutator - Id of the mutator, such as
 *   `string-literal`.
 * @param {string} identity.original - Replaced text, LF line breaks.
 * @param {string} identity.replacement - Written text, LF line breaks.
 * @param {number} identity.occurrence - Earlier mutants of the same file with
 *   the same scope, mutator, original and replacement.
 * @returns {string} Twelve base32 characters.
 */
function createMutantId(identity) {
  let { replacement, occurrence, original, mutator, scope } = identity
  let input = JSON.stringify([
    ID_TAG,
    identity.path,
    scope,
    mutator,
    original,
    replacement,
    occurrence,
  ])
  let digest = createHash('sha256').update(input, 'utf8').digest()
  return encodeBase32(digest, ID_LENGTH)
}

/**
 * Computes the offsets at which lines start. LF, CR, CRLF, U+2028 and U+2029
 * end a line; the first line starts after a byte order mark.
 *
 * @param {string} text - Text of a file.
 * @returns {number[]} Start offset of every line.
 */
function getLineStarts(text) {
  let starts = [text.codePointAt(0) === 0xfe_ff ? 1 : 0]
  for (let index = 0; index < text.length; index++) {
    let character = text[index]
    if (character === '\r' && text[index + 1] === '\n') {
      index++
      starts.push(index + 1)
    } else if (LINE_TERMINATORS.has(character)) {
      starts.push(index + 1)
    }
  }
  return starts
}

/**
 * Converts an offset into a 1-based line and UTF-16 column. A byte order mark
 * is not counted.
 *
 * @param {number[]} lineStarts - Line starts of the file.
 * @param {number} offset - UTF-16 offset in the file as read.
 * @returns {{ line: number; column: number }} Position of the offset.
 */
function getPosition(lineStarts, offset) {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    let middle = Math.ceil((low + high) / 2)
    if (lineStarts[middle] <= offset) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return {
    column: Math.max(offset - lineStarts[low], 0) + 1,
    line: low + 1,
  }
}

/**
 * Returns the full text of a line without its line terminator.
 *
 * @param {string} text - Text of the file.
 * @param {number[]} lineStarts - Line starts of the file.
 * @param {number} line - 1-based line.
 * @returns {string} Text of the line.
 */
function getSourceLine(text, lineStarts, line) {
  let end = line < lineStarts.length ? lineStarts[line] : text.length
  return text
    .slice(lineStarts[line - 1], end)
    .replace(/(?:\r\n|[\n\r\u{2028}\u{2029}])$/u, '')
}

/**
 * Returns the lines from the line of a start offset to the line of an end
 * offset, as read and with the range replaced, without line terminators, the
 * unchanged text before and after the range cut to 80 code units, a cut moved
 * past a low surrogate so a surrogate pair stays whole.
 *
 * @param {{ text: string; lineStarts: number[] }} source - The source file.
 * @param {number} start - UTF-16 offset of the first replaced code unit.
 * @param {number} end - UTF-16 offset just past the last replaced code unit.
 * @param {string} replacement - Text written in place of the range.
 * @returns {{
 *   before: string[]
 *   after: string[]
 *   cutStart: number
 *   cutEnd: number
 * }}
 *   Lines before and after, and the code units cut from them.
 */
function getDiff(source, start, end, replacement) {
  let { lineStarts, text } = source
  let first = getPosition(lineStarts, start).line
  let last = getPosition(lineStarts, end).line
  let lineEnd =
    lineStarts[last - 1] + getSourceLine(text, lineStarts, last).length
  let from = lineStarts[first - 1]
  if (start - from > 80) {
    from = start - 80
    if (/[\uDC00-\uDFFF]/u.test(text[from])) {
      from += 1
    }
  }
  let to = lineEnd
  if (lineEnd - end > 80) {
    to = end + 80
    if (/[\uDC00-\uDFFF]/u.test(text[to])) {
      to += 1
    }
  }
  let lineBreak = /\r\n|[\n\r\u{2028}\u{2029}]/u
  return {
    before: text.slice(from, to).split(lineBreak),
    after: (text.slice(from, start) + replacement + text.slice(end, to)).split(
      lineBreak,
    ),
    cutStart: from - lineStarts[first - 1],
    cutEnd: lineEnd - to,
  }
}

/**
 * Finds the start of an expectation: the start of the `nth` match of its
 * original text whose start lies on its line. The text may span several lines.
 *
 * @param {object} expectation - Expectation to locate.
 * @param {{ text: string; lineStarts: number[] }} source - Its source file.
 * @returns {number} UTF-16 offset of the match.
 * @throws {Error} When the line or the match does not exist.
 */
function findStart(expectation, source) {
  let { original, line } = expectation
  let { lineStarts, text } = source
  let nth = expectation.nth ?? 0
  if (!Number.isSafeInteger(line) || line < 1 || line > lineStarts.length) {
    fail(expectation, `Line ${line} does not exist in ${expectation.file}.`)
  }
  if (typeof original !== 'string' || original === '') {
    fail(expectation, 'The original text must be a non-empty string.')
  }
  let lineStart = lineStarts[line - 1]
  let lineEnd = line < lineStarts.length ? lineStarts[line] : text.length
  let matches = []
  for (
    let index = text.indexOf(original, lineStart);
    index !== -1 && index < lineEnd;
    index = text.indexOf(original, index + 1)
  ) {
    matches.push(index)
  }
  if (!Number.isSafeInteger(nth) || nth < 0 || nth >= matches.length) {
    fail(
      expectation,
      `Match ${nth} of the original text is not on line ${line} of ${expectation.file} (${matches.length} found).`,
    )
  }
  return matches[nth]
}

/**
 * Checks the semantic fields of an expectation, so a typo fails loudly instead
 * of producing a wrong expected report.
 *
 * @param {object} expectation - Expectation to check.
 * @param {Set<string>} files - Display paths of the listed files.
 * @throws {Error} When a field is missing or invalid.
 */
function validateExpectation(expectation, files) {
  if (!files.has(expectation.file)) {
    fail(expectation, `The file ${expectation.file} is not listed in files.`)
  }
  if (!Object.hasOwn(DESCRIPTIONS, expectation.mutator)) {
    fail(expectation, `Unknown mutator ${expectation.mutator}.`)
  }
  if (typeof expectation.replacement !== 'string') {
    fail(expectation, 'The replacement must be a string.')
  }
  if (expectation.kind !== 'expression' && expectation.kind !== 'block') {
    fail(expectation, 'The kind must be expression or block.')
  }
  if (expectation.scope !== null && typeof expectation.scope !== 'string') {
    fail(expectation, 'The scope must be a string or null.')
  }
  let presets = expectation.presets ?? DEFAULT_PRESETS
  if (
    !Array.isArray(presets) ||
    presets.length === 0 ||
    presets.some(preset => !Object.hasOwn(OUTPUT_FILES, preset))
  ) {
    fail(expectation, 'The presets must name recommended or strict.')
  }
  if (
    expectation.occurrence !== undefined &&
    (!Number.isSafeInteger(expectation.occurrence) ||
      expectation.occurrence < 0)
  ) {
    fail(expectation, 'The occurrence must be a non-negative integer.')
  }
  validateStatus(expectation)
}

/**
 * Checks the status, reason and directive of an expectation.
 *
 * @param {object} expectation - Expectation to check.
 * @throws {Error} When they do not fit together.
 */
function validateStatus(expectation) {
  let { ignoredBy, status, reason } = expectation
  if (status === 'Pending') {
    if (reason !== null || ignoredBy !== null) {
      fail(expectation, 'A pending mutant has a null reason and ignoredBy.')
    }
    return
  }
  if (status !== 'Ignored') {
    fail(expectation, 'The status must be Pending or Ignored.')
  }
  if (typeof reason !== 'string' || reason === '') {
    fail(expectation, 'An ignored mutant has a reason.')
  }
  if (
    ignoredBy === null ||
    typeof ignoredBy !== 'object' ||
    !IGNORE_DIRECTIVES.has(ignoredBy.directive) ||
    !Number.isSafeInteger(ignoredBy.line) ||
    !Number.isSafeInteger(ignoredBy.column)
  ) {
    fail(expectation, 'An ignored mutant names its directive and position.')
  }
}

/**
 * Compares two located entries in canonical order: file, start ascending, end
 * descending, mutator rank, then the written order (architecture 8.5 and
 * 13.5).
 *
 * @param {object} left - First entry.
 * @param {object} right - Second entry.
 * @param {Map<string, number>} ranks - Rank of every active mutator id.
 * @returns {number} Negative, zero or positive, like a sort comparator.
 */
function compareEntries(left, right, ranks) {
  return (
    compareCodeUnits(left.file, right.file) ||
    left.start - right.start ||
    right.end - left.end ||
    ranks.get(left.mutator) - ranks.get(right.mutator) ||
    left.written - right.written
  )
}

/**
 * Compares two diagnostics like the report: file, line and column with null
 * first, then code and message (architecture 12.1).
 *
 * @param {object} left - First diagnostic.
 * @param {object} right - Second diagnostic.
 * @returns {number} Negative, zero or positive, like a sort comparator.
 */
function compareDiagnostics(left, right) {
  return (
    compareNullable(left.file, right.file) ||
    compareNullable(left.line, right.line) ||
    compareNullable(left.column, right.column) ||
    compareCodeUnits(left.code, right.code) ||
    compareCodeUnits(left.message, right.message)
  )
}

/**
 * Reads every listed source file and computes its line starts.
 *
 * @param {{ file: string }[]} files - Listed files with display paths.
 * @returns {Map<string, { text: string; lineStarts: number[] }>} Sources by
 *   display path.
 */
function readSources(files) {
  let sources = new Map()
  for (let { file } of files) {
    let text = readFileSync(path.resolve(ROOT_DIRECTORY, file), 'utf8')
    sources.set(file, { lineStarts: getLineStarts(text), text })
  }
  return sources
}

/**
 * Builds the expected report of one preset.
 *
 * @param {object} expectations - Contents of expectations.json.
 * @param {Map<string, { text: string; lineStarts: number[] }>} sources - Text
 *   and line starts of every listed file by display path.
 * @param {string} preset - Preset id.
 * @returns {object} The whole expected `--json --verbose` report.
 */
function buildReport(expectations, sources, preset) {
  let mutatorIds = PRESET_MUTATOR_IDS[preset].toSorted(compareCodeUnits)
  let ranks = new Map(mutatorIds.map((id, index) => [id, index]))

  let entries = []
  for (let [written, expectation] of expectations.mutants.entries()) {
    if (!(expectation.presets ?? DEFAULT_PRESETS).includes(preset)) {
      continue
    }
    if (!ranks.has(expectation.mutator)) {
      fail(expectation, `The mutator is not active in ${preset}.`)
    }
    let source = sources.get(expectation.file)
    let start = findStart(expectation, source)
    entries.push({
      end: start + expectation.original.length,
      file: expectation.file,
      mutator: expectation.mutator,
      expectation,
      written,
      source,
      start,
    })
  }
  entries = entries.toSorted((left, right) =>
    compareEntries(left, right, ranks),
  )

  let seen = new Map()
  let mutants = entries.map(entry => {
    let { expectation, source, start, file, end } = entry
    let original = normalizeLineBreaks(expectation.original)
    let replacement = normalizeLineBreaks(expectation.replacement)
    let scope = expectation.scope ?? ''
    let key = JSON.stringify([
      file,
      scope,
      expectation.mutator,
      original,
      replacement,
    ])
    let occurrence = expectation.occurrence ?? seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    let position = getPosition(source.lineStarts, start)
    let endPosition = getPosition(source.lineStarts, end)
    return {
      id: createMutantId({
        mutator: expectation.mutator,
        path: file,
        replacement,
        occurrence,
        original,
        scope,
      }),
      mutator: expectation.mutator,
      file,
      line: position.line,
      column: position.column,
      endLine: endPosition.line,
      endColumn: endPosition.column,
      start,
      end,
      scope: expectation.scope,
      kind: expectation.kind,
      original: source.text.slice(start, end),
      replacement: expectation.replacement,
      ...getDiff(source, start, end, expectation.replacement),
      status: expectation.status,
      reason: expectation.reason,
      ignoredBy:
        expectation.ignoredBy === null ?
          null
        : {
            directive: expectation.ignoredBy.directive,
            line: expectation.ignoredBy.line,
            column: expectation.ignoredBy.column,
          },
    }
  })

  let diagnostics = expectations.diagnostics
    .map(diagnostic => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      file: diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
      message: diagnostic.message,
    }))
    .toSorted(compareDiagnostics)

  return {
    schemaVersion: 3,
    command: 'list',
    preset,
    since: null,
    summary: {
      totalFiles: expectations.files.length,
      totalMutants: mutants.length,
      totalPending: mutants.filter(mutant => mutant.status === 'Pending')
        .length,
      totalIgnored: mutants.filter(mutant => mutant.status === 'Ignored')
        .length,
      totalErrors: diagnostics.filter(
        diagnostic => diagnostic.severity === 'error',
      ).length,
      totalWarnings: diagnostics.filter(
        diagnostic => diagnostic.severity === 'warning',
      ).length,
    },
    mutators: mutatorIds.map(id => ({
      id,
      description: DESCRIPTIONS[id],
      mutants: mutants.filter(mutant => mutant.mutator === id).length,
    })),
    files: expectations.files.map(({ parsed, file }) => ({
      file,
      parsed,
      mutants: mutants.filter(mutant => mutant.file === file).length,
    })),
    diagnostics,
    mutants,
  }
}

/**
 * Derives and writes the expected report of both presets.
 */
function main() {
  let expectations = JSON.parse(
    readFileSync(path.join(FIXTURE_DIRECTORY, 'expectations.json'), 'utf8'),
  )
  let files = new Set(expectations.files.map(({ file }) => file))
  for (let expectation of expectations.mutants) {
    validateExpectation(expectation, files)
  }
  let sources = readSources(expectations.files)
  for (let [preset, output] of Object.entries(OUTPUT_FILES)) {
    let report = buildReport(expectations, sources, preset)
    writeFileSync(
      path.join(FIXTURE_DIRECTORY, output),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    console.info(
      `${output}: ${report.summary.totalMutants} mutants (${report.summary.totalPending} pending, ${report.summary.totalIgnored} ignored)`,
    )
  }
}

main()
