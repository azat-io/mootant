import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  Program,
  Class,
  Node,
} from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { NodeSlot } from '../../types/syntax/node-slot'
import type { Binding } from '../../types/syntax/binding'

import { unwrapExpression } from '../tree/unwrap-expression'
import { isNamePosition } from '../tree/is-name-position'
import { walkTree } from '../tree/walk-tree'

/**
 * Collections filled during the walk and read when names are resolved.
 */
interface Analysis {
  /**
   * Nodes that declare type parameters, by parameter name.
   */
  typeParameters: Map<string, Node[]>

  /**
   * Scope and name context of every visited node, for its children.
   */
  contexts: Map<Node, NodeContext>

  /**
   * Bodies of functions, which open a scope below the scope of the parameters.
   */
  functionBodies: Set<Node | null>

  /**
   * Same-file type declaration of every resolved type name.
   */
  typeReferences: Map<Node, Node>

  /**
   * Binding of every binding identifier and resolved name.
   */
  bindings: Map<Node, Binding>

  /**
   * Type names to resolve after the walk.
   */
  typeNames: PendingTypeName[]

  /**
   * Writes of identifiers, resolved after the walk.
   */
  writes: PendingWrite[]

  /**
   * Names to resolve after the walk.
   */
  names: PendingName[]

  /**
   * Whether the program has a direct `eval` call or a `with` statement.
   */
  opaque: boolean
}

/**
 * Region of the file in which declared names are visible.
 */
interface Scope {
  /**
   * Parameters of the function whose body the scope is, or null for any other
   * scope; a body `var` named like a parameter is the parameter.
   */
  parameters: Map<string, Binding> | null

  /**
   * Names declared in the scope.
   */
  declarations: Map<string, Binding>

  /**
   * Type aliases, interfaces, classes and enums declared in the scope; the
   * first declaration of a name wins.
   */
  types: Map<string, Node>

  /**
   * Whether `var` declarations below stop here: a function, the program, a
   * static block or a namespace body.
   */
  hoistsVariables: boolean

  /**
   * Enclosing scope, or null for the program.
   */
  parent: Scope | null

  /**
   * Node that owns the scope.
   */
  node: Node
}

/**
 * Identifier found during the walk that may refer to a declaration.
 */
interface PendingName {
  /**
   * Identifier to resolve.
   */
  identifier: Identifier

  /**
   * Whether the identifier reads or writes the value; false for the name of a
   * `typeof x` type query, which is resolved but not counted as a use.
   */
  isReference: boolean

  /**
   * Scope the identifier sits in.
   */
  scope: Scope
}

/**
 * What a declaration gives every name it declares.
 */
interface BindingSource {
  /**
   * How the names are declared.
   */
  kind: Binding['kind']

  /**
   * Node that declares the names.
   */
  declaration: Node

  /**
   * Scope that receives the names.
   */
  scope: Scope
}

/**
 * What the children of a node see.
 */
interface NodeContext {
  /**
   * Whether identifiers below are types or names, never references.
   */
  holdsNoValues: boolean

  /**
   * Scope the children live in.
   */
  scope: Scope
}

/**
 * Identifier that an assignment, an update or a loop head writes.
 */
interface PendingWrite {
  /**
   * Written identifier.
   */
  identifier: Identifier

  /**
   * Whole write expression, or the `left` of a loop head.
   */
  write: Node
}

/**
 * Name of a type reference found during the walk.
 */
interface PendingTypeName {
  /**
   * Identifier to resolve.
   */
  identifier: Identifier

  /**
   * Scope the type reference sits in.
   */
  scope: Scope
}

/**
 * Identifier node of oxc, whatever role it plays.
 */
type Identifier = Extract<Node, { type: 'Identifier' }>

/**
 * Child keys that hold only TypeScript types.
 */
let typeKeys = new Set<string | null>([
  'superTypeArguments',
  'typeParameters',
  'typeAnnotation',
  'typeArguments',
  'returnType',
  'implements',
])

/**
 * Node types whose identifiers are types or names, never references.
 */
let noValueTypes = new Set<string>([
  'TSNamespaceExportDeclaration',
  'TSImportEqualsDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'ExportAllDeclaration',
  'ImportDeclaration',
  'TSIndexSignature',
])

