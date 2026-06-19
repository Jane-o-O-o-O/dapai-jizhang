const crypto = require('crypto')
const express = require('express')
const db = require('./db')

const app = express()
const port = Number(process.env.PORT || 3000)

app.use(express.json({ limit: '1mb' }))

function now() {
  return Date.now()
}

function genId() {
  if (crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '')
  return crypto.randomBytes(16).toString('hex')
}

function createRoomName() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 100; attempt++) {
    let name = ''
    for (let i = 0; i < 5; i++) {
      name += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    const exists = db.prepare('SELECT id FROM rooms WHERE name = ?').get(name)
    if (!exists) return name
  }
  throw new Error('Unable to generate unique room name')
}

function readRoomRow(row) {
  if (!row) return null
  return JSON.parse(row.data)
}

function saveRoom(room) {
  const payload = JSON.stringify(room)
  db.prepare(`
    INSERT INTO rooms (id, name, status, data, created_at, updated_at, finished_at)
    VALUES (@id, @name, @status, @data, @createdAt, @updatedAt, @finishedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      status = excluded.status,
      data = excluded.data,
      updated_at = excluded.updated_at,
      finished_at = excluded.finished_at
  `).run({
    id: room.id,
    name: room.name,
    status: room.status,
    data: payload,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    finishedAt: room.finishedAt || 0
  })
  return room
}

function getRoomById(id) {
  return readRoomRow(db.prepare('SELECT data FROM rooms WHERE id = ?').get(id))
}

function summarizeRoom(room) {
  return {
    id: room.id,
    name: room.name,
    players: room.players || [],
    status: room.status,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    finishedAt: room.finishedAt || 0
  }
}

function saveHistory(game) {
  db.prepare(`
    INSERT INTO histories (id, data, created_at, updated_at, finished_at)
    VALUES (@id, @data, @createdAt, @updatedAt, @finishedAt)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at,
      finished_at = excluded.finished_at
  `).run({
    id: game.id,
    data: JSON.stringify(game),
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    finishedAt: game.finishedAt
  })
  return game
}

function requireRoom(req, res) {
  const room = getRoomById(req.params.id)
  if (!room) {
    res.status(404).json({ error: 'room_not_found' })
    return null
  }
  return room
}

function computeSettlement(players) {
  const debtors = []
  const creditors = []

  for (const player of players || []) {
    if (player.score < 0) debtors.push({ id: player.id, name: player.name, amount: -player.score })
    if (player.score > 0) creditors.push({ id: player.id, name: player.name, amount: player.score })
  }

  debtors.sort((a, b) => b.amount - a.amount)
  creditors.sort((a, b) => b.amount - a.amount)

  const settlementList = []
  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount)
    if (amount > 0) {
      settlementList.push({
        from: debtors[i].name,
        to: creditors[j].name,
        amount
      })
    }

    debtors[i].amount -= amount
    creditors[j].amount -= amount

    if (debtors[i].amount === 0) i++
    if (creditors[j].amount === 0) j++
  }

  return settlementList
}

app.get('/health', function (_req, res) {
  res.json({ ok: true, time: now() })
})

app.post('/api/auth/wechat', async function (req, res, next) {
  try {
    const code = String(req.body.code || '').trim()
    const nickname = String(req.body.nickname || '').trim()
    const avatarUrl = String(req.body.avatarUrl || '').trim()
    const appid = process.env.WECHAT_APPID
    const secret = process.env.WECHAT_SECRET

    if (!code) return res.status(400).json({ error: 'code_required' })
    if (!appid || !secret) return res.status(500).json({ error: 'wechat_env_missing' })

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session')
    url.searchParams.set('appid', appid)
    url.searchParams.set('secret', secret)
    url.searchParams.set('js_code', code)
    url.searchParams.set('grant_type', 'authorization_code')

    const response = await fetch(url)
    const result = await response.json()
    if (!result.openid) return res.status(502).json({ error: 'wechat_login_failed', detail: result })

    const timestamp = now()
    db.prepare(`
      INSERT INTO users (openid, nickname, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(openid) DO UPDATE SET
        nickname = excluded.nickname,
        avatar_url = excluded.avatar_url,
        updated_at = excluded.updated_at
    `).run(result.openid, nickname, avatarUrl, timestamp, timestamp)

    res.json({
      openid: result.openid,
      user: {
        openid: result.openid,
        nickname,
        avatarUrl
      }
    })
  } catch (err) {
    next(err)
  }
})

app.get('/api/rooms', function (req, res) {
  const status = String(req.query.status || '').trim()
  const rows = status
    ? db.prepare('SELECT data FROM rooms WHERE status = ? ORDER BY updated_at DESC').all(status)
    : db.prepare('SELECT data FROM rooms ORDER BY updated_at DESC').all()
  res.json({ rooms: rows.map(readRoomRow).map(summarizeRoom) })
})

