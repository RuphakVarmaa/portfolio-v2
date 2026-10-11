import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * Globals. typescript-eslint turns `no-undef` off for TS files (tsc checks them), so this list is
 * mostly documentation there; for the `.mjs` build scripts `no-undef` is on and the Node list matters.
 */
const browserGlobals = {
  document: 'readonly',
  window: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  history: 'readonly',
  HTMLElement: 'readonly',
  HTMLDialogElement: 'readonly',
  IntersectionObserver: 'readonly',
  ResizeObserver: 'readonly',
  MutationObserver: 'readonly',
  PerformanceObserver: 'readonly',
  BroadcastChannel: 'readonly',
  Worker: 'readonly',
  AudioContext: 'readonly',
  ImageBitmap: 'readonly',
  createImageBitmap: 'readonly',
  WebAssembly: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  matchMedia: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  performance: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  crypto: 'readonly',
  Blob: 'readonly',
  AbortController: 'readonly',
}

const workerGlobals = {
  self: 'readonly',
  postMessage: 'readonly',
  importScripts: 'readonly',
}

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  performance: 'readonly',
  crypto: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  AbortController: 'readonly',
  structuredClone: 'readonly',
}

/**
 * Local rule: every relative import / export / dynamic import must carry an explicit file extension.
 * Reason: modules reachable from `*.test.ts` and from `scripts/` run under Node type stripping, which
 * does no extension probing. One uniform rule for all of `src/` is simpler than "only some folders".
 */
const RELATIVE_WITH_EXTENSION = /\.[A-Za-z0-9]+$/
const localPlugin = {
  rules: {
    'relative-import-extension': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {
          missing:
            'Relative specifier "{{source}}" needs an explicit extension (.ts, .tsx, .css, .json, .mjs). ' +
            'Node runs these modules directly under type stripping.',
        },
      },
      create(context) {
        const check = (source) => {
          if (!source || typeof source.value !== 'string') return
          const value = source.value
          if (!value.startsWith('.')) return
          if (RELATIVE_WITH_EXTENSION.test(value)) return
          context.report({ node: source, messageId: 'missing', data: { source: value } })
        }
        return {
          ImportDeclaration: (node) => check(node.source),
          ExportNamedDeclaration: (node) => check(node.source),
          ExportAllDeclaration: (node) => check(node.source),
          ImportExpression: (node) => check(node.source),
        }
      },
    },
  },
}

export default tseslint.config(
  { ignores: ['dist', 'dist-ssr', 'public', 'node_modules', 'docs'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: browserGlobals,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      local: localPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'local/relative-import-extension': 'error',
    },
  },
  {
    // Web Worker entry points and everything they own.
    files: ['src/workers/**/*.ts'],
    languageOptions: { globals: { ...browserGlobals, ...workerGlobals } },
  },
  {
    // The server entry exports plain functions (render, buildAgentFiles); there is no fast refresh on the server.
    files: ['src/prerender/entry-server.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Build scripts and Node-run tests.
    files: ['scripts/**/*.{mjs,ts}', 'vite.config.ts', 'src/**/*.test.ts'],
    languageOptions: { ecmaVersion: 2023, globals: { ...nodeGlobals, ...browserGlobals } },
  },
  {
    // The CSP spike's page and worker run in a browser, not in Node.
    files: ['scripts/csp-spike/main.mjs', 'scripts/csp-spike/worker.mjs'],
    languageOptions: { globals: { ...browserGlobals, ...workerGlobals } },
  },
  {
    files: ['scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: nodeGlobals },
    plugins: { local: localPlugin },
    rules: { 'local/relative-import-extension': 'error' },
  },
)