/**
 * Resolves the names of a file in one walk over the whole program, type
 * positions and ambient declarations included. Declarations are collected
 * before references are resolved, so `var` and function declarations are
 * hoisted, and `let`, `const` and `class` bind in their whole block.
 *
 * @param program - Root of the file.
 * @returns Bindings with their references and writes, the same-file
 *   declarations of type names, the owners of type parameters and whether a
 *   direct `eval` call or a `with` statement makes the program opaque.
 */
export function analyzeScopes(program: Program): ScopeAnalysis {
  let analysis: Analysis = {
    typeReferences: new Map(),
    functionBodies: new Set(),
    typeParameters: new Map(),
    contexts: new Map(),
    bindings: new Map(),
    opaque: false,
    typeNames: [],
    writes: [],
    names: [],
  }
  let programContext: NodeContext = {
    scope: createScope(program, null, true),
    holdsNoValues: false,
  }
  walkTree(program, (node, slot) => {
    let outer = slot.parent ? getChildContext(slot, analysis) : programContext
    analysis.contexts.set(node, {
      holdsNoValues: outer.holdsNoValues || holdsNoValues(node, slot),
      scope: enterScope(node, outer.scope, analysis),
    })
    recordDeclarations(node, outer.scope, analysis)
    recordTypes(node, slot, analysis)
    recordWrites(node, analysis)
    recordOpacity(node, analysis)
    if (node.type === 'Identifier') {
      recordName(node, slot, analysis)
    }
    return true
  })

  for (let { isReference, identifier, scope } of analysis.names) {
    let binding = resolveName(scope, identifier.name)
    if (binding) {
      analysis.bindings.set(identifier, binding)
      if (isReference) {
        binding.references.push(identifier)
      }
    }
  }
  for (let { identifier, scope } of analysis.typeNames) {
    let declaration = resolveType(scope, identifier.name)
    if (declaration) {
      analysis.typeReferences.set(identifier, declaration)
    }
  }
  for (let { identifier, write } of analysis.writes) {
    let binding = analysis.bindings.get(identifier)
    if (binding && binding.writes.at(-1) !== write) {
      binding.writes.push(write)
    }
  }

  return {
    typeReferences: analysis.typeReferences,
    typeParameters: analysis.typeParameters,
    bindings: analysis.bindings,
    opaque: analysis.opaque,
  }
}

/**
 * Declares the names of declarations that open no scope of their own:
 * variables, imports, enums and namespaces.
 *
 * @param node - Node being entered.
 * @param scope - Scope the node sits in.
 * @param analysis - Collections of the walk.
 */
function recordDeclarations(
  node: Node,
  scope: Scope,
  analysis: Analysis,
): void {
  switch (node.type) {
    case 'TSImportEqualsDeclaration':
      if (node.importKind === 'value') {
        declareNames(
          node.id,
          { declaration: node, kind: 'import', scope },
          analysis,
        )
      }
      break
    case 'VariableDeclaration': {
      let kind = node.kind === 'await using' ? 'using' : node.kind
      let target = kind === 'var' ? findHoistingScope(scope) : scope
      for (let declarator of node.declarations) {
        declareNames(
          declarator.id,
          { declaration: declarator, scope: target, kind },
          analysis,
        )
      }
      break
    }
    case 'TSModuleDeclaration':
      if (!node.declare && node.id.type === 'Identifier') {
        declareNames(
          node.id,
          { kind: 'namespace', declaration: node, scope },
          analysis,
        )
      }
      break
    case 'ImportDeclaration':
      if (node.importKind !== 'type') {
        for (let specifier of node.specifiers) {
          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.importKind !== 'type'
          ) {
            declareNames(
              specifier.local,
              { declaration: specifier, kind: 'import', scope },
              analysis,
            )
          }
        }
      }
      break
    case 'TSEnumDeclaration':
      declareNames(
        node.id,
        { declaration: node, kind: 'enum', scope },
        analysis,
      )
      break
    default:
      break
  }
}

/**
 * Records same-file type declarations in the scope they sit in, the names of
 * type references and the owners of type parameters.
 *
 * @param node - Node being entered.
 * @param slot - Raw slot of the node; its parent gives the scope the node sits
 *   in.
 * @param analysis - Collections of the walk.
 */
