/**
 * The three experiment names (spec 3.4: `1. **Pull the plug**`, `2. **Open me in another tab**`,
 * `3. **Close the leader**`). Kept in their own tiny module because the prerendered fallback needs them
 * and everything else about the lab is loaded lazily.
 *
 * SPEC-GAP: these names are in the spec but not in `copy.chaos.experiments`; if the owner wants one place
 * for every word, move them there and delete this file.
 */
export const titles = {
  plug: 'Pull the plug',
  tab: 'Open me in another tab',
  leader: 'Close the leader',
} as const
