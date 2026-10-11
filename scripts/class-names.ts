// Short, deterministic CSS-module class names for production builds (see vite.config.ts, which uses this).
//
// The prerendered HTML repeats class names hundreds of times (the 60 KB budget for dist/index.html is raw bytes)
// and a random hash is the least compressible thing a stylesheet can contain (the 24 KB budget is gzip). So every
// local class and keyframe name in every `*.module.css` gets the next name from a counter: `aa`, `ab`, ... `a9`,
// `ba`, ... two characters for the first 936 names, three after that.
//
// The client build and the SSR build run the same config against the same sources, so they derive the same table
// and the server markup always matches the stylesheet. Files are walked in sorted order and names are taken in
// order of first appearance, so the table only changes when a module or a class is added or removed.
//
// Plain `.ts` with no DOM and no Vite import, so the tests can run it under Node type stripping.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const FIRST = 'abcdefghijklmnopqrstuvwxyz'
const REST = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** `aa`, `ab`, ... `a9`, `ba`, ... `z9`, then `aaa`, `aab`, ... Always starts with a letter, so it is a valid class name. */
export function* counterNames(): Generator<string> {
  for (const a of FIRST) for (const b of REST) yield a + b
  for (const a of FIRST) for (const b of REST) for (const c of REST) yield a + b + c
}

/** Every `*.module.css` under `dir`, in sorted path order. */
export function moduleCssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return moduleCssFiles(path)
      return entry.name.endsWith('.module.css') ? [path] : []
    })
}

/**
 * The class and keyframe names a stylesheet declares, each once, in order of first appearance. A `.name` counts after
 * anything that is not part of an identifier or a number, so `w3.org`, `0.5rem` and `.woff2` inside a data URI or a
 * `url()` do not.
 */
export function classNamesIn(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const names = new Set<string>()
  for (const match of text.matchAll(/(?:^|[^\w-])\.(-?[A-Za-z_][\w-]*)/g)) names.add(match[1])
  for (const match of text.matchAll(/@keyframes\s+(-?[A-Za-z_][\w-]*)/g)) names.add(match[1])
  return [...names]
}

/** A module's path from the project root, with `/` separators on every platform: `src/components/ui/ui.module.css`. */
export function posixRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

/** `"<module path>:<local name>"` -> short name, for every class and keyframe in every module under `<root>/src`. */
export function buildClassTable(root: string): Map<string, string> {
  const next = counterNames()
  const table = new Map<string, string>()
  for (const file of moduleCssFiles(join(root, 'src'))) {
    const key = posixRelative(root, file)
    for (const name of classNamesIn(readFileSync(file, 'utf8'))) table.set(`${key}:${name}`, next.next().value as string)
  }
  return table
}