function recordTypes(node: Node, slot: NodeSlot, analysis: Analysis): void {
  switch (node.type) {
    case 'TSTypeParameterDeclaration':
      for (let parameter of node.params) {
        let owners = analysis.typeParameters.get(parameter.name.name) ?? []
        owners.push(slot.parent!)
        analysis.typeParameters.set(parameter.name.name, owners)
      }
      break
    case 'TSTypeAliasDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSEnumDeclaration':
      addTypeDeclaration(
        node.id.name,
        node,
        getChildContext(slot, analysis).scope,
      )
      break
    case 'TSInterfaceHeritage':
      if (node.expression.type === 'Identifier') {
        analysis.typeNames.push({
          scope: getChildContext(slot, analysis).scope,
          identifier: node.expression,
        })
      }
      break
    case 'ClassDeclaration':
      if (node.id) {
        addTypeDeclaration(
          node.id.name,
          node,
          getChildContext(slot, analysis).scope,
        )
      }
      break
    case 'TSTypeReference':
      if (node.typeName.type === 'Identifier') {
        analysis.typeNames.push({
          scope: getChildContext(slot, analysis).scope,
          identifier: node.typeName,
        })
      }
      break
    default:
      break
  }
}

/**
 * Creates the scopes a node opens and declares the names that belong to them: a
 * function's own name and parameters, a class name and a catch parameter.
 *
 * @param node - Node being entered.
 * @param outer - Scope the node sits in.
 * @param analysis - Collections of the walk.
 * @returns The scope the children of the node live in.
 */
function enterScope(node: Node, outer: Scope, analysis: Analysis): Scope {
  switch (node.type) {
    case 'TSEmptyBodyFunctionExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'TSDeclareFunction':
      return enterFunction(node, outer, analysis)
    case 'ClassDeclaration':
      if (node.id) {
        declareNames(
          node.id,
          { declaration: node, kind: 'class', scope: outer },
          analysis,
        )
      }
      return outer
    case 'SwitchStatement':
    case 'ForOfStatement':
    case 'ForInStatement':
    case 'ForStatement':
      return createScope(node, outer, false)
    case 'ClassExpression':
      return enterNamedScope(node, outer, analysis)
    case 'BlockStatement':
      return analysis.functionBodies.has(node) ?
          enterFunctionBody(outer)
        : createScope(node, outer, false)
    case 'TSModuleBlock':
    case 'StaticBlock':
      return createScope(node, outer, true)
    case 'CatchClause': {
      let scope = createScope(node, outer, false)
      if (node.param) {
        declareNames(
          node.param,
          { declaration: node, kind: 'catch', scope },
          analysis,
        )
      }
      return scope
    }
    default:
      return outer
  }
}

/**
 * Lists the identifiers that a binding pattern or an assignment target binds or
 * writes. Member expressions write no name and are left out.
 *
 * @param pattern - Identifier, pattern, parameter property or wrapped target.
 * @returns The identifiers, in no particular order.
 */
function collectTargetNames(pattern: Node): Identifier[] {
  let names: Identifier[] = []
  let stack: Node[] = [pattern]
  let pending = stack.pop()
  while (pending) {
    let current = unwrapExpression(pending)
    switch (current.type) {
      case 'TSParameterProperty':
        stack.push(current.parameter)
        break
      case 'AssignmentPattern':
        stack.push(current.left)
        break
      case 'ObjectPattern':
        stack.push(...current.properties)
        break
      case 'ArrayPattern':
        for (let element of current.elements) {
          if (element) {
            stack.push(element)
          }
        }
        break
      case 'RestElement':
        stack.push(current.argument)
        break
      case 'Identifier':
        names.push(current)
        break
      case 'Property':
        stack.push(current.value)
        break
      default:
        break
    }
    pending = stack.pop()
  }
  return names
}

/**
 * Declares every identifier of a binding pattern in a scope. A name that the
 * scope already declares keeps its first binding, and a `var` named like a
 * parameter of the function is the parameter; the identifier maps to it.
 *
 * @param pattern - Identifier or destructuring pattern.
 * @param source - Kind, declaration node and scope of the names.
 * @param analysis - Collections of the walk.
 */
function declareNames(
  pattern: Node,
  source: BindingSource,
  analysis: Analysis,
): void {
  let { declarations, parameters } = source.scope
  for (let identifier of collectTargetNames(pattern)) {
    if (identifier.name !== 'this') {
      let binding = declarations.get(identifier.name)
      if (!binding && source.kind === 'var') {
        binding = parameters?.get(identifier.name)
      }
      if (!binding) {
        binding = {
          declaration: source.declaration,
          scope: source.scope.node,
          kind: source.kind,
          references: [],
          identifier,
          writes: [],
        }
        declarations.set(identifier.name, binding)
      }
      analysis.bindings.set(identifier, binding)
    }
  }
}

