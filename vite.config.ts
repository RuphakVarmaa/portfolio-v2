import { createHash } from 'node:crypto'
import { relative } from 'node:path'
import { defaultClientConditions, defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

/**
 * Short, stable CSS-module class names for production: `q` + 6 characters of a hash of the file path and
 * the local name. The prerendered HTML repeats class names hundreds of times, and the 60 KB budget for
 * dist/index.html is raw bytes. The client and the SSR build call this with the same arguments, so the
 * server markup and the stylesheet always agree. In dev the readable default is used.
 */
function shortClassName(name: string, filename: string): string {
  const key = `${relative(process.cwd(), filename)}:${name}`
  return `q${createHash('sha1').update(key).digest('base64url').slice(0, 6)}`
}

export default defineConfig(({ command, isSsrBuild }) => ({
  plugins: [react()],
  resolve: {
    // `onnxruntime-web/wasm` resolves to the slim loader (ort.wasm.min.mjs, ~50 KB) instead of the
    // bundle that inlines the WASM glue. The `.wasm` and its `.mjs` are served from /ort/ (public/).
    conditions: [...defaultClientConditions, 'onnxruntime-web-use-extern-wasm'],
  },
  css: {
    modules: command === 'build' ? { generateScopedName: shortClassName } : {},
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
