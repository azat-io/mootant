// I1 + structural audit of mootant's mutant switching on a corpus.
//
// Usage:
//   node --experimental-vm-modules i1-check.mjs <project-root> <out.json> <path>... \
//        [--bin <mootant bin>] [--preset strict]
//
// For every file with pending mutants:
//   1. builds the switched text with mootant's own instrumentFile (dist),
//   2. parses it with oxc (same options as mootant) - must have no errors,
//   3. strips types with vite's transformWithOxc and compiles the result with V8
//      (vm.SourceTextModule / vm.Script) - must compile,
//   4. checks every mutant id has exactly one site,
//   5. parses every physically applied mutant (raw replacement) - report only,
//   6. audits the syntactic context of every mutant in the original AST:
//      contexts where a conditional expression or a block would change meaning
//      (this-callee, delete/typeof operand, write target, short-circuit chain
//      element, NamedEvaluation, directive, super() statement, labeled body...).
// Prints a summary and writes all findings to <out.json>.

import { writeFileSync } from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'

import {
  parserOptions,
  listMutants,
  groupByFile,
  importDist,
  MOOTANT_ROOT,
  loadVite,
  applyRaw,
  read,
  oxc,
} from './lib.mjs'

let argv = process.argv.slice(2)
let flags = new Map()
let positional = []
for (let index = 0; index < argv.length; index++) {
  if (argv[index].startsWith('--')) {
    flags.set(argv[index].slice(2), argv[index + 1])
    index++
  } else {
    positional.push(argv[index])
  }
}
let [root, out, ...paths] = positional
let bin = flags.get('bin') ?? path.join(MOOTANT_ROOT, 'bin/mootant.js')
let preset = flags.get('preset') ?? 'strict'
let rawCheck = flags.get('raw') !== 'no'
let MAX_SWITCHED = Number(flags.get('max-switched') ?? 8_000_000)

let { instrumentFile } = await importDist('core/instrument/instrument-file.js')
let { transformWithOxc } = await loadVite()

let started = Date.now()
let report = listMutants({ cwd: root, paths, bin, preset })
let listMs = Date.now() - started
let byFile = groupByFile(report.mutants.filter(m => m.status === 'Pending'))

let findings = []
let stats = {
  files: 0,
  skippedFiles: 0,
  mutants: 0,
  switchedParseErrors: 0,
  transformErrors: 0,
  compileErrors: 0,
  siteMismatch: 0,
  rawParseErrors: 0,
  audit: {},
  blockTypes: {},
  expressionTypes: {},
  replacementNewlines: 0,
  maxLineShift: 0,
  filesWithLineShift: 0,
  switchedBytes: 0,
  sourceBytes: 0,
}

function addAudit(kind, detail) {
  stats.audit[kind] = (stats.audit[kind] ?? 0) + 1
  findings.push({ kind, ...detail })
}

/** Builds parent links and a range index of an ESTree-like oxc AST. */
function indexAst(program) {
  let parents = new Map()
  let byRange = new Map()
  function visit(node, parent, key, index) {
    if (!node || typeof node.type !== 'string') return
    parents.set(node, { parent, key, index })
    let rangeKey = `${node.start}:${node.end}`
    let list = byRange.get(rangeKey)
    if (!list) byRange.set(rangeKey, (list = []))
    list.push(node)
    for (let childKey of Object.keys(node)) {
      if (childKey === 'type' || childKey === 'start' || childKey === 'end') continue
      let value = node[childKey]
      if (Array.isArray(value)) {
        value.forEach((child, childIndex) => {
          if (child && typeof child.type === 'string') visit(child, node, childKey, childIndex)
        })
      } else if (value && typeof value.type === 'string') {
        visit(value, node, childKey, null)
      }
    }
  }
  visit(program, null, null, null)
  return { parents, byRange }
}

let wrapperTypes = new Set([
  'TSInstantiationExpression',
  'ParenthesizedExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSAsExpression',
])

function contextOf(parents, node) {
  let slot = parents.get(node)
  while (slot.parent && wrapperTypes.has(slot.parent.type)) {
    slot = parents.get(slot.parent)
  }
  return slot
}

function unwrap(node) {
  while (wrapperTypes.has(node.type)) node = node.expression
  return node
}