app.post('/api/rooms', function (req, res, next) {
  try {
    const owner = req.body.owner || {}
    const ownerName = String(owner.name || owner.nickname || '').trim()
    const avatarUrl = String(owner.avatarUrl || '').trim()

    if (!ownerName) return res.status(400).json({ error: 'owner_name_required' })

    const timestamp = now()
    const room = {
      id: genId(),
      name: createRoomName(),
      players: [
        { id: genId(), name: ownerName, avatarUrl, score: 0, openid: owner.openid || '' },
        { id: genId(), name: '茶水', avatarUrl: '', score: 0, openid: '' }
      ],
      rounds: [],
      status: 'playing',
      createdAt: timestamp,
      updatedAt: timestamp
    }

    saveRoom(room)
    res.status(201).json({ room })
  } catch (err) {
    next(err)
  }
})

app.get('/api/rooms/by-code/:code', function (req, res) {
  const code = String(req.params.code || '').trim().toUpperCase()
  const room = readRoomRow(db.prepare('SELECT data FROM rooms WHERE UPPER(name) = ?').get(code))
  if (!room) return res.status(404).json({ error: 'room_not_found' })
  res.json({ room })
})

app.get('/api/rooms/:id', function (req, res) {
  const room = requireRoom(req, res)
  if (!room) return
  res.json({ room })
})

app.put('/api/rooms/:id/owner-profile', function (req, res) {
  const room = requireRoom(req, res)
  if (!room) return

  const profile = req.body.profile || {}
  const owner = room.players && room.players[0]
  if (!owner) return res.status(400).json({ error: 'owner_missing' })

  if (profile.nickname) owner.name = String(profile.nickname).trim()
  if (profile.avatarUrl) owner.avatarUrl = String(profile.avatarUrl).trim()
  room.updatedAt = now()
  saveRoom(room)

  res.json({ room })
})

app.post('/api/rooms/:id/players', function (req, res) {
  const room = requireRoom(req, res)
  if (!room) return

  const name = String(req.body.name || '').trim()
  const avatarUrl = String(req.body.avatarUrl || '').trim()
  if (!name) return res.status(400).json({ error: 'player_name_required' })

  const existing = room.players.find(player => player.name === name)
  if (existing) return res.json({ room, player: existing })

  const player = { id: genId(), name, avatarUrl, score: 0, openid: req.body.openid || '' }
  const teaIndex = room.players.findIndex(item => item.name === '茶水')
  if (teaIndex >= 0) room.players.splice(teaIndex, 0, player)
  else room.players.push(player)

  room.updatedAt = now()
  saveRoom(room)
  res.status(201).json({ room, player })
})

app.post('/api/rooms/:id/rounds', function (req, res) {
  const room = requireRoom(req, res)
  if (!room) return

  const sourceId = String(req.body.sourceId || '').trim()
  const targetId = String(req.body.targetId || '').trim()
  const amount = Number.parseInt(req.body.amount, 10)

  if (!sourceId || !targetId) return res.status(400).json({ error: 'source_and_target_required' })
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount_invalid' })

  const source = room.players.find(player => player.id === sourceId)
  const target = room.players.find(player => player.id === targetId)
  if (!source || !target) return res.status(404).json({ error: 'player_not_found' })

  const scores = {}
  scores[sourceId] = -amount
  scores[targetId] = amount

  const round = {
    id: genId(),
    scores,
    note: source.name + ' -> ' + target.name,
    amount,
    createdAt: now()
  }

  room.rounds.push(round)
  source.score -= amount
  target.score += amount
  room.updatedAt = now()

  saveRoom(room)
  res.status(201).json({ room, round })
})

app.delete('/api/rooms/:id/rounds/:roundId', function (req, res) {
  const room = requireRoom(req, res)
  if (!room) return

  const round = room.rounds.find(item => item.id === req.params.roundId)
  if (!round) return res.status(404).json({ error: 'round_not_found' })

  for (const player of room.players) {
    const delta = round.scores[player.id]
    if (delta !== undefined) player.score -= delta
  }

  room.rounds = room.rounds.filter(item => item.id !== req.params.roundId)
  room.updatedAt = now()
  saveRoom(room)

  res.json({ room })
})

app.post('/api/rooms/:id/settlement', function (req, res) {
  const room = requireRoom(req, res)
  if (!room) return
  res.json({ settlementList: computeSettlement(room.players) })
})

app.post('/api/rooms/:id/finish', function (req, res) {
  const room = requireRoom(req, res)
  if (!room) return

  room.status = 'finished'
  room.finishedAt = now()
  room.updatedAt = room.finishedAt
  saveRoom(room)

  const game = {
    id: room.id,
    typeName: room.name || '房间',
    players: room.players.map(player => ({ id: player.id, name: player.name })),
    rounds: room.rounds,
    baseScore: 1,
    location: '',
    note: '',
    status: 'finished',
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    finishedAt: room.finishedAt
  }
  saveHistory(game)

  res.json({ room, game })
})

app.get('/api/histories', function (_req, res) {
  const rows = db.prepare('SELECT data FROM histories ORDER BY finished_at DESC').all()
  res.json({ histories: rows.map(row => JSON.parse(row.data)) })
})

app.get('/api/histories/:id', function (req, res) {
  const row = db.prepare('SELECT data FROM histories WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'history_not_found' })
  res.json({ history: JSON.parse(row.data) })
})

app.use(function (err, _req, res, _next) {
  console.error(err)
  res.status(500).json({ error: 'internal_error' })
})

app.listen(port, function () {
  console.log('dapai-jizhang server listening on :' + port)
})
