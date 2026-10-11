import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy } from '../../data/copy.ts'
import { colophonSource, describeSource, isRepositoryUrl, splitAtLink } from './source-link.ts'

const PROFILE = 'https://github.com/RuphakVarmaa'
const REPOSITORY = 'https://github.com/RuphakVarmaa/portfolio-v2'

test('an address with an owner and a repository is a repository', () => {
  assert.equal(isRepositoryUrl(REPOSITORY), true)
  assert.equal(isRepositoryUrl(`${REPOSITORY}/`), true, 'trailing slash')
  assert.equal(isRepositoryUrl(`${REPOSITORY}.git`), true, '.git suffix')
  assert.equal(isRepositoryUrl(`${REPOSITORY}/tree/main/docs`), true, 'deeper path')
  assert.equal(isRepositoryUrl('https://gitlab.com/group/project'), true, 'not only GitHub')
})

test('an account page, a bare host and things that are not addresses are not repositories', () => {
  assert.equal(isRepositoryUrl(PROFILE), false)
  assert.equal(isRepositoryUrl(`${PROFILE}/`), false, 'trailing slash')
  assert.equal(isRepositoryUrl(`${PROFILE}?tab=repositories`), false, 'a query is not a path segment')
  assert.equal(isRepositoryUrl(`${PROFILE}#readme`), false, 'a fragment is not a path segment')
  assert.equal(isRepositoryUrl('https://github.com/'), false)
  assert.equal(isRepositoryUrl('https://github.com'), false)
  assert.equal(isRepositoryUrl(''), false)
  assert.equal(isRepositoryUrl('github.com/a/b'), false, 'no scheme: not parseable as an address')
  assert.equal(isRepositoryUrl('mailto:ruphakv@gmail.com'), false)
  assert.equal(isRepositoryUrl('javascript:/a/b'), false, 'only http(s)')
})

test('a bare GitHub account page is labelled "GitHub profile", never as a repository', () => {
  assert.deepEqual(describeSource(PROFILE), { isRepository: false, label: 'GitHub profile' })
  assert.deepEqual(describeSource(`${PROFILE}/`), { isRepository: false, label: 'GitHub profile' })
  assert.deepEqual(describeSource('https://www.github.com/RuphakVarmaa'), { isRepository: false, label: 'GitHub profile' })
  assert.equal(copy.colophon.profileLabel, 'GitHub profile')
})

test('a repository keeps its address as the label', () => {
  assert.deepEqual(describeSource(REPOSITORY), { isRepository: true, label: REPOSITORY })
})

test('an account page on another host is not called a GitHub profile', () => {
  assert.deepEqual(describeSource('https://gitlab.com/RuphakVarmaa'), { isRepository: false, label: 'https://gitlab.com/RuphakVarmaa' })
  assert.deepEqual(describeSource('https://github.com/'), { isRepository: false, label: 'https://github.com/' }, 'GitHub, but no account')
  assert.deepEqual(describeSource('not an address'), { isRepository: false, label: 'not an address' }, 'unparseable text passes through')
})

test('splitAtLink cuts the sentence around the last occurrence of the link words', () => {
  assert.deepEqual(splitAtLink('see GitHub profile; source: GitHub profile.', 'GitHub profile'), {
    before: 'see GitHub profile; source: ',
    after: '.',
  })
  assert.equal(splitAtLink('no match here', 'GitHub profile'), null)
  assert.equal(splitAtLink('anything', ''), null)
})

test('the shipped copy: the label is in the sentence once, and nothing (no space) sits between it and what follows', () => {
  const source = colophonSource()
  assert.equal(source.href, copy.colophon.sourceUrl)
  assert.equal(source.label, describeSource(copy.colophon.sourceUrl).label)
  assert.equal(source.sentence.split(source.label).length - 1, 1, 'one occurrence, so the split is unambiguous')
  const parts = splitAtLink(source.sentence, source.label)
  assert.ok(parts, 'the label is found in the sentence it was put into')
  assert.doesNotMatch(parts.after, /^\s/, 'a space between the link and the full stop was the review finding')
})

test('the Making-of link ("repo README") exists exactly when the source address is a repository', () => {
  assert.equal(colophonSource().makingOfHref !== null, isRepositoryUrl(copy.colophon.sourceUrl))
})

test('with the owner\'s account page: "GitHub profile" in the sentence, no Making-of link', () => {
  const source = colophonSource({ ...copy.colophon, sourceUrl: PROFILE })
  assert.equal(source.isRepository, false)
  assert.equal(source.label, 'GitHub profile')
  assert.equal(source.href, PROFILE, 'the link still goes to the account page')
  assert.equal(source.makingOfHref, null)
  assert.ok(source.sentence.endsWith('GitHub profile.'), source.sentence)
  assert.ok(!source.sentence.includes(PROFILE), 'the address is not printed as if it were the source')
})

test('with a repository address: the address in the sentence and the Making-of link, both unchanged', () => {
  const source = colophonSource({ ...copy.colophon, sourceUrl: REPOSITORY })
  assert.equal(source.isRepository, true)
  assert.equal(source.label, REPOSITORY)
  assert.equal(source.href, REPOSITORY)
  assert.equal(source.makingOfHref, `${REPOSITORY}#readme`)
  assert.ok(source.sentence.endsWith(`${REPOSITORY}.`), source.sentence)
})

test('the profile label does not say repository, README or source', () => {
  assert.doesNotMatch(copy.colophon.profileLabel, /repo|readme|source/i)
})
