// 本地存储工具库

const KEYS = {
  GAMES: 'poker_games',
  USER_PROFILE: 'poker_user_profile',
  ROOMS: 'poker_rooms',
  STORAGE_VERSION: 'poker_storage_version',
  GAME_KEY_PREFIX: 'poker_game_',
  ROOM_KEY_PREFIX: 'poker_room_',
  INITIALIZED: 'poker_initialized'
}

// 生成唯一ID
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function gameStorageKey(id) {
  return KEYS.GAME_KEY_PREFIX + id
}

function roomStorageKey(id) {
  return KEYS.ROOM_KEY_PREFIX + id
}

function summarizeGame(game) {
  var playerTotals = []
  var topPlayer = null

  if (game.status === 'finished') {
    var scores = calcGameScores(game)
    for (var pid in scores) {
      var item = {
        id: pid,
        name: scores[pid].name,
        total: scores[pid].total
      }
      playerTotals.push(item)
      if (!topPlayer || item.total > topPlayer.total) {
        topPlayer = item
      }
    }
    if (topPlayer && topPlayer.total === 0) {
      topPlayer = null
    }
  }

  return {
    id: game.id,
    typeName: game.typeName,
    players: game.players || [],
    roundCount: game.rounds ? game.rounds.length : (game.roundCount || 0),
    playerTotals: playerTotals,
    topPlayer: topPlayer,
    baseScore: game.baseScore || 1,
    location: game.location || '',
    note: game.note || '',
    status: game.status,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    finishedAt: game.finishedAt || 0
  }
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

function migrateSplitStorage() {
  if (wx.getStorageSync(KEYS.STORAGE_VERSION) === 2) return

  var games = wx.getStorageSync(KEYS.GAMES) || []
  var gameSummaries = []
  for (var i = 0; i < games.length; i++) {
    if (games[i] && games[i].id) {
      if (games[i].rounds) {
        wx.setStorageSync(gameStorageKey(games[i].id), games[i])
        gameSummaries.push(summarizeGame(games[i]))
      } else {
        gameSummaries.push(games[i])
      }
    }
  }
  wx.setStorageSync(KEYS.GAMES, gameSummaries)

  var rooms = wx.getStorageSync(KEYS.ROOMS) || []
  var roomSummaries = []
  for (var j = 0; j < rooms.length; j++) {
    if (rooms[j] && rooms[j].id) {
      if (rooms[j].rounds) {
        wx.setStorageSync(roomStorageKey(rooms[j].id), rooms[j])
        roomSummaries.push(summarizeRoom(rooms[j]))
      } else {
        roomSummaries.push(rooms[j])
      }
    }
  }
  wx.setStorageSync(KEYS.ROOMS, roomSummaries)
  wx.setStorageSync(KEYS.STORAGE_VERSION, 2)
}

// 格式化日期
function formatDate(date, fmt) {
  if (typeof date === 'number') date = new Date(date)
  if (typeof date === 'string') {
    const parsed = Number(date)
    date = Number.isNaN(parsed) ? new Date(date) : new Date(parsed)
  }
  fmt = fmt || 'YYYY-MM-DD HH:mm'
  if (/(Y+)/.test(fmt)) {
    fmt = fmt.replace(RegExp.$1, (date.getFullYear() + '').substr(4 - RegExp.$1.length))
  }
  const o = {
    'M+': date.getMonth() + 1,
    'D+': date.getDate(),
    'H+': date.getHours(),
    'm+': date.getMinutes(),
    's+': date.getSeconds()
  }
  for (let k in o) {
    if (new RegExp('(' + k + ')').test(fmt)) {
      const val = '' + o[k]
      fmt = fmt.replace(RegExp.$1, RegExp.$1.length === 1 ? val : ('00' + val).substr(val.length))
    }
  }
  return fmt
}

// 初始化
function init() {
  const initialized = wx.getStorageSync(KEYS.INITIALIZED)
  if (!initialized) {
    wx.setStorageSync(KEYS.GAMES, [])
    wx.setStorageSync(KEYS.ROOMS, [])
    wx.setStorageSync(KEYS.USER_PROFILE, { nickname: '', avatarUrl: '' })
    wx.setStorageSync(KEYS.INITIALIZED, true)
  }

  // 确保存储结构存在
  if (!wx.getStorageSync(KEYS.GAMES)) {
    wx.setStorageSync(KEYS.GAMES, [])
  }
  if (!wx.getStorageSync(KEYS.ROOMS)) {
    wx.setStorageSync(KEYS.ROOMS, [])
  }
  if (!wx.getStorageSync(KEYS.USER_PROFILE)) {
    wx.setStorageSync(KEYS.USER_PROFILE, { nickname: '', avatarUrl: '' })
  }

  migrateSplitStorage()
}

// ========== 牌局操作 ==========

function getGames() {
  return wx.getStorageSync(KEYS.GAMES) || []
}

function getGameById(id) {
  const game = wx.getStorageSync(gameStorageKey(id))
  if (game) return game

  const games = getGames()
  return games.find(g => g.id === id) || null
}

function saveGame(game) {
  const games = getGames()
  const index = games.findIndex(g => g.id === game.id)
  const summary = summarizeGame(game)
  if (index >= 0) {
    games[index] = summary
  } else {
    games.unshift(summary)
  }
  wx.setStorageSync(gameStorageKey(game.id), game)
  wx.setStorageSync(KEYS.GAMES, games)
  return game
}

function deleteGame(id) {
  let games = getGames()
  games = games.filter(g => g.id !== id)
  wx.removeStorageSync(gameStorageKey(id))
  wx.setStorageSync(KEYS.GAMES, games)
}

// ========== 统计 ==========

// 计算单个牌局的玩家总分
function calcGameScores(game) {
  const result = {}
  const players = (game && game.players) || []
  const rounds = (game && game.rounds) || []

  players.forEach(p => {
    result[p.id] = { name: p.name, total: 0 }
  })
  rounds.forEach(round => {
    for (let pid in round.scores) {
      if (result[pid]) {
        result[pid].total += round.scores[pid]
      }
    }
  })
  return result
}

// ========== 用户资料 ==========

function getUserProfile() {
  return wx.getStorageSync(KEYS.USER_PROFILE) || { nickname: '', avatarUrl: '' }
}

function saveUserProfile(profile) {
  const existing = getUserProfile()
  const updated = { ...existing, ...profile }
  wx.setStorageSync(KEYS.USER_PROFILE, updated)
  return updated
}

// 获取用户个人统计
function getUserStats() {
  const profile = getUserProfile()
  if (!profile.nickname) {
    return { totalGames: 0, winCount: 0, winRate: 0 }
  }

  const games = getGames()
  let totalGames = 0
  let winCount = 0
  let gamesForWinRate = 0

  games.forEach(game => {
    const playerEntry = (game.players || []).find(p => p.name === profile.nickname)
    if (!playerEntry) return

    // 只统计已结束的牌局
    if (game.status !== 'finished') return

    totalGames++

    const totals = Array.isArray(game.playerTotals) ? game.playerTotals : Object.values(calcGameScores(game))
    const playerScore = totals.find(function (item) {
      return item.name === profile.nickname
    })
    if (!playerScore) return

    // 积分为0不参与胜率统计
    if (playerScore.total === 0) return

    gamesForWinRate++

    const allScores = totals.map(s => s.total)
    const maxScore = Math.max(...allScores)
    if (playerScore.total === maxScore && maxScore !== 0) {
      winCount++
    }
  })

  const winRate = gamesForWinRate > 0 ? Math.round(winCount / gamesForWinRate * 100) : 0

  return { totalGames, winCount, winRate }
}

// ========== 房间操作 ==========

function getRooms() {
  return wx.getStorageSync(KEYS.ROOMS) || []
}

function getRoomById(id) {
  var room = wx.getStorageSync(roomStorageKey(id))
  if (room) return room

  var rooms = getRooms()
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].id === id) return rooms[i]
  }
  return null
}

