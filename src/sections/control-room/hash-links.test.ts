import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fragmentId, isPlainClick, samePageId, type LinkLike, type PageLike } from './hash-links.ts'

const page: PageLike = { origin: 'https://www.ruphak.me', pathname: '/', search: '' }
const link = (over: Partial<LinkLike> = {}): LinkLike => ({
  origin: 'https://www.ruphak.me',
  pathname: '/',
  search: '',
  hash: '#contact',
  target: '',
  download: false,
  ...over,
})
const click = (over = {}) => ({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...over })

test('fragmentId reads the id a hash names, and nothing from an empty or broken one', () => {
  assert.equal(fragmentId('#contact'), 'contact')
  assert.equal(fragmentId('#service-vision'), 'service-vision')
  assert.equal(fragmentId('#caf%C3%A9'), 'café')
  assert.equal(fragmentId(''), null)
  assert.equal(fragmentId('#'), null)
  assert.equal(fragmentId('contact'), null, 'a hash always starts with #')
  assert.equal(fragmentId('#%E0%A4%A'), null, 'a malformed escape names nothing (and must not throw)')
})

test('the rail, the hero and the service index: links to a fragment of this page are taken over', () => {
  assert.equal(samePageId(link({ hash: '#contact' }), page), 'contact', 'the hero link: href="#contact"')
  assert.equal(samePageId(link({ hash: '#services' }), page), 'services', 'the rail link: href="/#services" on the home page')
  assert.equal(samePageId(link({ hash: '#service-policy', target: '_self' }), page), 'service-policy')
})

test('everything else is the browser\'s: other pages, other origins, new tabs, downloads, no fragment', () => {
  assert.equal(samePageId(link({ pathname: '/resume/', hash: '' }), page), null, 'the résumé link')
  assert.equal(samePageId(link({ pathname: '/projects/vision/', hash: '#service-vision' }), page), null, 'another page, even with a fragment')
  assert.equal(samePageId(link({ origin: 'https://example.com', hash: '#contact' }), page), null)
  assert.equal(samePageId(link({ search: '?x=1' }), page), null, 'same path, different query: a navigation')
  assert.equal(samePageId(link({ target: '_blank' }), page), null, 'the "second tab" button')
  assert.equal(samePageId(link({ download: true, hash: '#x' }), page), null)
  assert.equal(samePageId(link({ hash: '' }), page), null)
  assert.equal(samePageId(link({ hash: '#' }), page), null)
})

test('only a plain primary click is taken over: modifier clicks open tabs and windows, and a handled click is left alone', () => {
  assert.equal(isPlainClick(click()), true)
  for (const over of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }, { defaultPrevented: true }]) {
    assert.equal(isPlainClick(click(over)), false, JSON.stringify(over))
  }
})
