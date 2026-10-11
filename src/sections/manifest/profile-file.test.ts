import assert from 'node:assert/strict'
import { test } from 'node:test'
import { skillLines } from '../../data/copy.ts'
import { skillGroups } from '../../data/portfolio.ts'
import { buildAgentFiles } from '../../prerender/agent-files.ts'
import { emptyBuildInfo } from '../../prerender/build-info.ts'
import { fetchProfile, readSkillGroups, skillLinesFrom, utf8Bytes } from './profile-file.ts'

const { profileJson } = buildAgentFiles({ ...emptyBuildInfo(), builtAt: '2026-10-11T00:00:00.000Z' })

const respond = (body: string, status = 200) => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body })

test('skill lines built from the fetched groups are the same sentences copy.ts builds from the data', () => {
  assert.deepEqual(skillLinesFrom(skillGroups), skillLines())
  const fromFile = readSkillGroups(JSON.parse(profileJson))
  assert.ok(fromFile)
  assert.deepEqual(skillLinesFrom(fromFile), skillLines())
})

test('a real profile.json is fetched, validated, and measured (bytes are UTF-8, ms come from the clock)', async () => {
  const ticks = [100, 106.5]
  const result = await fetchProfile({ fetch: respond(profileJson), now: () => ticks.shift() ?? 0 })
  assert.ok(result)
  assert.equal(result.text, profileJson)
  assert.equal(result.status, 200)
  assert.equal(result.ms, 6.5)
  assert.equal(result.bytes, utf8Bytes(profileJson))
  assert.ok(result.bytes > profileJson.length - 1, 'multi-byte characters count more than one byte')
  assert.equal(result.skillGroups.length, skillGroups.length)
})

test('HTML (what a dev server answers for an unknown path), a 404, bad JSON and the wrong shape all give null', async () => {
  assert.equal(await fetchProfile({ fetch: respond('<!doctype html><html></html>') }), null)
  assert.equal(await fetchProfile({ fetch: respond('{"skillGroups":[]}', 404) }), null)
  assert.equal(await fetchProfile({ fetch: respond('{"nope":1}') }), null)
  assert.equal(await fetchProfile({ fetch: respond('{"skillGroups":[{"label":1,"items":[]}]}') }), null)
  assert.equal(await fetchProfile({ fetch: respond('{"skillGroups":[{"label":"A","items":[1]}]}') }), null)
  assert.equal(await fetchProfile({ fetch: respond('{"skillGroups":[]}') }), null)
  assert.equal(await fetchProfile({ fetch: async () => { throw new Error('offline') } }), null)
})

test('utf8Bytes counts bytes, not characters', () => {
  assert.equal(utf8Bytes('abc'), 3)
  assert.equal(utf8Bytes('é'), 2)
  assert.equal(utf8Bytes('—'), 3)
})