function isAnonymousFunctionDefinition(node) {
  let inner = node
  while (inner.type === 'ParenthesizedExpression') inner = inner.expression
  return (
    inner.type === 'ArrowFunctionExpression' ||
    (inner.type === 'FunctionExpression' && !inner.id) ||
    (inner.type === 'ClassExpression' && !inner.id)
  )
}

/** Whether a slot performs NamedEvaluation of an anonymous function there. */
function isNamingSlot(context) {
  let { parent, key } = context
  if (!parent) return false
  switch (parent.type) {
    case 'VariableDeclarator':
      return key === 'init' && parent.id.type === 'Identifier'
    case 'AssignmentExpression':
      return key === 'right' && unwrap(parent.left).type === 'Identifier' && ['=', '||=', '&&=', '??='].includes(parent.operator)
    case 'AssignmentPattern':
      return key === 'right' && parent.left.type === 'Identifier'
    case 'Property':
      return key === 'value' && parent.kind === 'init' && !parent.method && !parent.shorthand
    case 'PropertyDefinition':
    case 'AccessorProperty':
      return key === 'value'
    case 'ExportDefaultDeclaration':
      return key === 'declaration'
    default:
      return false
  }
}

function parseExpressionText(text, lang) {
  let result = oxc.parseSync('x.' + (lang.startsWith('ts') ? 'ts' : 'js'), `(${text})`, { lang, preserveParens: true })
  if (result.errors.length > 0) return null
  let statement = result.program.body[0]
  if (!statement || statement.type !== 'ExpressionStatement') return null
  return statement.expression
}

function auditExpression(file, mutant, node, ast, options) {
  let { parents } = ast
  let context = contextOf(parents, node)
  let raw = parents.get(node)
  let inner = unwrap(node)
  let parent = context.parent
  let base = { file, id: mutant.id, mutator: mutant.mutator, original: mutant.original.slice(0, 120), replacement: mutant.replacement.slice(0, 120), line: mutant.line }
  if (parent?.type === 'CallExpression' && context.key === 'callee' && ['MemberExpression', 'ChainExpression'].includes(inner.type)) addAudit('this-callee', base)
  if (parent?.type === 'TaggedTemplateExpression' && (context.key === 'quasi' || ['MemberExpression', 'ChainExpression'].includes(inner.type))) addAudit('tag-or-quasi', base)
  if (parent?.type === 'CallExpression' && context.key === 'callee' && inner.type === 'Identifier' && inner.name === 'eval') addAudit('eval-callee', base)
  if (parent?.type === 'UnaryExpression' && parent.operator === 'delete') addAudit('delete-operand', base)
  if (parent?.type === 'UnaryExpression' && parent.operator === 'typeof' && inner.type === 'Identifier') addAudit('typeof-identifier', base)
  if ((['AssignmentExpression', 'AssignmentPattern', 'ForInStatement', 'ForOfStatement'].includes(parent?.type) && context.key === 'left') || ['UpdateExpression', 'ArrayPattern', 'RestElement', 'ObjectPattern'].includes(parent?.type)) addAudit('write-target', base)
  if (parent?.type === 'Property' && parents.get(parent)?.parent?.type === 'ObjectPattern' && context.key === 'value') addAudit('write-target', base)
  // Short-circuit element: optional link at or below the node inside a chain.
  if (['MemberExpression', 'CallExpression', 'TSNonNullExpression'].includes(node.type)) {
    let up = node
    let inChain = false
    while (parents.get(up)?.parent) {
      let p = parents.get(up).parent
      if (p.type === 'ChainExpression') { inChain = true; break }
      if (!['MemberExpression', 'CallExpression', 'TSNonNullExpression'].includes(p.type)) break
      let k = parents.get(up).key
      if (!((p.type === 'MemberExpression' && k === 'object') || (p.type === 'CallExpression' && k === 'callee') || (p.type === 'TSNonNullExpression' && k === 'expression'))) break
      up = p
    }
    if (inChain) {
      let current = node
      for (;;) {
        if (current.type === 'TSNonNullExpression') current = current.expression
        else if (current.type === 'MemberExpression') { if (current.optional) { addAudit('short-circuit-element', base); break } current = current.object }
        else if (current.type === 'CallExpression') { if (current.optional) { addAudit('short-circuit-element', base); break } current = current.callee }
        else break
      }
    }
  }
  if (raw.parent?.type === 'ExpressionStatement' && typeof raw.parent.directive === 'string') addAudit('directive', base)
  if (raw.parent?.type === 'MethodDefinition' || (raw.parent?.type === 'Property' && (raw.parent.method || raw.parent.kind !== 'init') && raw.key === 'value')) addAudit('method-value', base)
  if (raw.parent?.type === 'Property' && raw.parent.shorthand && raw.key === 'value') addAudit('shorthand-value', base)
  if (['JSXAttribute'].includes(raw.parent?.type) || (['JSXElement', 'JSXFragment'].includes(raw.parent?.type) && raw.key === 'children')) addAudit('jsx-shape', base)
  if (isNamingSlot(context)) {
    if (isAnonymousFunctionDefinition(node)) addAudit('named-evaluation-original', base)
    let replacement = parseExpressionText(mutant.replacement, options.lang)
    if (replacement && isAnonymousFunctionDefinition(replacement)) addAudit('named-evaluation-replacement', base)
  }
  stats.expressionTypes[node.type] = (stats.expressionTypes[node.type] ?? 0) + 1
}

