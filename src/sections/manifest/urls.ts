/**
 * The three addresses the Manifest section lets a visitor copy (spec 3.6). Plain data, no DOM, so the
 * agent-files test can check that this build really publishes each of them.
 *
 * `id` matches the keys of `copy.manifest.copy` (`profile`, `llms`, `resume`), which hold the button labels.
 */
export const AGENT_URLS = [
  { id: 'profile', path: '/profile.json' },
  { id: 'llms', path: '/llms.txt' },
  { id: 'resume', path: '/resume/' },
] as const

export type AgentUrlId = (typeof AGENT_URLS)[number]['id']

/** The file the section is rendered from and the agent view prints. */
export const PROFILE_PATH = AGENT_URLS[0].path
