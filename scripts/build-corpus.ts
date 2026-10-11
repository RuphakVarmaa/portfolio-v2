// PLACEHOLDER from F (foundation). Owned by S2 after F merges: replace with the real corpus builder
// (spec 6.6: flatten the page's text, 256-wordpiece windows with stride 192, deterministic output).
// Until then it writes a valid, empty corpus so `pnpm dev` and `pnpm build` run and retrieval has
// nothing to search (the panel says so honestly).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const flag = process.argv.indexOf('--out')
const out = resolve(flag > 0 ? process.argv[flag + 1] : 'public/retrieval')
mkdirSync(out, { recursive: true })
const corpus = { model: 'bm25+minilm', window: 256, overlap: 64, chunks: [] as unknown[] }
writeFileSync(join(out, 'corpus.json'), JSON.stringify(corpus) + '\n')
console.log(`build-corpus: wrote ${join(out, 'corpus.json')} (placeholder, 0 chunks)`)
