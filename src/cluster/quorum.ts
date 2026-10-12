/**
 * Quorum: open tabs of this site form a small cluster, with no server involved.
 *
 *  - discovery: tabs talk over `BroadcastChannel('ruphak-cluster')` (HELLO / HEARTBEAT / LEADER / BYE)
 *  - election: every tab queues for the exclusive Web Lock `ruphak-cluster-leader`; whoever holds it is
 *    the leader. The browser releases the lock when the holder's tab closes or crashes, and hands it to
 *    the next tab in the queue, which bumps the term and announces itself
 *  - term: a Raft-style counter. A new leader sets `term = max(known terms) + 1`, so the term only
 *    ever goes up, in every tab
 *  - peers that go quiet for 3.5 s (a suspended tab) are dropped; the lock decides who leads
 *
 * `createQuorum` takes its channel, lock manager, clock and timers as dependencies, which is how the
 * unit tests drive several "tabs" through one fake bus. `quorum` below is the browser singleton.
 */

export interface QuorumPeer {
  id: string
  /** `performance.now()` of this tab when the peer was last heard from. */
  lastSeen: number
  isLeader: boolean
}

export interface QuorumMember {
  id: string
  isSelf: boolean
  isLeader: boolean
  /** `performance.now()` when last heard from; null for this tab itself. */
  lastSeen: number | null
}

export interface QuorumState {
  /** False when BroadcastChannel or Web Locks are missing/blocked: this tab then runs as a single node. */
  supported: boolean
  /** This tab's id, e.g. `tab-k3f9`. Empty on the server. */
  nodeId: string
  /** Highest term this tab knows about. Never decreases. 0 before the quorum has started. */
  term: number
  leaderId: string | null
  isLeader: boolean
  /** The OTHER tabs. */
  peers: QuorumPeer[]
  /** 1 + peers.length (live tabs including this one). */
  nodes: number
  /** Every tab including this one (this tab first, then peers in join order). Convenience for node lamps. */
  members: QuorumMember[]
  /**
   * True when this tab started after another tab that is still here: it joined a quorum that already existed. False when it
   * was here first, or is alone. Tabs that started in the same millisecond are ordered by id, so exactly one of them is the
   * newcomer. The hero uses it to say "this tab joined" in the new tab and "that tab joined" in the old one.
   */
  newcomer: boolean
}

export interface Quorum {
  start(): void
  stop(): void
  getState(): QuorumState
  subscribe(listener: () => void): () => void
  /** Fires on every heartbeat this tab sends (1000 ms). Drives the heartbeat lamp; not a state change. */
  onHeartbeat(listener: () => void): () => void
  /** How many heartbeats this tab has sent since `start()` (a snapshot for `useSyncExternalStore` with `onHeartbeat`). */
  getHeartbeatCount(): number
  /** Opens this URL in a new tab. Returns false if the browser blocked the pop-up. */
  openSecondTab(): boolean
}

export type ClusterMessage =
  | { type: 'HELLO'; id: string; startedAt: number; term: number; leaderId: string | null }
  | { type: 'HEARTBEAT'; id: string; term: number; leaderId: string | null }
  | { type: 'LEADER'; id: string; term: number }
  | { type: 'BYE'; id: string }

export interface ChannelLike {
  postMessage(message: ClusterMessage): void
  close(): void
  onmessage: ((event: { data: unknown }) => void) | null
}

export interface LockManagerLike {
  request(
    name: string,
    options: { mode: 'exclusive'; signal?: AbortSignal },
    callback: () => Promise<unknown>,
  ): Promise<unknown>
}

export interface QuorumDeps {
  /** Return null when BroadcastChannel is unavailable. */
  createChannel: (name: string) => ChannelLike | null
  /** Return null when Web Locks are unavailable. */
  locks: LockManagerLike | null
  /** Monotonic clock (performance.now) used for heartbeat expiry. */
  now: () => number
  /** Wall clock (Date.now) used only to order tabs by when they joined, since monotonic clocks differ per tab. */
  epochNow: () => number
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (handle: unknown) => void
  nodeId: string
  /** Subscribe to the page going away / coming back from the bfcache. Returns an unsubscribe function. */
  onPageLifecycle?: (handlers: { hide: () => void; show: (persisted: boolean) => void }) => () => void
  openWindow?: () => boolean
}

