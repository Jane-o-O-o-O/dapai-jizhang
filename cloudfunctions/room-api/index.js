const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const rooms = db.collection('poker_rooms')
const histories = db.collection('poker_histories')
const users = db.collection('poker_users')
let collectionsReady = false

function now() {
  return Date.now()
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function error(code, extra) {
  return Object.assign({ ok: false, error: code }, extra || {})
}

function success(data) {
  return Object.assign({ ok: true }, data || {})
}

function isCollectionExistsError(err) {
  const message = String((err && (err.errMsg || err.message)) || '')
  const lower = message.toLowerCase()
  return lower.indexOf('exist') >= 0 || lower.indexOf('already') >= 0 || message.indexOf('已存在') >= 0
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (err) {
    if (isCollectionExistsError(err)) return
    throw err
  }
}

async function ensureCollections() {
  if (collectionsReady) return
  await ensureCollection('poker_rooms')
  await ensureCollection('poker_histories')
  await ensureCollection('poker_users')
  collectionsReady = true
}

function normalizeRoom(doc) {
  if (!doc) return null
  const room = Object.assign({}, doc)
  const id = room.id || room._id
  delete room._id
  delete room._openid
  if (id) room.id = id
  return room
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

function isProfileReady(profile) {
  return !!(profile && profile.nickname && profile.avatarUrl)
}

async function getProfileByOpenid(openid) {
  if (!openid) return null

  try {
    const result = await users.doc(openid).get()
    const profile = Object.assign({}, result.data || {})
    delete profile._id
    delete profile._openid
    return profile
  } catch (err) {
    if (err && /does not exist|document.get/.test(err.errMsg || err.message || '')) {
      return null
    }
    throw err
  }
}

async function createRoomName() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < 100; attempt++) {
    let name = ''
    for (let i = 0; i < 5; i++) {
      name += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    const exists = await rooms.where({ name }).limit(1).get()
    if (!exists.data.length) return name
  }
  throw new Error('room_name_generate_failed')
}

async function getRoomById(roomId) {
  const id = String(roomId || '').trim()
  if (!id) return null

  try {
    const result = await rooms.doc(id).get()
    return normalizeRoom(result.data)
  } catch (err) {
    if (err && /does not exist|document.get/.test(err.errMsg || err.message || '')) {
      return null
    }
    throw err
  }
}

async function saveRoom(room) {
  const saved = Object.assign({}, room)
  const id = saved.id
  delete saved._id
  delete saved._openid
  await rooms.doc(id).set({ data: saved })
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

async function ping() {
  return success({
    service: 'room-api',
    time: now()
  })
}

async function createRoom(payload) {
  const wxContext = cloud.getWXContext()
  const owner = payload.owner || {}
  const ownerName = String(owner.name || owner.nickname || '').trim()
  const avatarUrl = String(owner.avatarUrl || '').trim()

  if (!ownerName) return error('owner_name_required')

  const timestamp = now()
  const id = genId()
  const room = {
    id,
    name: await createRoomName(),
    players: [
      { id: genId(), name: ownerName, avatarUrl, score: 0, openid: owner.openid || wxContext.OPENID || '' },
      { id: genId(), name: '茶水', avatarUrl: '', score: 0, openid: '' }
    ],
    rounds: [],
    status: 'playing',
    createdAt: timestamp,
    updatedAt: timestamp,
    finishedAt: 0
  }

  await rooms.doc(id).set({ data: room })
  return success({ room: normalizeRoom(room) })
}

async function getMyProfile() {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return error('openid_required')

  const profile = await getProfileByOpenid(openid)
  return success({ profile })
}

async function saveMyProfile(payload) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return error('openid_required')

  const nickname = String(payload.nickname || '').trim()
  const avatarUrl = String(payload.avatarUrl || '').trim()
  if (!nickname) return error('player_name_required')
  if (!avatarUrl) return error('player_avatar_required')

  const timestamp = now()
  const profile = {
    openid,
    nickname,
    avatarUrl,
    updatedAt: timestamp
  }

  try {
    const current = await users.doc(openid).get()
    profile.createdAt = current.data.createdAt || timestamp
  } catch (err) {
    if (!err || !/does not exist|document.get/.test(err.errMsg || err.message || '')) {
      throw err
    }
    profile.createdAt = timestamp
  }

  await users.doc(openid).set({ data: profile })
  return success({ profile })
}

async function getRoom(payload) {
  const room = await getRoomById(payload.roomId)
  if (!room) return error('room_not_found')
  return success({ room })
}

async function getRoomByCode(payload) {
  const code = String(payload.code || '').trim().toUpperCase()
  if (!code) return error('room_code_required')

  const result = await rooms.where({ name: code }).limit(1).get()
  const room = normalizeRoom(result.data[0])
  if (!room) return error('room_not_found')
  return success({ room })
}

async function listRooms(payload) {
  const status = String(payload.status || '').trim()
  let query = rooms
  if (status) query = query.where({ status })

  const result = await query.orderBy('updatedAt', 'desc').limit(50).get()
  return success({
    rooms: result.data.map(normalizeRoom).map(summarizeRoom)
  })
}

async function addPlayer(payload) {
  const wxContext = cloud.getWXContext()
  const room = await getRoomById(payload.roomId)
  if (!room) return error('room_not_found')

  const playerPayload = payload.player || {}
  const openid = String(playerPayload.openid || wxContext.OPENID || '').trim()
  if (!openid) return error('openid_required')

  const profile = await getProfileByOpenid(openid)
  if (!isProfileReady(profile)) return error('profile_required')

  const name = String(profile.nickname || playerPayload.name || '').trim()
  const avatarUrl = String(profile.avatarUrl || playerPayload.avatarUrl || '').trim()
  if (!name) return error('player_name_required')
  if (!avatarUrl) return error('player_avatar_required')

  const existing = (room.players || []).find(player => (openid && player.openid === openid) || player.name === name)
  if (existing) {
    let changed = false
    if (openid && !existing.openid) {
      existing.openid = openid
      changed = true
    }
    if (avatarUrl && existing.avatarUrl !== avatarUrl) {
      existing.avatarUrl = avatarUrl
      changed = true
    }
    if (changed) {
      room.updatedAt = now()
      await saveRoom(room)
    }
    return success({ room, player: existing })
  }

  const player = { id: genId(), name, avatarUrl, score: 0, openid }
  const players = room.players || []
  const teaIndex = players.findIndex(item => item.name === '茶水')
  if (teaIndex >= 0) players.splice(teaIndex, 0, player)
  else players.push(player)

  room.players = players
  room.updatedAt = now()
  await saveRoom(room)
  return success({ room, player })
}

async function addRound(payload) {
  const room = await getRoomById(payload.roomId)
  if (!room) return error('room_not_found')

  const sourceId = String(payload.sourceId || '').trim()
  const targetId = String(payload.targetId || '').trim()
  const amount = Number.parseInt(payload.amount, 10)

  if (!sourceId || !targetId) return error('source_and_target_required')
  if (!Number.isFinite(amount) || amount <= 0) return error('amount_invalid')

  const source = (room.players || []).find(player => player.id === sourceId)
  const target = (room.players || []).find(player => player.id === targetId)
  if (!source || !target) return error('player_not_found')

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

  room.rounds = room.rounds || []
  room.rounds.push(round)
  source.score -= amount
  target.score += amount
  room.updatedAt = now()

  await saveRoom(room)
  return success({ room, round })
}

async function deleteRound(payload) {
  const room = await getRoomById(payload.roomId)
  if (!room) return error('room_not_found')

  const roundId = String(payload.roundId || '').trim()
  const round = (room.rounds || []).find(item => item.id === roundId)
  if (!round) return error('round_not_found')

  for (const player of room.players || []) {
    const delta = round.scores[player.id]
    if (delta !== undefined) player.score -= delta
  }

  room.rounds = (room.rounds || []).filter(item => item.id !== roundId)
  room.updatedAt = now()
  await saveRoom(room)
  return success({ room })
}

async function getSettlement(payload) {
  const room = await getRoomById(payload.roomId)
  if (!room) return error('room_not_found')
  return success({ settlementList: computeSettlement(room.players || []) })
}

async function finishRoom(payload) {
  const room = await getRoomById(payload.roomId)
  if (!room) return error('room_not_found')

  room.status = 'finished'
  room.finishedAt = now()
  room.updatedAt = room.finishedAt
  await saveRoom(room)

  const game = {
    id: room.id,
    typeName: room.name || '房间',
    players: (room.players || []).map(player => ({ id: player.id, name: player.name })),
    rounds: room.rounds || [],
    baseScore: 1,
    location: '',
    note: '',
    status: 'finished',
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    finishedAt: room.finishedAt
  }

  await histories.doc(game.id).set({ data: game })
  return success({ room, game })
}

async function getRoomQRCode(payload) {
  const room = await getRoomById(payload.roomId)
  if (!room) return error('room_not_found')

  let fileID = room.qrFileID || ''
  if (!fileID) {
    const scene = 'r=' + room.id
    const cloudPath = 'room-qrcodes/' + room.id + '.png'
    const codeResult = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page: 'pages/room/room',
      checkPath: false,
      envVersion: 'release',
      width: 430
    })

    const uploadResult = await cloud.uploadFile({
      cloudPath,
      fileContent: codeResult.buffer
    })
    fileID = uploadResult.fileID || ''
    room.qrFileID = fileID
    await rooms.doc(room.id).update({
      data: { qrFileID: fileID }
    })
  }

  const tempUrlResult = await cloud.getTempFileURL({
    fileList: [fileID]
  })
  const fileInfo = (tempUrlResult.fileList || [])[0] || {}

  return success({
    fileID,
    tempFileURL: fileInfo.tempFileURL || ''
  })
}

const handlers = {
  ping,
  getMyProfile,
  saveMyProfile,
  createRoom,
  getRoom,
  getRoomByCode,
  listRooms,
  addPlayer,
  addRound,
  deleteRound,
  getSettlement,
  finishRoom,
  getRoomQRCode
}

exports.main = async function (event) {
  try {
    const action = String(event.action || '').trim()
    const handler = handlers[action]
    if (!handler) return error('action_not_found')
    if (action !== 'ping') await ensureCollections()
    return await handler(event.payload || {})
  } catch (err) {
    console.error(err)
    return error('internal_error', {
      message: err.message || String(err)
    })
  }
}
