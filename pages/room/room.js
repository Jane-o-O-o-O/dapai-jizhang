var storage = require('../../utils/storage')

Page({
  data: {
    theme: 'light',
    roomId: '',
    room: { players: [], rounds: [], status: 'playing' },
    displayRounds: [],
    showNumpad: false,
    scoringPlayer: {},
    scoringIndex: 0,
    scoreInput: '',
    showQR: false,
    showAddPlayer: false,
    newPlayerName: '',
    showSettlement: false,
    settlementList: []
  },

  onLoad: function (options) {
    var theme = wx.getStorageSync('poker_theme') || 'light'
    this.setData({ theme: theme, roomId: options.id })
    this.setNavBar(theme)
  },

  onShow: function () {
    if (!this.data.roomId) return
    this.loadRoom()
  },

  setNavBar: function (theme) {
    if (theme === 'dark') {
      wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#0a0a0a' })
    } else {
      wx.setNavigationBarColor({ frontColor: '#000000', backgroundColor: '#f5f0e8' })
    }
  },

  loadRoom: function () {
    var profile = storage.getUserProfile()
    var room = storage.syncRoomOwnerProfile(this.data.roomId, profile)
    if (!room) {
      wx.showToast({ title: '房间不存在', icon: 'none' })
      setTimeout(function () { wx.reLaunch({ url: '/pages/index/index' }) }, 1500)
      return
    }
    for (var i = 0; i < room.players.length; i++) {
      room.players[i].initial = room.players[i].name.charAt(0)
    }
    this.setData({
      room: room,
      displayRounds: this.buildDisplayRounds(room)
    })
  },

  buildDisplayRounds: function (room) {
    var players = room.players || []
    var ownerId = players[0] ? players[0].id : ''
    var playersById = {}
    for (var i = 0; i < players.length; i++) {
      playersById[players[i].id] = players[i]
    }

    var roundGroups = {}
    var sourceRounds = room.rounds || []
    var periodStartTime = 0
    var periodIndex = -1
    var periodDuration = 2 * 60 * 1000

    for (var g = 0; g < sourceRounds.length; g++) {
      var createdAt = sourceRounds[g].createdAt || 0
      if (periodIndex < 0 || createdAt - periodStartTime >= periodDuration) {
        periodIndex++
        periodStartTime = createdAt
      }
      roundGroups[sourceRounds[g].id] = periodIndex
    }

    var rounds = sourceRounds.slice().reverse()
    var displayRounds = []
    for (var j = 0; j < rounds.length; j++) {
      var round = rounds[j]
      var scores = round.scores || {}
      var sourceId = ''
      var targetId = ''
      var amount = Math.abs(round.amount || 0)

      for (var pid in scores) {
        if (scores[pid] < 0) sourceId = pid
        if (scores[pid] > 0) {
          targetId = pid
          if (!amount) amount = Math.abs(scores[pid])
        }
      }

      var source = playersById[sourceId] || { name: '未知', avatarUrl: '' }
      var target = playersById[targetId] || { name: '未知', avatarUrl: '' }
      var sourceName = source.name || '未知'
      var nextRound = rounds[j + 1]
      var periodGroup = roundGroups[round.id]

      displayRounds.push({
        id: round.id,
        hasPeriodGap: !!nextRound && periodGroup !== roundGroups[nextRound.id],
        isMine: sourceId === ownerId,
        actorName: sourceName,
        actorAvatarUrl: source.avatarUrl || '',
        actorInitial: source.initial || sourceName.charAt(0),
        targetName: target.name || '未知',
        amount: amount,
        timeText: storage.formatDate(round.createdAt, 'YYYY-MM-DD HH:mm:ss')
      })
    }

    return displayRounds
  },

  onPlayerAvatarError: function (e) {
    var index = e.currentTarget.dataset.index
    var room = this.data.room
    if (!room || !room.players || !room.players[index]) return

    room.players[index].avatarUrl = ''
    storage.saveRoom(room)
    this.setData({ room: room })
  },

  onScoringAvatarError: function () {
    var index = this.data.scoringIndex
    var room = this.data.room
    if (!room || !room.players || !room.players[index]) return

    room.players[index].avatarUrl = ''
    storage.saveRoom(room)
    this.setData({
      room: room,
      scoringPlayer: room.players[index]
    })
  },

  // ========== 头像点击 → 转分 ==========

  onTapPlayer: function (e) {
    var playerId = e.currentTarget.dataset.id
    var index = e.currentTarget.dataset.index
    if (index === 0) return

    var player = null
    for (var i = 0; i < this.data.room.players.length; i++) {
      if (this.data.room.players[i].id === playerId) {
        player = this.data.room.players[i]
        break
      }
    }
    if (!player) return

    this.setData({
      showNumpad: true,
      scoringPlayer: player,
      scoringIndex: index,
      scoreInput: ''
    })
  },

  onCloseNumpad: function () {
    wx.hideKeyboard()
    this.setData({ showNumpad: false })
  },

  onScoreInput: function (e) {
    var value = (e.detail.value || '').replace(/\D/g, '').slice(0, 6)
    this.setData({ scoreInput: value })
  },

  onConfirmScore: function () {
    var value = parseInt(this.data.scoreInput, 10)
    if (isNaN(value) || value === 0) {
      wx.showToast({ title: '请输入数字', icon: 'none' })
      return
    }

    var sourceId = this.data.room.players[0].id
    var targetId = this.data.scoringPlayer.id
    var sourceName = this.data.room.players[0].name
    var targetName = this.data.scoringPlayer.name

    var scores = {}
    scores[sourceId] = -value
    scores[targetId] = value

    var note = sourceName + ' → ' + targetName

    storage.addRoomRound(this.data.roomId, scores, note, value)
    wx.hideKeyboard()
    this.setData({ showNumpad: false })
    this.loadRoom()
  },

  // ========== 添加玩家 ==========

  onAddPlayer: function () {
    this.setData({ showAddPlayer: true, newPlayerName: '' })
  },

  onCloseAddPlayer: function () {
    this.setData({ showAddPlayer: false })
  },

  onNewPlayerInput: function (e) {
    this.setData({ newPlayerName: e.detail.value })
  },

  onConfirmAddPlayer: function () {
    var name = this.data.newPlayerName.trim()
    if (!name) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    storage.addPlayerToRoom(this.data.roomId, name, '')
    this.setData({ showAddPlayer: false })
    this.loadRoom()
  },

  // ========== 删除记录 ==========

  onDeleteRound: function (e) {
    var that = this
    var roundId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除这条记录？',
      success: function (res) {
        if (res.confirm) {
          storage.deleteRoomRound(that.data.roomId, roundId)
          that.loadRoom()
        }
      }
    })
  },

  // ========== 房间号 ==========

  onShowQR: function () {
    this.setData({ showQR: true })
  },

  onCloseQR: function () {
    this.setData({ showQR: false })
  },

  onCopyRoomName: function () {
    wx.setClipboardData({
      data: this.data.room.name,
      success: function () { wx.showToast({ title: '已复制房间号', icon: 'success' }) }
    })
  },

  // ========== 结算 ==========

  onSettlement: function () {
    var players = this.data.room.players
    if (players.length < 2) {
      wx.showToast({ title: '至少需要2名玩家', icon: 'none' })
      return
    }

    // 计算每个人的净积分
    var balances = []
    for (var i = 0; i < players.length; i++) {
      balances.push({
        id: players[i].id,
        name: players[i].name,
        score: players[i].score
      })
    }

    // 分为欠款人和收款人
    var debtors = [] // 负分，需要付钱
    var creditors = [] // 正分，需要收钱

    for (var i = 0; i < balances.length; i++) {
      if (balances[i].score < 0) {
        debtors.push({ id: balances[i].id, name: balances[i].name, amount: -balances[i].score })
      } else if (balances[i].score > 0) {
        creditors.push({ id: balances[i].id, name: balances[i].name, amount: balances[i].score })
      }
    }

    // 按金额排序，优化结算
    debtors.sort(function (a, b) { return b.amount - a.amount })
    creditors.sort(function (a, b) { return b.amount - a.amount })

    // 生成结算列表
    var settlementList = []
    var i = 0, j = 0
    while (i < debtors.length && j < creditors.length) {
      var amount = Math.min(debtors[i].amount, creditors[j].amount)
      if (amount > 0) {
        settlementList.push({
          from: debtors[i].name,
          to: creditors[j].name,
          amount: amount
        })
      }
      debtors[i].amount -= amount
      creditors[j].amount -= amount

      if (debtors[i].amount === 0) i++
      if (creditors[j].amount === 0) j++
    }

    this.setData({
      showSettlement: true,
      settlementList: settlementList
    })
  },

  onCloseSettlement: function () {
    this.setData({ showSettlement: false })
  },

  onConfirmEndRoom: function () {
    var that = this
    wx.showModal({
      title: '结束房间',
      content: '确定结束当前房间？',
      success: function (res) {
        if (res.confirm) {
          storage.finishRoom(that.data.roomId)
          wx.showToast({ title: '已结束', icon: 'success' })
          setTimeout(function () { wx.reLaunch({ url: '/pages/index/index' }) }, 1500)
        }
      }
    })
  }
})
