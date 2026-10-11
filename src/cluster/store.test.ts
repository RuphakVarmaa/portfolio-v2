import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { useClusterState, useJobsInFlight, useQuorum, useServicePhase, useTierInfo } from './store.ts'
import { useTelemetry } from './telemetry.ts'
import { derivePreferences, STORAGE_KEYS, type PreferenceInputs } from '../components/shell/preferences-store.ts'

/** Render a hook on the server and return its value as text. No DOM exists here, which is the point. */
function serverRender(read: () => unknown): string {
  function Probe() {
    return createElement('span', null, JSON.stringify(read()))
  }
  return renderToString(createElement(Probe)).replace(/<[^>]+>/g, '').replaceAll('&quot;', '"')
}

test('on the server every cluster hook returns its empty snapshot, so the prerendered HTML is deterministic', () => {
  assert.equal(serverRender(() => useClusterState((s) => Object.keys(s.nodes).length)), '0')
  assert.equal(serverRender(() => useClusterState((s) => s.lastEvent)), '')
  assert.equal(serverRender(() => useClusterState((s) => s.queue.length)), '0')
  const quorum = JSON.parse(serverRender(() => useQuorum()))
  assert.deepEqual(
    { term: quorum.term, nodes: quorum.nodes, isLeader: quorum.isLeader, leaderId: quorum.leaderId, supported: quorum.supported },
    { term: 0, nodes: 1, isLeader: false, leaderId: null, supported: true },
  )
  const tier = JSON.parse(serverRender(() => useTierInfo()))
  assert.equal(tier.tier, 'full')
  const telemetry = JSON.parse(serverRender(() => useTelemetry()))
  assert.deepEqual({ fcp: telemetry.fcp, lcp: telemetry.lcp, frames: telemetry.frames.fps }, { fcp: null, lcp: null, frames: 0 })
})

test('on the server every service is on standby with nothing in flight', () => {
  assert.equal(serverRender(() => useServicePhase('vision')), '"standby"')
  assert.equal(serverRender(() => useServicePhase('policy')), '"standby"')
  assert.equal(serverRender(() => useJobsInFlight('policy')), '0')
})

test('selectors that build a fresh object each call still render (shallow-compared, no loop)', () => {
  assert.equal(serverRender(() => useClusterState((s) => ({ n: Object.keys(s.nodes).length }))), '{"n":0}')
})

const base: PreferenceInputs = {
  theme: 'light',
  motionChoice: 'full',
  machineChoice: 'on',
  plain: true,
  depth: '30s',
  sound: false,
  reduce: false,
  basic: false,
}

test('preferences: the system overrides the visitor where it must (reduced motion, Basic tier), and says so', () => {
  const normal = derivePreferences(base)
  assert.deepEqual(
    { motion: normal.motion, lite: normal.motionLite, forced: normal.motionForced, machine: normal.machine, machineForced: normal.machineForced },
    { motion: 'full', lite: false, forced: false, machine: 'on', machineForced: false },
  )
  const reduced = derivePreferences({ ...base, reduce: true })
  assert.deepEqual({ motion: reduced.motion, forced: reduced.motionForced, machine: reduced.machine }, { motion: 'lite', forced: true, machine: 'on' }, 'reduced motion does NOT skip the machine (spec 4.0/4.1)')
  assert.equal(derivePreferences({ ...base, motionChoice: 'lite' }).motion, 'lite')
  assert.equal(derivePreferences({ ...base, motionChoice: 'lite' }).motionForced, false)
  const basic = derivePreferences({ ...base, basic: true })
  assert.deepEqual({ machine: basic.machine, off: basic.machineOff, forced: basic.machineForced }, { machine: 'off', off: true, forced: true })
  assert.equal(derivePreferences({ ...base, machineChoice: 'off' }).machineForced, false)
})

test('preference storage keys are the documented ones (ruphak-theme is unchanged from v2)', () => {
  assert.deepEqual(STORAGE_KEYS, {
    theme: 'ruphak-theme',
    motion: 'ruphak-motion',
    machine: 'ruphak-machine',
    plain: 'ruphak-plain',
    depth: 'ruphak-depth',
  })
})