/**
 * Opens the scope of a function and declares its name and parameters. A named
 * function expression gets an extra scope for its own name. The body opens its
 * own scope below, so parameter expressions never see the body's declarations.
 *
 * @param node - Function being entered.
 * @param outer - Scope the function sits in.
 * @param analysis - Collections of the walk.
 * @returns The scope of the parameters, and of an expression body.
 */
function enterFunction(
  node: ArrowFunctionExpression | FunctionNode,
  outer: Scope,
  analysis: Analysis,
): Scope {
  let enclosing = outer
  if (node.type === 'FunctionExpression') {
    enclosing = enterNamedScope(node, outer, analysis)
  } else if (node.type !== 'ArrowFunctionExpression' && node.id) {
    declareNames(
      node.id,
      { declaration: node, kind: 'function', scope: outer },
      analysis,
    )
  }
  let scope = createScope(node, enclosing, true)
  for (let parameter of node.params) {
    declareNames(
      parameter,
      { declaration: parameter, kind: 'parameter', scope },
      analysis,
    )
  }
  analysis.functionBodies.add(node.body)
  return scope
}

/**
 * Queues an identifier for resolution unless it declares a name or is a name
 * that never refers to a value.
 *
 * @param identifier - Identifier being entered.
 * @param slot - Raw slot of the identifier.
 * @param analysis - Collections of the walk.
 */
function recordName(
  identifier: Identifier,
  slot: NodeSlot,
  analysis: Analysis,
): void {
  if (
    analysis.bindings.has(identifier) ||
    identifier.name === 'this' ||
    isNameSlot(slot)
  ) {
    return
  }
  let { holdsNoValues: isTypeOrName, scope } =
    analysis.contexts.get(identifier)!
  if (slot.key === 'exprName') {
    analysis.names.push({ isReference: false, identifier, scope })
  } else if (!isTypeOrName) {
    analysis.names.push({ isReference: true, identifier, scope })
  }
}

/**
 * Records the identifiers that an assignment, an update or a loop head that
 * declares nothing writes.
 *
 * @param node - Node being entered.
 * @param analysis - Collections of the walk.
 */
function recordWrites(node: Node, analysis: Analysis): void {
  switch (node.type) {
    case 'AssignmentExpression':
      addWrites(node.left, node, analysis)
      break
    case 'UpdateExpression':
      addWrites(node.argument, node, analysis)
      break
    case 'ForOfStatement':
    case 'ForInStatement':
      if (node.left.type !== 'VariableDeclaration') {
        addWrites(node.left, node.left, analysis)
      }
      break
    default:
      break
  }
}

/**
 * Opens the scope in which a named function or class expression sees its own
 * name.
 *
 * @param node - Function or class expression being entered.
 * @param outer - Scope the expression sits in.
 * @param analysis - Collections of the walk.
 * @returns The scope with the name, or `outer` for an anonymous expression.
 */
function enterNamedScope(
  node: FunctionNode | Class,
  outer: Scope,
  analysis: Analysis,
): Scope {
  if (!node.id) {
    return outer
  }
  let scope = createScope(node, outer, false)
  declareNames(
    node.id,
    {
      kind: node.type === 'ClassExpression' ? 'class' : 'function',
      declaration: node,
      scope,
    },
    analysis,
  )
  return scope
}

/**
 * Records the code that hides uses of names from the analysis: a `with`
 * statement, and a call that may be a direct `eval`. A call is direct when its
 * callee is the name `eval` and the name holds the built-in `eval` when the
 * code runs, whatever declaration binds it: code that is not strict may give a
 * parameter or a variable that name. An optional call of `eval` is never
 * direct.
 *
 * @param node - Node being entered.
 * @param analysis - Collections of the walk.
 */
function recordOpacity(node: Node, analysis: Analysis): void {
  if (node.type === 'WithStatement') {
    analysis.opaque = true
  } else if (node.type === 'CallExpression' && !node.optional) {
    let callee = unwrapExpression(node.callee)
    if (callee.type === 'Identifier' && callee.name === 'eval') {
      analysis.opaque = true
    }
  }
}

/**
 * Tells whether the identifiers under a node are types or names only: type
 * keys, type-only declarations, module metadata and namespace names.
 *
 * @param node - Node being entered.
 * @param slot - Raw slot of the node.
 * @returns Whether no identifier under the node is a reference.
 */