function saveRoom(room) {
  var rooms = getRooms()
  var index = -1
  var summary = summarizeRoom(room)
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].id === room.id) { index = i; break }
  }
  if (index >= 0) {
    rooms[index] = summary
  } else {
    rooms.unshift(summary)
  }
  wx.setStorageSync(roomStorageKey(room.id), room)
  wx.setStorageSync(KEYS.ROOMS, rooms)
  return room
}

function createRoom(playerName, avatarUrl) {
  // 生成唯一的5位随机房间名（字母+数字）
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  var existingRooms = getRooms()
  var roomName = ''
  var isUnique = false

  while (!isUnique) {
    roomName = ''
    for (var i = 0; i < 5; i++) {
      roomName += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    // 检查房间名是否已存在
    var exists = false
    for (var j = 0; j < existingRooms.length; j++) {
      if (existingRooms[j].name === roomName) {
        exists = true
        break
      }
    }

    if (!exists) {
      isUnique = true
    }
  }

  var room = {
    id: genId(),
    name: roomName,
    players: [
      {
        id: genId(),
        name: playerName,
        avatarUrl: avatarUrl || '',
        score: 0
      },
      {
        id: genId(),
        name: '茶水',
        avatarUrl: '',
        score: 0
      }
    ],
    rounds: [],
    status: 'playing',
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
  wx.setStorageSync(roomStorageKey(room.id), room)
  existingRooms.unshift(summarizeRoom(room))
  wx.setStorageSync(KEYS.ROOMS, existingRooms)
  return room
}

function addPlayerToRoom(roomId, playerName, avatarUrl) {
  var room = getRoomById(roomId)
  if (!room) return null

  for (var i = 0; i < room.players.length; i++) {
    if (room.players[i].name === playerName) return room
  }

  var newPlayer = {
    id: genId(),
    name: playerName,
    avatarUrl: avatarUrl || '',
    score: 0
  }

  // 找到茶水玩家的位置，插入到它前面
  var teaIndex = -1
  for (var i = 0; i < room.players.length; i++) {
    if (room.players[i].name === '茶水') {
      teaIndex = i
      break
    }
  }

  if (teaIndex >= 0) {
    room.players.splice(teaIndex, 0, newPlayer)
  } else {
    room.players.push(newPlayer)
  }

  room.updatedAt = Date.now()
  return saveRoom(room)
}

function syncRoomOwnerProfile(roomId, profile) {
  var room = getRoomById(roomId)
  if (!room || !room.players || room.players.length === 0 || !profile) return room

  var owner = room.players[0]
  var changed = false

  if (profile.nickname && owner.name !== profile.nickname) {
    owner.name = profile.nickname
    changed = true
  }

  if (profile.avatarUrl && owner.avatarUrl !== profile.avatarUrl) {
    owner.avatarUrl = profile.avatarUrl
    changed = true
  }

  if (changed) {
    room.updatedAt = Date.now()
    return saveRoom(room)
  }

  return room
}

function addRoomRound(roomId, scores, note, amount) {
  var room = getRoomById(roomId)
  if (!room) return null

  var round = {
    id: genId(),
    scores: scores,
    note: note || '',
    amount: amount || 0,
    createdAt: Date.now()
  }
  room.rounds.push(round)

  for (var i = 0; i < room.players.length; i++) {
    var pid = room.players[i].id
    if (scores[pid] !== undefined) {
      room.players[i].score += scores[pid]
    }
  }

  room.updatedAt = Date.now()
  saveRoom(room)
  return round
}

function deleteRoomRound(roomId, roundId) {
  var room = getRoomById(roomId)
  if (!room) return null

  var round = null
  for (var i = 0; i < room.rounds.length; i++) {
    if (room.rounds[i].id === roundId) {
      round = room.rounds[i]
      break
    }
  }

  if (round) {
    for (var i = 0; i < room.players.length; i++) {
      var pid = room.players[i].id
      if (round.scores[pid] !== undefined) {
        room.players[i].score -= round.scores[pid]
      }
    }
    room.rounds = room.rounds.filter(function (r) { return r.id !== roundId })
  }

  room.updatedAt = Date.now()
  saveRoom(room)
  return room
}

function finishRoom(roomId) {
  var room = getRoomById(roomId)
  if (!room) return null

  room.status = 'finished'
  room.finishedAt = Date.now()
  room.updatedAt = Date.now()
  saveRoom(room)

  // 创建游戏记录，用于历史记录和统计
  var game = {
    id: room.id,
    typeName: room.name || '房间',
    players: room.players.map(function (p) {
      return { id: p.id, name: p.name }
    }),
    rounds: room.rounds,
    baseScore: 1,
    location: '',
    note: '',
    status: 'finished',
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    finishedAt: room.finishedAt
  }
  saveGame(game)

  return room
}

function clearPlayingRoomsByPlayer(playerName) {
  var rooms = getRooms()
  var kept = []
  var removed = []

  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i]
    var shouldRemove = room.status === 'playing' && (room.players || []).some(function (player) {
      return player.name === playerName
    })

    if (shouldRemove) {
      wx.removeStorageSync(roomStorageKey(room.id))
      removed.push(room)
    } else {
      kept.push(room)
    }
  }

  wx.setStorageSync(KEYS.ROOMS, kept)
  return removed
}

// 检查并自动结算超过12小时未更新的房间
function checkAutoFinishRooms() {
  var rooms = getRooms()
  var autoFinished = []
  var now = Date.now()
  var timeout = 12 * 60 * 60 * 1000 // 12小时

  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].status === 'playing') {
      var lastUpdate = rooms[i].updatedAt || rooms[i].createdAt
      if (now - lastUpdate > timeout) {
        var finished = finishRoom(rooms[i].id)
        if (finished) {
          autoFinished.push(finished)
        }
      }
    }
  }

  return autoFinished
}

module.exports = {
  init,
  genId,
  formatDate,
  getGames,
  getGameById,
  saveGame,
  deleteGame,
  calcGameScores,
  getUserProfile,
  saveUserProfile,
  getUserStats,
  getRooms,
  getRoomById,
  saveRoom,
  createRoom,
  addPlayerToRoom,
  syncRoomOwnerProfile,
  addRoomRound,
  deleteRoomRound,
  finishRoom,
  clearPlayingRoomsByPlayer,
  checkAutoFinishRooms
}
