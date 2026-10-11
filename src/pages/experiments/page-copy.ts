/**
 * The words on the /experiments/ page itself: the eyebrow, the index, each bench's plain caption and the two
 * owner tools' titles. This part is in the initial bundle (the page frame is prerendered), so it is kept
 * apart from `tools-copy.ts`, which holds the labels inside each piece and loads with the piece.
 *
 * The titles and one-line descriptions of the four visitor pieces come from `copy.experiments.items`.
 *
 * SPEC-GAP: spec prose normally lives in src/data/copy.ts. `copy.experiments.items` has only the four
 * visitor pieces (trace, peers, index, meter) and one sentence each, so the two owner tools (parity export,
 * OG render), every plain caption and the control labels are kept in this folder. If the owner wants a single
 * place for every word, move these two objects into `copy.experiments` and delete the files. Nothing here is
 * a number, a result or a claim about this visitor's machine: results are measured and printed by the pieces.
 */
export const page = {
  eyebrow: 'LAB BENCH',
  navLabel: 'The pieces on this page',
  benchLabel: (n: number) => `BENCH ${String(n).padStart(2, '0')}`,
  fallback: 'This piece runs live in your browser and needs JavaScript.',
  live: 'LIVE',
  ownerTool: 'OWNER TOOL',
  operatorEarned: 'You earned this in the Chaos Lab.',

  owner: {
    parity: {
      title: 'Parity fixture export',
      text: 'Embeds five fixed sentences with the in-browser encoder and saves the vectors it produced, so a Node test can check that the browser and the build agree.',
      plain: 'This one is for whoever builds the site, not for visitors. It needs the embedding model, which has to be added to the project first.',
    },
    og: {
      title: 'Social card render',
      text: 'Draws the 1200 × 630 card that link previews show, from the same hand-drawn parts as the board, and saves it as a PNG.',
      plain: 'Also for whoever builds the site. It makes the picture people see when the link is shared; nothing is uploaded anywhere.',
    },
  },

  plain: {
    trace: 'Each bar is one job running on one worker. A hatched bar with a cross means the worker was unplugged while it was working. The red line measures how long that job took to finish somewhere else.',
    peers: 'Every open tab of this site is a node. They talk through the browser, choose one leader with a lock, and drop any tab that goes quiet.',
    index: 'The search index is a list of words and, for each word, the chunks of this page that contain it. Rarer words count for more. Ask a question to see which chunk wins and why.',
    meter: 'The dials on this site are all the same part. Move a slider and the needle follows, with a small overshoot, like a real meter.',
  },
} as const
