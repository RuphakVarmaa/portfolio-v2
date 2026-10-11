import { createHash } from 'node:crypto'
import { defaultClientConditions, defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { buildClassTable, posixRelative } from './scripts/class-names.ts'

const ROOT = process.cwd()

/**
 * Short, deterministic CSS-module class names for production: `aa`, `ab`, ... (scripts/class-names.ts explains why
 * and how). The client build and the SSR build read the same sources, so they derive the same table and the server
 * markup always matches the stylesheet. A name that is not in the table (it should not happen) falls back to a long
 * hash that can never collide with a counter name. In dev the readable default is used.
 */
function shortClassNames(): (name: string, filename: string) => string {
  const table = buildClassTable(ROOT)
  return (name, filename) => {
    const key = `${posixRelative(ROOT, filename)}:${name}`
    return table.get(key) ?? `q${createHash('sha1').update(key).digest('base64url').slice(0, 8)}`
  }
}

/**
 * The fontsource stylesheets declare one `@font-face` per Unicode subset (latin, latin-ext, vietnamese,
 * cyrillic ...). The site is English and its text is Latin: the other subsets are never requested, yet their
 * rules cost about 5 KB of the CSS budget, and Vite inlined one of them as base64 (a 4 KB data URI that gzip
 * cannot shrink). Keep the latin rule of each family and drop the rest; a glyph outside latin falls back to
 * the system font exactly as it would for any family that does not have it. The five `import`s in main.tsx
 * stay as the spec lists them.
 */
function latinFontsOnly(): Plugin {
  return {
    name: 'latin-fonts-only',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]@fontsource-variable[\\/][^\\/]+[\\/][^\\/]+\.css(?:\?|$)/.test(id)) return null
      const kept = code.replace(/\/\*[^*]*\*\/\s*@font-face\s*\{[^}]*\}\s*/g, (rule) => (/-latin-(?:wght|full)-/.test(rule) ? rule : ''))
      return { code: kept, map: null }
    },
  }
}

export default defineConfig(({ command, isSsrBuild }) => ({
  plugins: [latinFontsOnly(), react()],
  resolve: {
    // `onnxruntime-web/wasm` resolves to the slim loader (ort.wasm.min.mjs, ~50 KB) instead of the
    // bundle that inlines the WASM glue. The `.wasm` and its `.mjs` are served from /ort/ (public/).
    conditions: [...defaultClientConditions, 'onnxruntime-web-use-extern-wasm'],
  },
  css: {
    modules: command === 'build' ? { generateScopedName: shortClassNames() } : {},
  },
  optimizeDeps: {
    // ORT locates its WASM at runtime (env.wasm.wasmPaths); pre-bundling would break that in dev.
    exclude: ['onnxruntime-web'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    // The spec's browser floor (section 8.3): Chrome and Edge 120, Firefox 120, Safari 16.4. Without this the
    // CSS minifier targets the JS floor and ships prefixes and fallbacks no supported browser needs.
    cssTarget: ['chrome120', 'edge120', 'firefox120', 'safari16.4'],
    cssMinify: 'lightningcss',
    // One CSS file for the whole site (spec 8.1: "Critical CSS (all CSS, one file)").
    cssCodeSplit: false,
    // The prerender step and the Colophon read chunk sizes from dist/.vite/manifest.json.
    manifest: true,
    // Every supported browser has native <link rel="modulepreload">; skip the polyfill.
    modulePreload: { polyfill: false },
    // The SSR build only produces dist-ssr/entry-server.js; do not copy public/ (14 MB of ORT) into it.
    copyPublicDir: !isSsrBuild,
    rolldownOptions: {
      output: {
        // React + ReactDOM + scheduler are ~66 KB gzipped on their own and change far less often than the
        // site: a separate, long-cached chunk. check-budgets.mjs budgets `index-*.js` (the site) and this
        // vendor chunk separately and reports their sum. See docs/INTERFACES.md ("Budgets").
        codeSplitting: {
          groups: [{ name: 'react', test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/ }],
        },
      },
    },
  },
}))
