import assert from 'node:assert/strict'
import { test } from 'node:test'
import { profile } from '../../data/portfolio.ts'
import { leaksPhone, phoneDigitForms } from './phone-guard.ts'

/** Every spelling is derived from the data: the number is never typed into a test. */
const all = profile.phone.replace(/\D/g, '')
const national = all.slice(-10)
const group = (digits: string, ...sizes: number[]): string[] => {
  const out: string[] = []
  let at = 0
  for (const size of sizes) {
    out.push(digits.slice(at, at + size))
    at += size
  }
  return out
}

test('a number is looked for as dialled with its country code and as dialled without it', () => {
  assert.deepEqual(phoneDigitForms(profile.phone), [all, national])
  assert.equal(national.length, 10)
  assert.ok(all.endsWith(national) && all.length > national.length, 'the data file has the country code')
  // A national number has one form; a fragment too short to search for has none.
  assert.deepEqual(phoneDigitForms('(770) 835-8305'), ['7708358305'])
  assert.deepEqual(phoneDigitForms('12345'), [])
  assert.deepEqual(phoneDigitForms(''), [])
})

test('every way a template could print the number is found, with and without the country code', () => {
  const [a, b] = group(national, 5, 5)
  const [x, y, z] = group(national, 3, 3, 4)
  const spellings = [
    profile.phone,
    profile.phone.replaceAll(' ', ''),
    all,
    `+${all}`,
    `tel:+${all}`,
    national,
    `${a} ${b}`,
    `0${a} ${b}`, // with a trunk zero, as a national number is often written
    `${a}-${b}`,
    `(${x}) ${y}-${z}`,
    `${x}.${y}.${z}`,
    `+91 (${x}) ${y} ${z}`,
    `${x}\u00a0${y}\u00a0${z}`, // no-break spaces
    `"phone": "${profile.phone}"`,
    `<a href="tel:${national}">${a} ${b}</a>`,
  ]
  for (const spelling of spellings) assert.ok(leaksPhone(`Call ${spelling} any time.`, profile.phone), `not found: ${spelling}`)
  assert.ok(leaksPhone(`line one\nline two ${national}`, profile.phone), 'inside a longer text')
})

test('numbers that are not the phone number are not mistaken for it', () => {
  const wrong = national.slice(0, -1) + String((Number(national.at(-1)) + 1) % 10)
  const clean = [
    '',
    'No number here, only prose and the years 2024 - 2028 and 2026.',
    `${wrong}`, // one digit different
    `${wrong.slice(0, 5)} ${wrong.slice(5)}`,
    `{"start":${national.slice(0, 4)},"end":${national.slice(4)}}`, // two numbers of a data file side by side
    `${national.slice(0, 5)}x${national.slice(5)}`, // a letter in the middle is not skipped
    '1850 rating, 400+ problems, 8.5/10, 120ms, 87%, 100K token corpora, 340ms',
  ]
  for (const text of clean) assert.ok(!leaksPhone(text, profile.phone), `mistaken for the number: ${text}`)
  assert.ok(!leaksPhone(`Call ${national}`, ''), 'with no number to guard there is nothing to find')
})