let listKeys = new Map([['SwitchCase', 'consequent'], ['BlockStatement', 'body'], ['TSModuleBlock', 'body'], ['StaticBlock', 'body'], ['Program', 'body']])
let singleKeys = new Map([['IfStatement', ['consequent', 'alternate']], ['DoWhileStatement', ['body']], ['LabeledStatement', ['body']], ['ForInStatement', ['body']], ['ForOfStatement', ['body']], ['WhileStatement', ['body']], ['WithStatement', ['body']], ['ForStatement', ['body']]])

function containsTopSuper(statement) {
  return statement.type === 'ExpressionStatement' && unwrap(statement.expression).type === 'CallExpression' && unwrap(statement.expression).callee.type === 'Super'
}

function auditBlock(file, mutant, node, ast) {
  let { parents } = ast
  let raw = parents.get(node)
  let base = { file, id: mutant.id, mutator: mutant.mutator, original: mutant.original.slice(0, 120), replacement: mutant.replacement.slice(0, 120), line: mutant.line }
  stats.blockTypes[node.type] = (stats.blockTypes[node.type] ?? 0) + 1
  let ok = raw.index !== null ? listKeys.get(raw.parent.type) === raw.key : (singleKeys.get(raw.parent?.type) ?? []).includes(raw.key)
  if (!ok) addAudit('block-not-statement-position', { ...base, parent: raw.parent?.type, key: raw.key })
  if (raw.parent?.type === 'LabeledStatement') addAudit('block-labeled-body', base)
  if (['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration'].includes(node.type)) addAudit('block-declaration', base)
  if (containsTopSuper(node)) addAudit('block-super-call', base)
  if (node.type === 'ExpressionStatement' && typeof node.directive === 'string') addAudit('directive', base)
}

function findNode(ast, mutant) {
  let list = ast.byRange.get(`${mutant.start}:${mutant.end}`) ?? []
  // Prefer the outermost node that is not a wrapper of the same range, matching kind.
  let wanted = list.filter(node => node.type !== 'ParenthesizedExpression')
  if (mutant.kind === 'block') return wanted.find(node => /Statement$/.test(node.type)) ?? null
  return wanted.find(node => !/Statement$/.test(node.type) && node.type !== 'Program') ?? null
}

