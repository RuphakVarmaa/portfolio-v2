/**
 * A small recursive walker over an ESTree (the tree acorn produces). Written by hand because the rules need
 * to know where a node sits (inside an async function? inside how many loops?) and `acorn-walk` is another
 * dependency for something this short.
 *
 * What the walker tracks for every node it visits (see `WalkContext`):
 *   - `parents`    the ancestors, outermost first, not including the node itself
 *   - `fn`         the nearest enclosing function node (null at the top level) and `inAsync`, whether it is async
 *   - `loopDepth`  how many loops enclose the node, counted inside the current function only: a function
 *                  defined in a loop body starts again at 0, because it may be called from anywhere
 *
 * The parts of a loop that run once (a `for` initialiser, the iterable of `for...of`) do not count as inside it.
 */

export interface Loc {
  line: number
  column: number
}

export interface AstNode {
  type: string
  start: number
  end: number
  loc: { start: Loc; end: Loc }
  [key: string]: unknown
}

export interface WalkContext {
  readonly parents: readonly AstNode[]
  readonly fn: AstNode | null
  readonly inAsync: boolean
  readonly loopDepth: number
}

export type Visitor = (node: AstNode, context: WalkContext) => void

export const isNode = (value: unknown): value is AstNode =>
  typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'

/** A node-valued property, or null. */
export function child(node: AstNode, key: string): AstNode | null {
  const value = node[key]
  return isNode(value) ? value : null
}

/** The nodes in an array-valued property (holes and non-nodes are dropped). */
export function children(node: AstNode, key: string): AstNode[] {
  const value = node[key]
  return Array.isArray(value) ? value.filter(isNode) : []
}

/** The `name` of an Identifier, or null for any other node. */
export function identifierName(node: AstNode | null): string | null {
  return node !== null && node.type === 'Identifier' && typeof node.name === 'string' ? node.name : null
}

export const LOOPS: ReadonlySet<string> = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'])
export const FUNCTIONS: ReadonlySet<string> = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

/** Does `key` of a loop node run on every iteration? */
function runsEachIteration(loop: string, key: string): boolean {
  if (loop === 'ForStatement') return key !== 'init'
  if (loop === 'ForInStatement' || loop === 'ForOfStatement') return key !== 'right'
  return true
}

/** Visit `root` and every node below it, parents before children, in source order. */
export function walk(root: AstNode, visit: Visitor): void {
  const parents: AstNode[] = []
  const context = { parents, fn: null as AstNode | null, inAsync: false, loopDepth: 0 }

  const step = (node: AstNode) => {
    visit(node, context)
    const isLoop = LOOPS.has(node.type)
    const isFunction = FUNCTIONS.has(node.type)
    const saved = { fn: context.fn, inAsync: context.inAsync, loopDepth: context.loopDepth }
    if (isFunction) {
      context.fn = node
      context.inAsync = node.async === true
      context.loopDepth = 0
    }
    parents.push(node)
    for (const key of Object.keys(node)) {
      if (key === 'loc') continue
      const value = node[key]
      const bump = isLoop && runsEachIteration(node.type, key) ? 1 : 0
      context.loopDepth += bump
      if (Array.isArray(value)) {
        for (const item of value) if (isNode(item)) step(item)
      } else if (isNode(value)) {
        step(value)
      }
      context.loopDepth -= bump
    }
    parents.pop()
    if (isFunction) {
      context.fn = saved.fn
      context.inAsync = saved.inAsync
      context.loopDepth = saved.loopDepth
    }
  }

  step(root)
}