function holdsNoValues(node: Node, slot: NodeSlot): boolean {
  if (typeKeys.has(slot.key) || noValueTypes.has(node.type)) {
    return true
  }
  if (node.type === 'ExportNamedDeclaration') {
    return node.source !== null
  }
  return slot.key === 'id' && slot.parent!.type === 'TSModuleDeclaration'
}

/**
 * Finds what a child sees of its parent's context. The discriminant of a
 * `switch` is evaluated before the case block exists, so it lives in the scope
 * around the statement, not in the scope of its cases.
 *
 * @param slot - Raw slot of a node that has a parent.
 * @param analysis - Collections of the walk.
 * @returns Scope and name context that the child lives in.
 */
function getChildContext(slot: NodeSlot, analysis: Analysis): NodeContext {
  let parent = slot.parent!
  let context = analysis.contexts.get(parent)!
  return parent.type === 'SwitchStatement' && slot.key === 'discriminant' ?
      { ...context, scope: context.scope.parent! }
    : context
}

/**
 * Finds the same-file type declaration a type name refers to from a scope,
 * walking outward.
 *
 * @param scope - Scope the type reference sits in.
 * @param name - Type name to look up.
 * @returns The first declaration of the name, or undefined for a type declared
 *   elsewhere.
 */
function resolveType(scope: Scope, name: string): undefined | Node {
  let current: Scope | null = scope
  while (current) {
    let declaration = current.types.get(name)
    if (declaration) {
      return declaration
    }
    current = current.parent
  }
  return undefined
}

/**
 * Finds the declaration a name refers to from a scope, walking outward.
 *
 * @param scope - Scope the name is used in.
 * @param name - Name to look up.
 * @returns The first binding of the name, or undefined for a global.
 */
function resolveName(scope: Scope, name: string): undefined | Binding {
  let current: Scope | null = scope
  while (current) {
    let binding = current.declarations.get(name)
    if (binding) {
      return binding
    }
    current = current.parent
  }
  return undefined
}

/**
 * Creates an empty scope.
 *
 * @param node - Node that owns the scope.
 * @param parent - Enclosing scope, or null for the program.
 * @param hoistsVariables - Whether `var` declarations stop at the scope.
 * @returns The new scope.
 */
function createScope(
  node: Node,
  parent: Scope | null,
  hoistsVariables: boolean,
): Scope {
  return {
    declarations: new Map(),
    types: new Map(),
    parameters: null,
    hoistsVariables,
    parent,
    node,
  }
}

/**
 * Queues the identifiers of an assignment target as writes.
 *
 * @param target - Written target.
 * @param write - Node recorded as the write.
 * @param analysis - Collections of the walk.
 */
function addWrites(target: Node, write: Node, analysis: Analysis): void {
  for (let identifier of collectTargetNames(target)) {
    analysis.writes.push({ identifier, write })
  }
}

/**
 * Opens the scope of a function body. It belongs to the function, like the
 * scope of the parameters it sits in, and receives the body's `var`
 * declarations.
 *
 * @param parameters - Scope of the function's parameters.
 * @returns The scope of the body.
 */
function enterFunctionBody(parameters: Scope): Scope {
  let scope = createScope(parameters.node, parameters, true)
  scope.parameters = parameters.declarations
  return scope
}

/**
 * Tells whether an identifier slot holds a name that never refers to a
 * declaration: a name that is never a value, or an exported name.
 *
 * @param slot - Raw slot of an identifier.
 * @returns Whether the identifier is a name.
 */
function isNameSlot(slot: NodeSlot): boolean {
  return (
    isNamePosition(slot) ||
    (slot.parent?.type === 'ExportSpecifier' && slot.key === 'exported')
  )
}

/**
 * Finds the scope that receives a `var` declaration.
 *
 * @param scope - Scope the declaration sits in.
 * @returns The nearest function, program, static block or namespace body scope.
 */
function findHoistingScope(scope: Scope): Scope {
  let current = scope
  while (!current.hoistsVariables) {
    current = current.parent!
  }
  return current
}

/**
 * Records a same-file type declaration in its scope unless the scope already
 * declares the name.
 *
 * @param name - Declared type name.
 * @param node - Type alias, interface, class or enum that declares it.
 * @param scope - Scope the declaration sits in.
 */
function addTypeDeclaration(name: string, node: Node, scope: Scope): void {
  if (!scope.types.has(name)) {
    scope.types.set(name, node)
  }
}
