import type { AudioApi } from '../../cluster/audio.ts'
import type { Quorum } from '../../cluster/quorum.ts'
import type { Scheduler } from '../../cluster/scheduler.ts'
import { createLeaderWatch } from './leader-watch.ts'

/**
 * What the sound switch listens to (spec 4.7). The synth lives in src/cluster/audio.ts; this file says
 * WHEN it speaks, and only ever in response to something that really happened:
 *
 *   click     one relay click per protocol message between the control plane and a worker (the same
 *             `scheduler.onMessage` that throws the relay on the board; never ping/pong, so an idle
 *             system is silent)
 *   hum       55 Hz while THIS tab holds the leader lock
 *   failover  the descending two-tone when a leader is lost and replaced, and when a retried job
 *             recovers after a worker was unplugged
 *
 * Nothing here runs while sound is off: the listeners are attached when `audio.setEnabled(true)` is
 * called and detached when it is turned off. A hidden tab is silent (a hum from a background tab is a
 * nuisance), and comes back when the tab does. No file is played and nothing touches the network.
 */

export interface SoundDeps {
  audio: Pick<AudioApi, 'click' | 'humStart' | 'humStop' | 'failover' | 'getState' | 'subscribe'>
  scheduler: Pick<Scheduler, 'onMessage' | 'subscribe' | 'getState'>
  quorum: Pick<Quorum, 'subscribe' | 'getState'>
  visibility: { isVisible(): boolean; subscribe(listener: () => void): () => void }
  now: () => number
}

/** Attach the wiring. Returns a function that removes everything (and stops the hum). */
export function attachSoundWiring(deps: SoundDeps): () => void {
  const { audio, scheduler, quorum, visibility } = deps
  let engaged: (() => void) | null = null

  const engage = () => {
    const releases: Array<() => void> = []
    const watch = createLeaderWatch(deps.now)
    let lastRecovery = scheduler.getState().recovery

    const syncHum = () => {
      const want = audio.getState().unlocked && quorum.getState().isLeader && visibility.isVisible()
      if (want) audio.humStart()
      else audio.humStop()
    }

    releases.push(
      scheduler.onMessage(() => {
        if (visibility.isVisible()) audio.click()
      }),
      scheduler.subscribe(() => {
        const recovery = scheduler.getState().recovery
        if (recovery === lastRecovery) return
        lastRecovery = recovery
        if (recovery && visibility.isVisible()) audio.failover()
      }),
      quorum.subscribe(() => {
        const state = quorum.getState()
        const events = watch.observe({ selfId: state.nodeId, leaderId: state.leaderId, term: state.term })
        if (events.some((event) => event.type === 'elected') && visibility.isVisible()) audio.failover()
        syncHum()
      }),
      visibility.subscribe(syncHum),
    )
    // Seed the leader watch with the current state so the first real change is compared against it.
    const now = quorum.getState()
    watch.observe({ selfId: now.nodeId, leaderId: now.leaderId, term: now.term })
    syncHum()

    return () => {
      for (const release of releases) release()
      audio.humStop()
    }
  }

  const follow = () => {
    const { enabled, unlocked } = audio.getState()
    if (enabled && engaged === null) engaged = engage()
    else if (!enabled && engaged !== null) {
      engaged()
      engaged = null
    } else if (enabled && unlocked && engaged !== null) {
      // The context just started running (a gesture unlocked it): the hum may now be due.
      const state = quorum.getState()
      if (state.isLeader && visibility.isVisible()) audio.humStart()
    }
  }

  const stopFollowing = audio.subscribe(follow)
  follow()

  return () => {
    stopFollowing()
    engaged?.()
    engaged = null
  }
}