export const CHANNEL_NAME = 'ruphak-cluster'
export const LOCK_NAME = 'ruphak-cluster-leader'
export const HEARTBEAT_MS = 1000
export const PEER_EXPIRY_MS = 3500

export const SERVER_QUORUM_STATE: QuorumState = Object.freeze({
  supported: true,
  nodeId: '',
  term: 0,
  leaderId: null,
  isLeader: false,
  peers: [],
  nodes: 1,
  members: [],
  newcomer: false,
})

interface PeerRec {
  id: string
  lastSeen: number
  startedAt: number
}

function isMessage(data: unknown): data is ClusterMessage {
  if (typeof data !== 'object' || data === null) return false
  const m = data as Record<string, unknown>
  if (typeof m.id !== 'string') return false
  switch (m.type) {
    case 'HELLO':
      return typeof m.startedAt === 'number' && typeof m.term === 'number'
    case 'HEARTBEAT':
      return typeof m.term === 'number'
    case 'LEADER':
      return typeof m.term === 'number'
    case 'BYE':
      return true
    default:
      return false
  }
}

function shallowEqual(a: object, b: object): boolean {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
}

export function createQuorum(deps: QuorumDeps): Quorum {
  const listeners = new Set<() => void>()
  const heartbeatListeners = new Set<() => void>()
  const peers = new Map<string, PeerRec>()

  let running = false
  let supported = true
  let channel: ChannelLike | null = null
  let timer: unknown
  let term = 0
  let claim: { id: string; term: number } | null = null
  let holdsLock = false
  let releaseLock: (() => void) | null = null
  let lockAbort: AbortController | null = null
  let unsubscribeLifecycle: (() => void) | null = null
  let startedAt = 0
  let heartbeats = 0
  let cached: QuorumState = SERVER_QUORUM_STATE
  let dirty = true

  const send = (message: ClusterMessage) => {
    try {
      channel?.postMessage(message)
    } catch {
      /* channel closed */
    }
  }

  const leaderId = (): string | null => (holdsLock ? deps.nodeId : claim ? claim.id : null)

  // ---- snapshot ---------------------------------------------------------------------------------

  const reuse = <T extends object>(prev: readonly T[], next: T[]): T[] => {
    let same = prev.length === next.length
    next.forEach((item, i) => {
      if (prev[i] && shallowEqual(prev[i], item)) next[i] = prev[i]
      else same = false
    })
    return same ? (prev as T[]) : next
  }

  const build = (previous: QuorumState): QuorumState => {
    const lead = leaderId()
    const ordered = [...peers.values()].sort((a, b) => a.startedAt - b.startedAt || (a.id < b.id ? -1 : 1))
    const sharedPeers = reuse(
      previous.peers,
      ordered.map((peer): QuorumPeer => ({ id: peer.id, lastSeen: peer.lastSeen, isLeader: lead === peer.id })),
    )
    const members = reuse(previous.members, [
      { id: deps.nodeId, isSelf: true, isLeader: holdsLock, lastSeen: null },
      ...sharedPeers.map((peer): QuorumMember => ({ ...peer, isSelf: false })),
    ])
    const next: QuorumState = {
      supported,
      nodeId: deps.nodeId,
      term,
      leaderId: lead,
      isLeader: holdsLock,
      peers: sharedPeers,
      nodes: 1 + sharedPeers.length,
      members,
      newcomer: ordered.some((peer) => peer.startedAt < startedAt || (peer.startedAt === startedAt && peer.id < deps.nodeId)),
    }
    return shallowEqual(next, previous) ? previous : next
  }

  const getState = (): QuorumState => {
    if (dirty) {
      cached = build(cached)
      dirty = false
    }
    return cached
  }

  const notify = () => {
    dirty = true
    for (const listener of [...listeners]) listener()
  }

  // ---- protocol ---------------------------------------------------------------------------------

  const adoptTerm = (observed: number) => {
    if (observed > term) term = observed
  }

  /** A peer says `id` leads at `claimTerm`. Accept only fresh claims from peers we can see (or ourselves). */
  const considerClaim = (id: string, claimTerm: number) => {
    if (holdsLock) return
    if (id !== deps.nodeId && !peers.has(id)) return
    adoptTerm(claimTerm)
    if (!claim || claimTerm >= claim.term) claim = { id, term: claimTerm }
  }

  const touchPeer = (id: string, startedAtHint?: number): PeerRec => {
    const existing = peers.get(id)
    if (existing) {
      existing.lastSeen = deps.now()
      return existing
    }
    const created: PeerRec = { id, lastSeen: deps.now(), startedAt: startedAtHint ?? deps.epochNow() }
    peers.set(id, created)
    return created
  }

  const dropPeer = (id: string) => {
    if (!peers.delete(id)) return false
    if (claim?.id === id) claim = null
    return true
  }

  const handle = (event: { data: unknown }) => {
    const message = event.data
    if (!running || !isMessage(message) || message.id === deps.nodeId) return
    switch (message.type) {
      case 'HELLO': {
        const known = peers.has(message.id)
        touchPeer(message.id, message.startedAt)
        adoptTerm(message.term)
        if (message.leaderId) considerClaim(message.leaderId, message.term)
        if (!known) send({ type: 'HELLO', id: deps.nodeId, startedAt, term, leaderId: leaderId() })
        break
      }
      case 'HEARTBEAT': {
        touchPeer(message.id)
        adoptTerm(message.term)
        if (message.leaderId) considerClaim(message.leaderId, message.term)
        break
      }
      case 'LEADER': {
        touchPeer(message.id)
        considerClaim(message.id, message.term)
        break
      }
      case 'BYE': {
        dropPeer(message.id)
        break
      }
    }
    notify()
  }

  const becomeLeader = () => {
    holdsLock = true
    term = Math.max(term, claim?.term ?? 0) + 1
    claim = { id: deps.nodeId, term }
    send({ type: 'LEADER', id: deps.nodeId, term })
    notify()
  }

  const requestLeadership = () => {
    const locks = deps.locks
    if (!locks) return
    lockAbort = new AbortController()
    const request = locks.request(LOCK_NAME, { mode: 'exclusive', signal: lockAbort.signal }, () => {
      becomeLeader()
      // Held until this tab goes away (or stop() releases it). Never resolved on its own.
      return new Promise<void>((resolve) => {
        releaseLock = resolve
      })
    })
    request.then(
      () => undefined,
      (error: unknown) => {
        if ((error as { name?: string } | null)?.name === 'AbortError') return
        // Locks exist but are unusable here (private window, sandbox): degrade to a single node.
        downgradeToSingleNode()
      },
    )
  }

  const downgradeToSingleNode = () => {
    if (!running) return
    supported = false
    holdsLock = true
    term = Math.max(term, 1)
    claim = { id: deps.nodeId, term }
    peers.clear()
    if (timer !== undefined) deps.clearInterval(timer)
    timer = undefined
    channel?.close()
    channel = null
    notify()
  }

  const tick = () => {
    if (!running) return
    const now = deps.now()
    let changed = false
    for (const peer of [...peers.values()]) {
      if (now - peer.lastSeen > PEER_EXPIRY_MS) changed = dropPeer(peer.id) || changed
    }
    send({ type: 'HEARTBEAT', id: deps.nodeId, term, leaderId: leaderId() })
    heartbeats += 1
    for (const listener of [...heartbeatListeners]) listener()
    if (changed) notify()
  }

  const begin = () => {
    if (running) return
    running = true
    startedAt = deps.epochNow()
    peers.clear()
    claim = null
    holdsLock = false
    const created = deps.locks ? deps.createChannel(CHANNEL_NAME) : null
    if (!created || !deps.locks) {
      // Single node: this tab is the whole cluster.
      supported = false
      holdsLock = true
      term = Math.max(term, 1)
      claim = { id: deps.nodeId, term }
      notify()
      return
    }
    supported = true
    channel = created
    channel.onmessage = handle
    send({ type: 'HELLO', id: deps.nodeId, startedAt, term, leaderId: null })
    timer = deps.setInterval(tick, HEARTBEAT_MS)
    requestLeadership()
    notify()
  }

  const end = (announce: boolean) => {
    if (!running) return
    running = false
    if (announce) send({ type: 'BYE', id: deps.nodeId })
    if (timer !== undefined) deps.clearInterval(timer)
    timer = undefined
    lockAbort?.abort()
    lockAbort = null
    releaseLock?.()
    releaseLock = null
    holdsLock = false
    if (channel) {
      channel.onmessage = null
      channel.close()
    }
    channel = null
    peers.clear()
    claim = null
    notify()
  }

  return {
    start() {
      if (running) return
      begin()
      if (!unsubscribeLifecycle && deps.onPageLifecycle) {
        unsubscribeLifecycle = deps.onPageLifecycle({
          hide: () => end(true),
          show: (persisted) => {
            if (persisted) begin()
          },
        })
      }
    },
    stop() {
      end(true)
      unsubscribeLifecycle?.()
      unsubscribeLifecycle = null
    },
    getState,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onHeartbeat(listener) {
      heartbeatListeners.add(listener)
      return () => {
        heartbeatListeners.delete(listener)
      }
    },
    getHeartbeatCount: () => heartbeats,
    openSecondTab() {
      return deps.openWindow ? deps.openWindow() : false
    },
  }
}

