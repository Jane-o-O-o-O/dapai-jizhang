var storage = require('../../utils/storage')
var api = require('../../utils/api')
var qrcode = require('../../utils/qrcode')
var roomEntry = require('../../utils/room-entry')

Page({
  data: {
    theme: 'light',
    roomId: '',
    pendingRoomCode: '',
    myPlayerId: '',
    room: { players: [], rounds: [], status: 'playing' },
    displayRounds: [],
    showNumpad: false,
    scoringPlayer: {},
    scoringIndex: 0,
    scoreInput: '',
    showQR: false,
    qrRows: [],
    qrImageUrl: '',
    qrLoading: false,
    qrError: '',
    showProfileModal: false,
    profileNickname: '',
    profileAvatarUrl: '',
    pendingJoinRoom: null,
    checkingInvitedProfile: false,
    showSettlement: false,
    settlementList: []
  },

  onLoad: function (options) {
    var theme = wx.getStorageSync('poker_theme') || 'light'
    var entry = roomEntry.getEntryFromOptions(options)
    this.setData({ theme: theme, roomId: entry.roomId, pendingRoomCode: entry.roomCode || '' })
    this.setNavBar(theme)
  },

  onShow: function () {
    var that = this
    this.roomVisible = true
    if (!this.data.roomId) {
      this.loadRoomByCode()
      return
    }
    this.loadRoom().then(function () {
      if (that.roomVisible) that.startRoomSync()
    }).catch(function () {})
  },

  onHide: function () {
    this.roomVisible = false
    this.stopRoomSync()
  },

  onUnload: function () {
    this.roomVisible = false
    this.stopRoomSync()
  },

  loadRoomByCode: function () {
    var code = this.data.pendingRoomCode || ''
    var that = this
    if (!code) return

    wx.showLoading({ title: '进入中' })
    api.getRoomByCode(code).then(function (room) {
      wx.hideLoading()
      storage.saveRoom(room)
      that.setData({ roomId: room.id, pendingRoomCode: '' })
      that.applyRoom(room)
      that.ensureCurrentPlayer(room, true)
      if (that.roomVisible) that.startRoomSync()
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: api.getErrorMessage(err, '进入失败'), icon: 'none' })
      setTimeout(function () { wx.reLaunch({ url: '/pages/index/index' }) }, 1500)
    })
  },

  setNavBar: function (theme) {
    if (theme === 'dark') {
      wx.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#0a0a0a' })
    } else {
      wx.setNavigationBarColor({ frontColor: '#000000', backgroundColor: '#f5f0e8' })
    }
  },

  loadRoom: function () {
    var that = this
    return api.getRoom(this.data.roomId).then(function (room) {
      storage.saveRoom(room)
      that.applyRoom(room)
      that.ensureCurrentPlayer(room, true)
      return room
    }).catch(function (err) {
      wx.showToast({ title: api.getErrorMessage(err, '加载失败'), icon: 'none' })
      setTimeout(function () { wx.reLaunch({ url: '/pages/index/index' }) }, 1500)
      throw err
    })
  },

  startRoomSync: function () {
    if (!this.data.roomId) return
    this.stopRoomSync()

    if (!this.startRoomWatch()) {
      this.startRoomPolling()
    }
  },

  stopRoomSync: function () {
    if (this.roomWatcher) {
      try {
        this.roomWatcher.close()
      } catch (err) {
        console.error('close room watcher failed', err)
      }
      this.roomWatcher = null
    }

    if (this.roomPollTimer) {
      clearInterval(this.roomPollTimer)
      this.roomPollTimer = null
    }
    this.roomPolling = false
  },

  startRoomWatch: function () {
    var that = this
    if (!wx.cloud || !wx.cloud.database) return false

    try {
      var db = wx.cloud.database()
      this.roomWatcher = db.collection('poker_rooms').doc(this.data.roomId).watch({
        onChange: function (snapshot) {
          var room = that.getRoomFromSnapshot(snapshot)
          if (room) that.applyRemoteRoom(room)
        },
        onError: function (err) {
          console.error('room watch failed', err)
          if (!that.roomPollTimer) that.startRoomPolling()
        }
      })
      return true
    } catch (err) {
      console.error('start room watch failed', err)
      this.roomWatcher = null
      return false
    }
  },

  startRoomPolling: function () {
    var that = this
    if (this.roomPollTimer || !this.data.roomId) return

    this.roomPollTimer = setInterval(function () {
      that.pollRoom()
    }, 2000)
  },

  pollRoom: function () {
    var that = this
    if (this.roomPolling || !this.data.roomId) return
    this.roomPolling = true

    api.getRoom(this.data.roomId).then(function (room) {
      that.applyRemoteRoom(room)
    }).catch(function (err) {
      console.error('poll room failed', err)
    }).then(function () {
      that.roomPolling = false
    })
  },

  getRoomFromSnapshot: function (snapshot) {
    var docs = (snapshot && snapshot.docs) || []
    var doc = docs[0] || (snapshot && (snapshot.doc || snapshot.data))
    if (!doc) return null

    var room = Object.assign({}, doc)
    room.id = room.id || room._id || this.data.roomId
    delete room._id
    delete room._openid
    return room
  },

  applyRemoteRoom: function (room) {
    if (!room || room.id !== this.data.roomId) return

    var current = this.data.room || {}
    if (current.updatedAt === room.updatedAt && current.rounds && room.rounds && current.rounds.length === room.rounds.length) {
      return
    }

    storage.saveRoom(room)
    this.applyRoom(room)
  },

  isProfileReady: function (profile) {
    return !!(profile && profile.nickname && profile.avatarUrl)
  },

  isCurrentUserInRoom: function (room) {
    var profile = storage.getUserProfile()
    var nickname = profile.nickname || ''
    var players = (room && room.players) || []

    for (var i = 0; i < players.length; i++) {
      if (nickname && players[i].name === nickname) return true
    }
    return false
  },

  ensureCurrentPlayer: function (room, requireCloudProfile) {
    var that = this

    if (!room || room.status !== 'playing') return
    if (this.isCurrentUserInRoom(room)) return

    if (requireCloudProfile) {
      this.ensureInvitedProfile(room)
      return
    }

    this.joinRoomWithProfile(room, storage.getUserProfile())
  },

  ensureInvitedProfile: function (room) {
    var that = this

    if (this.data.showProfileModal || this.data.checkingInvitedProfile) return
    this.setData({ checkingInvitedProfile: true })

    api.getMyProfile().then(function (profile) {
      that.setData({ checkingInvitedProfile: false })
      if (that.isProfileReady(profile)) {
        storage.saveUserProfile({
          nickname: profile.nickname,
          avatarUrl: profile.avatarUrl
        })
        that.joinRoomWithProfile(room, profile)
        return
      }

      var localProfile = storage.getUserProfile()
      that.setData({
        pendingJoinRoom: room,
        showProfileModal: true,
        profileNickname: (profile && profile.nickname) || localProfile.nickname || '',
        profileAvatarUrl: (profile && profile.avatarUrl) || localProfile.avatarUrl || ''
      })
    }).catch(function (err) {
      console.error('load profile failed', err)
      wx.showToast({ title: api.getErrorMessage(err, '请先完善资料'), icon: 'none' })
      that.setData({
        checkingInvitedProfile: false,
        pendingJoinRoom: room,
        showProfileModal: true,
        profileNickname: storage.getUserProfile().nickname || '',
        profileAvatarUrl: storage.getUserProfile().avatarUrl || ''
      })
    })
  },

  joinRoomWithProfile: function (room, profile) {
    var that = this
    var nickname = (profile && profile.nickname) || ''
    var avatarUrl = (profile && profile.avatarUrl) || ''

    if (!nickname || !avatarUrl) {
      this.setData({
        pendingJoinRoom: room,
        showProfileModal: true,
        profileNickname: nickname,
        profileAvatarUrl: avatarUrl
      })
      return
    }

    api.addPlayer(room.id, {
      name: nickname,
      avatarUrl: avatarUrl
    }).then(function (updatedRoom) {
      storage.saveRoom(updatedRoom)
      that.applyRoom(updatedRoom)
    }).catch(function (err) {
      console.error('auto join room failed', err)
    })
  },

  onProfileNicknameInput: function (e) {
    this.setData({ profileNickname: e.detail.value })
  },

  onChooseProfileAvatar: function (e) {
    this.setData({ profileAvatarUrl: e.detail.avatarUrl })
  },

  onSaveInvitedProfile: function () {
    var nickname = (this.data.profileNickname || '').trim()
    var avatarUrl = this.data.profileAvatarUrl || ''
    var room = this.data.pendingJoinRoom
    var that = this

    if (!avatarUrl) {
      wx.showToast({ title: '请先添加头像', icon: 'none' })
      return
    }
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中' })
    api.saveMyProfile({
      nickname: nickname,
      avatarUrl: avatarUrl
    }).then(function (profile) {
      wx.hideLoading()
      storage.saveUserProfile({
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl
      })
      that.setData({
        showProfileModal: false,
        pendingJoinRoom: null,
        checkingInvitedProfile: false
      })
      that.joinRoomWithProfile(room, profile)
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: api.getErrorMessage(err, '保存失败'), icon: 'none' })
    })
  },

  findMyPlayerId: function (room) {
    var profile = storage.getUserProfile()
    var nickname = profile.nickname || ''
    var players = (room && room.players) || []
    for (var i = 0; i < players.length; i++) {
      if (players[i].name === nickname) return players[i].id
    }
    return ''
  },

  applyRoom: function (room) {
    var myPlayerId = this.findMyPlayerId(room)
    for (var i = 0; i < room.players.length; i++) {
      room.players[i].initial = room.players[i].name.charAt(0)
    }
    this.setData({
      myPlayerId: myPlayerId,
      room: room,
      displayRounds: this.buildDisplayRounds(room, myPlayerId)
    })
  },

  buildDisplayRounds: function (room, myPlayerId) {
    var players = room.players || []
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
        isMine: sourceId === myPlayerId,
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
    if (playerId === this.data.myPlayerId) return

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

    var sourceId = this.data.myPlayerId
    var targetId = this.data.scoringPlayer.id
    if (!sourceId) {
      wx.showToast({ title: '当前用户不在房间内', icon: 'none' })
      return
    }
    wx.hideKeyboard()
    wx.showLoading({ title: '保存中' })
    var that = this
    api.addRound(this.data.roomId, sourceId, targetId, value).then(function (room) {
      wx.hideLoading()
      storage.saveRoom(room)
      that.setData({ showNumpad: false })
      that.applyRoom(room)
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: api.getErrorMessage(err, '保存失败'), icon: 'none' })
    })
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
          wx.showLoading({ title: '删除中' })
          api.deleteRound(that.data.roomId, roundId).then(function (room) {
            wx.hideLoading()
            storage.saveRoom(room)
            that.applyRoom(room)
          }).catch(function (err) {
            wx.hideLoading()
            wx.showToast({ title: api.getErrorMessage(err, '删除失败'), icon: 'none' })
          })
        }
      }
    })
  },

  // ========== 房间号 ==========

  onShowQR: function () {
    var code = this.data.room.name || ''
    var rows = []
    try {
      rows = qrcode.createRows('poker_room:' + code)
    } catch (err) {
      wx.showToast({ title: '二维码生成失败', icon: 'none' })
    }
    this.setData({ showQR: true, qrRows: rows, qrError: '' })
    this.loadOfficialQRCode()
  },

  loadOfficialQRCode: function () {
    var that = this
    if (!this.data.roomId || this.data.qrImageUrl || this.data.qrLoading) return

    this.setData({ qrLoading: true, qrError: '' })
    api.getRoomQRCode(this.data.roomId).then(function (result) {
      that.setData({
        qrImageUrl: result.tempFileURL || result.fileID || '',
        qrLoading: false,
        qrError: result.tempFileURL || result.fileID ? '' : '小程序码暂不可用'
      })
    }).catch(function (err) {
      console.error('load official qrcode failed', err)
      that.setData({
        qrLoading: false,
        qrError: api.getErrorMessage(err, '小程序码暂不可用')
      })
    })
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

  onShareAppMessage: function () {
    var room = this.data.room || {}
    var roomId = this.data.roomId || room.id || ''
    var roomName = room.name || ''

    return {
      title: roomName ? '加入房间 ' + roomName : '加入房间',
      path: '/pages/room/room?id=' + encodeURIComponent(roomId)
    }
  },

  // ========== 结算 ==========

  onSettlement: function () {
    var players = this.data.room.players
    if (players.length < 2) {
      wx.showToast({ title: '至少需要2名玩家', icon: 'none' })
      return
    }
    var that = this
    wx.showLoading({ title: '结算中' })
    api.getSettlement(this.data.roomId).then(function (settlementList) {
      wx.hideLoading()
      that.setData({
        showSettlement: true,
        settlementList: settlementList
      })
    }).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: api.getErrorMessage(err, '结算失败'), icon: 'none' })
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
          wx.showLoading({ title: '结束中' })
          api.finishRoom(that.data.roomId).then(function (result) {
            wx.hideLoading()
            storage.saveRoom(result.room)
            if (result.game) storage.saveGame(result.game)
            wx.showToast({ title: '已结束', icon: 'success' })
            setTimeout(function () { wx.reLaunch({ url: '/pages/index/index' }) }, 1500)
          }).catch(function (err) {
            wx.hideLoading()
            wx.showToast({ title: api.getErrorMessage(err, '结束失败'), icon: 'none' })
          })
        }
      }
    })
  }
})
