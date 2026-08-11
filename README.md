# Ruphak Varmaa S - Portfolio

A cinematic, evidence-led developer portfolio built from Ruphak's resume. The experience combines semantic HTML, a responsive React interface, a native WebGL hero, and a single GSAP-driven project narrative.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

## Production

```bash
pnpm check
pnpm build
pnpm preview
```

The deployable static site is generated in `dist/`. It can be deployed to Vercel, Netlify, Cloudflare Pages, or any static host. Use `pnpm build` as the build command and `dist` as the output directory.

## Content and experience

- Resume-derived content lives in `src/data/portfolio.ts`.
- The React Three Fiber hero is isolated in `src/components/HeroScene.tsx` and loaded separately from the core page.
- The horizontal project story is in `src/components/ProjectReel.tsx`.
- Theme and motion preferences persist locally. Lite motion disables the pinned sequence and reduces GPU work.
- The downloadable resume is `public/Ruphak-Varmaa-Resume.pdf`.

## Quality checks

```bash
pnpm lint
pnpm build
```

The interface includes reduced-motion behavior, keyboard-operable controls and dialog, visible focus states, responsive fallbacks, semantic project content outside the canvas, and capped WebGL pixel density.