for (let [display, mutants] of byFile) {
  let absolute = path.join(root, display)
  let options = parserOptions(display)
  if (!options) {
    stats.skippedFiles++
    continue
  }
  let source = read(absolute)
  stats.files++
  stats.mutants += mutants.length
  stats.sourceBytes += source.length
  let switched
  try {
    switched = instrumentFile({ mutants, source, file: display })
  } catch (error) {
    findings.push({ kind: 'instrument-throws', file: display, message: error.message })
    continue
  }
  stats.switchedBytes += switched.length
  // Switched texts of many megabytes (BUG-104) are not parsed: oxc's AST of a
  // 90 MB text takes gigabytes and got this process OOM-killed.
  if (switched.length > MAX_SWITCHED) {
    findings.push({ kind: 'huge-switched', file: display, sourceBytes: source.length, switchedBytes: switched.length, mutants: mutants.length })
    stats.hugeSwitched = (stats.hugeSwitched ?? 0) + 1
    continue
  }
  // Line shift: extra lines the switched text has.
  let shift = switched.split('\n').length - source.split('\n').length
  if (shift > 0) {
    stats.filesWithLineShift++
    stats.maxLineShift = Math.max(stats.maxLineShift, shift)
  }
  stats.replacementNewlines += mutants.filter(m => m.replacement.includes('\n')).length
  // 2. parse switched
  let parsed = oxc.parseSync(display, switched, { ...options, preserveParens: true })
  if (parsed.errors.length > 0) {
    stats.switchedParseErrors++
    findings.push({ kind: 'switched-parse-error', file: display, message: parsed.errors[0].message })
  }
  // 4. sites
  let sites = new Map()
  for (let match of switched.matchAll(/__mootant\?\.hit\("([0-9a-z]+)"\)/gu)) sites.set(match[1], (sites.get(match[1]) ?? 0) + 1)
  for (let mutant of mutants) {
    if (sites.get(mutant.id) !== 1) {
      stats.siteMismatch++
      findings.push({ kind: 'site-count', file: display, id: mutant.id, count: sites.get(mutant.id) ?? 0 })
    }
  }
  // 3. transform + compile
  let js = null
  try {
    let transformed = await transformWithOxc(switched, absolute, { lang: options.lang, sourcemap: false })
    js = transformed.code
  } catch (error) {
    stats.transformErrors++
    findings.push({ kind: 'transform-error', file: display, message: String(error.message).slice(0, 300) })
  }
  if (js !== null) {
    let isModule = options.sourceType === 'module' || (options.sourceType === 'unambiguous' && oxc.parseSync(display, source, { ...options }).module.hasModuleSyntax)
    try {
      if (isModule) new vm.SourceTextModule(js, { identifier: absolute })
      else new vm.Script(`(function (exports, require, module, __filename, __dirname) {${js}\n})`, { filename: absolute })
    } catch (error) {
      stats.compileErrors++
      findings.push({ kind: 'compile-error', file: display, module: isModule, message: String(error.message).slice(0, 300) })
    }
  }
  // 5. raw applied mutants + 6. audit
  let original = oxc.parseSync(display, source, { ...options, preserveParens: true })
  let ast = indexAst(original.program)
  // Bindings named globalThis shadow the site check (get-site-check.ts).
  for (let [node, slot] of ast.parents) {
    if (node.type !== 'Identifier' || node.name !== 'globalThis' || !slot.parent) continue
    let { parent, key } = slot
    let binding =
      (parent.type === 'VariableDeclarator' && key === 'id') ||
      (/Function/u.test(parent.type) && (key === 'params' || key === 'id')) ||
      (parent.type === 'CatchClause' && key === 'param') ||
      (/^Class/u.test(parent.type) && key === 'id') ||
      (/Import.*Specifier/u.test(parent.type) && key === 'local') ||
      (parent.type === 'AssignmentPattern' && key === 'left') ||
      (parent.type === 'Property' && key === 'value' && ast.parents.get(parent)?.parent?.type === 'ObjectPattern') ||
      parent.type === 'ArrayPattern' || parent.type === 'RestElement'
    if (binding) addAudit('shadowed-globalThis', { file: display, line: source.slice(0, node.start).split('\n').length })
  }
  for (let mutant of mutants) {
    let node = findNode(ast, mutant)
    if (!node) {
      findings.push({ kind: 'node-not-found', file: display, id: mutant.id, kind2: mutant.kind, original: mutant.original.slice(0, 80) })
    } else if (mutant.kind === 'block') {
      auditBlock(display, mutant, node, ast)
    } else {
      auditExpression(display, mutant, node, ast, options)
    }
    if (rawCheck) {
      let applied = applyRaw(source, mutant)
      let result = oxc.parseSync(display, applied, { ...options, preserveParens: true })
      if (result.errors.length > 0) {
        stats.rawParseErrors++
        findings.push({ kind: 'raw-parse-error', file: display, id: mutant.id, mutator: mutant.mutator, original: mutant.original.slice(0, 120), replacement: mutant.replacement.slice(0, 120), message: result.errors[0].message })
      }
    }
  }
}

let summary = { root, paths, preset, listMs, totalMs: Date.now() - started, mootant: MOOTANT_ROOT, diagnostics: report.diagnostics.length, ...stats }
writeFileSync(out, JSON.stringify({ summary, findings }, null, 1))
let counts = {}
for (let finding of findings) counts[finding.kind] = (counts[finding.kind] ?? 0) + 1
console.log(JSON.stringify({ ...summary, findingCounts: counts }, null, 1))