// ---- browser singleton ----------------------------------------------------------------------------

function randomId(): string {
  const bytes = new Uint8Array(3)
  crypto.getRandomValues(bytes)
  return `tab-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 4)}`
}

function browserDeps(): QuorumDeps {
  const hasChannel = typeof BroadcastChannel !== 'undefined'
  const hasLocks = typeof navigator !== 'undefined' && 'locks' in navigator && !!navigator.locks
  return {
    createChannel: (name) => {
      if (!hasChannel) return null
      try {
        return new BroadcastChannel(name) as unknown as ChannelLike
      } catch {
        return null
      }
    },
    locks: hasLocks ? (navigator.locks as unknown as LockManagerLike) : null,
    now: () => performance.now(),
    epochNow: () => Date.now(),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    nodeId: randomId(),
    onPageLifecycle: ({ hide, show }) => {
      const onHide = () => hide()
      const onShow = (event: PageTransitionEvent) => show(event.persisted)
      window.addEventListener('pagehide', onHide)
      window.addEventListener('pageshow', onShow)
      return () => {
        window.removeEventListener('pagehide', onHide)
        window.removeEventListener('pageshow', onShow)
      }
    },
    openWindow: () => {
      // `window.open(url, '_blank', 'noopener')` always returns null, which would make a pop-up blocker
      // indistinguishable from success. Open normally, then cut the opener link by hand.
      const opened = window.open(location.href, '_blank')
      if (!opened) return false
      try {
        opened.opener = null
      } catch {
        /* cross-origin: nothing to cut */
      }
      return true
    },
  }
}

let instance: Quorum | null = null

function resolveInstance(): Quorum {
  if (!instance) instance = createQuorum(browserDeps())
  return instance
}

/**
 * The browser singleton. Created lazily so importing this module on the server (prerender) or in Node
 * (tests) touches nothing. On the server `getState()` returns the empty server snapshot.
 */
export const quorum: Quorum = {
  start: () => {
    if (typeof window === 'undefined') return
    resolveInstance().start()
  },
  stop: () => instance?.stop(),
  getState: () => (instance ? instance.getState() : SERVER_QUORUM_STATE),
  subscribe: (listener) => resolveInstance().subscribe(listener),
  onHeartbeat: (listener) => resolveInstance().onHeartbeat(listener),
  getHeartbeatCount: () => (instance ? instance.getHeartbeatCount() : 0),
  openSecondTab: () => (typeof window === 'undefined' ? false : resolveInstance().openSecondTab()),
}
