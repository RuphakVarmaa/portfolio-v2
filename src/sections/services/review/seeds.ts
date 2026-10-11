/**
 * The three seeded diffs for the review demo (spec 6.9). Each is real, runnable-looking JavaScript written so
 * that it trips several rules across several tiers, and each parses as plain JavaScript so the AST pass runs
 * (acorn does not read JSX, so `profile-card.jsx` builds its markup with the DOM, not with JSX syntax).
 *
 * They are shown as a diff: the analysed source is treated as one added hunk. Line numbers in the findings
 * are the line numbers in these strings (the tests pin them).
 *
 * Plain TypeScript with no DOM or React, so the unit tests import it. Filenames match
 * `copy.services.review.demo.seeds`.
 */

export interface Seed {
  filename: string
  source: string
}

export const SEEDS: readonly Seed[] = [
  {
    filename: 'express-route.js',
    source: `// routes/users.js: look a user up and export their files
const express = require('express')
const { execSync } = require('child_process')
const db = require('../db')

var router = express.Router()

// TODO: move the SQL into a repository module
router.get('/users/:name', async (req, res) => {
  var name = req.params.name
  const rows = await db.query("SELECT id, email FROM users WHERE name = '" + req.params.name + "'")
  console.log('lookup', name, rows.length)
  res.json(rows)
})

router.post('/users/:id/export', (req, res) => {
  const options = JSON.parse(JSON.stringify(req.body))
  const archive = execSync(\`tar -czf /tmp/\${req.params.id}.tgz \${options.folder}\`)
  res.send(archive)
})

module.exports = router
`,
  },
  {
    filename: 'async-worker.js',
    source: `// worker.js: sync a batch of orders to the warehouse, then report what changed
import { saveOrderAsync, fetchStock, notify } from './warehouse.js'

// TODO: batch these calls once the warehouse API supports it
export async function syncOrders(orders, known) {
  const fresh = []
  for (const order of orders) {
    for (const id of order.itemIds) {
      if (known.indexOf(id) === -1) {
        fresh.push(id)
      }
    }
  }

  for (const id of fresh) {
    const stock = await fetchStock(id)
    if (stock.count == 0) {
      notify(id)
    }
  }

  saveOrderAsync(orders[0])
  fetch('/api/sync-done', { method: 'POST' })
  return fresh.length
}
`,
  },
  {
    filename: 'profile-card.jsx',
    source: `// profile-card.jsx: build the profile card shown on the team page
export function renderProfileCard(user, theme, locale, showBadge, onSelect) {
  var card = document.createElement('div')
  card.className = 'profile-card profile-card--' + theme
  card.setAttribute('data-id', user.id)

  const header = document.createElement('header')
  header.className = 'profile-card__header'
  header.innerHTML = '<h2>' + user.name + '</h2>'
  card.appendChild(header)

  const avatar = document.createElement('img')
  avatar.className = 'profile-card__avatar'
  avatar.alt = ''
  avatar.src = user.avatarUrl || '/images/default-avatar.png'
  card.appendChild(avatar)

  const role = document.createElement('p')
  role.className = 'profile-card__role'
  if (user.role == 'admin') {
    role.textContent = 'Administrator'
  } else if (user.role == 'editor') {
    role.textContent = 'Editor'
  } else {
    role.textContent = 'Member'
  }
  card.appendChild(role)

  const joined = document.createElement('p')
  joined.className = 'profile-card__joined'
  joined.textContent = new Date(user.joinedAt).toLocaleDateString(locale, { year: 'numeric', month: 'long' })
  card.appendChild(joined)

  if (showBadge) {
    const badge = document.createElement('span')
    badge.className = 'profile-card__badge'
    badge.textContent = user.verified ? 'Verified' : 'Pending'
    card.appendChild(badge)
  }

  const links = document.createElement('ul')
  links.className = 'profile-card__links'
  for (const link of user.links || []) {
    const item = document.createElement('li')
    const anchor = document.createElement('a')
    anchor.href = link.url
    anchor.textContent = link.label
    item.appendChild(anchor)
    links.appendChild(item)
  }
  card.appendChild(links)

  const actions = document.createElement('div')
  actions.className = 'profile-card__actions'
  const select = document.createElement('button')
  select.type = 'button'
  select.textContent = 'Select'
  select.addEventListener('click', function () {
    onSelect(user)
  })
  actions.appendChild(select)
  card.appendChild(actions)

  card.addEventListener('keydown', (event) => {
    if (event.key == 'Enter') {
      onSelect(user)
    }
  })

  return card
}
`,
  },
]

export function seedByFilename(filename: string): Seed | undefined {
  return SEEDS.find((seed) => seed.filename === filename)
}
