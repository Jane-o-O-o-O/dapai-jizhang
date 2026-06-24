const storage = require('../../utils/storage')
const api = require('../../utils/api')
const roomEntry = require('../../utils/room-entry')

Page({
  pendingJoinAction: null,

  data: {
    theme: 'light',
    profile: { nickname: '', avatarUrl: '' },
    userStats: { totalGames: 0, winCount: 0, winRate: 0 },
    activeRooms: [],
    showEditModal: false,
    showJoinModal: false,
    joinRoomCode: '',
    editNickname: '',
    editAvatarUrl: ''
  },

  onShow: function () {
    var theme = wx.getStorageSync('poker_theme') || 'light'
    this.setData({ theme: theme })
    this.setNavBar(theme)
    this.cleanupJinjinRoomsOnce()
    // 检查并自动结算超过12小时未更新的房间
    var autoFinished = storage.checkAutoFinishRooms()
    if (autoFinished.length > 0) {
      wx.showToast({
        title: autoFinished.length + '个房间已自动结算',
        icon: 'none',
        duration: 2000
      })
    }
    this.loadData()
  },

  cleanupJinjinRoomsOnce: function () {
    var cleanupKey = 'poker_cleanup_jinjin_rooms_20260520'
    if (wx.getStorageSync(cleanupKey)) return

    var removed = storage.clearPlayingRoomsByPlayer('金金')
    wx.setStorageSync(cleanupKey, true)
    if (removed.length > 0) {
      wx.showToast({
        title: '已清空金金的未结算房间',
        icon: 'none',
        duration: 2000
      })
    }
  },

  setNavBar: function (theme) {
    if (theme === 'dark') {
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: '#0a0a0a'
      })
    } else {
      wx.setNavigationBarColor({
        frontColor: '#000000',
        backgroundColor: '#f5f0e8'
      })
    }
  },

  onToggleTheme: function () {
    var next = this.data.theme === 'light' ? 'dark' : 'light'
    wx.setStorageSync('poker_theme', next)
    this.setData({ theme: next })
    this.setNavBar(next)
  },

  loadData: function () {
    var profile = storage.getUserProfile()
    var userStats = storage.getUserStats()
    var rooms = storage.getRooms()
    var activeRooms = []
    for (var i = 0; i < rooms.length; i++) {
      if (rooms[i].status === 'playing') {
        activeRooms.push(rooms[i])
      }
      if (activeRooms.length >= 2) break
    }
    this.setData({ profile: profile, userStats: userStats, activeRooms: activeRooms })
  },

  onCreateRoom: function () {
    var profile = storage.getUserProfile()
    if (!profile.nickname) {
      wx.showToast({ title: '请先设置昵称', icon: 'none' })
      return
    }
    if (!profile.avatarUrl) {
      wx.showToast({ title: '请先添加头像', icon: 'none' })
      this.setData({
        showEditModal: true,
        editNickname: profile.nickname,
        editAvatarUrl: ''
      })
      return
    }
    wx.showLoading({ title: '创建中' })
    api.saveMyProfile({
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl
    }).then(function () {
      return api.createRoom({
        name: profile.nickname,
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl
      })
    }).then(function (room) {
      wx.hideLoading()
      storage.saveRoom(room)
      wx.redirectTo({ url: '/pages/room/room?id=' + room.id })
    }).catch(function (err) {
      wx.hideLoading()
      console.error('create room failed', err)
      wx.showModal({
        title: api.getErrorMessage(err, '创建失败'),
        content: api.getErrorDetail(err),
        showCancel: false
      })
    })
  },

  onOpenJoinModal: function () {
    this.setData({
      showJoinModal: true,
      joinRoomCode: ''
    })
  },

  onCloseJoinModal: function () {
    this.setData({
      showJoinModal: false,
      joinRoomCode: ''
    })
  },

  onJoinRoomInput: function (e) {
    var value = (e.detail.value || '').trim().toUpperCase()
    this.setData({ joinRoomCode: value })
  },

  onJoinByCode: function () {
    this.enterRoomByCode(this.data.joinRoomCode)
  },

  onScanEnter: function () {
    var that = this
    wx.scanCode({
      onlyFromCamera: false,
      success: function (res) {
        that.enterRoomByScanResult(res)
      },
      fail: function () {
        wx.showToast({ title: '扫码取消', icon: 'none' })
      }
    })
  },

  enterRoomByScanResult: function (res) {
    var entry = roomEntry.getEntryFromScanResult(res)
    if (entry.roomId) {
      this.enterRoomById(entry.roomId)
      return
    }
    this.enterRoomByCode(entry.roomCode)
  },

  enterRoomById: function (roomId) {
    var value = String(roomId || '').trim()
    var that = this

    if (!value) {
      wx.showToast({ title: '房间不存在', icon: 'none' })
      return
    }

    this.ensureProfileBeforeJoin(function (profile) {
      that.joinRoomById(value, profile)
    })
  },

  joinRoomById: function (roomId, profile) {
    var that = this
    wx.showLoading({ title: '进入中' })
    api.addPlayer(roomId, {
      name: profile.nickname,
      avatarUrl: profile.avatarUrl
    }).then(function (room) {
      wx.hideLoading()
      storage.saveRoom(room)
      that.setData({
        showJoinModal: false,
        joinRoomCode: ''
      })
      wx.navigateTo({ url: '/pages/room/room?id=' + room.id })
    }).catch(function (err) {
      wx.hideLoading()
      console.error('enter room failed', err)
      wx.showToast({ title: api.getErrorMessage(err, '进入失败'), icon: 'none' })
    })
  },

  enterRoomByCode: function (code) {
    var value = (code || '').trim()
    var that = this

    if (!value) {
      wx.showToast({ title: '请输入房间码', icon: 'none' })
      return
    }

    value = roomEntry.normalizeRoomCode(value)
    this.ensureProfileBeforeJoin(function (profile) {
      that.joinRoomByCode(value, profile)
    })
  },

  joinRoomByCode: function (code, profile) {
    var that = this
    wx.showLoading({ title: '进入中' })
    api.getRoomByCode(code).then(function (room) {
      return api.addPlayer(room.id, {
        name: profile.nickname,
        avatarUrl: profile.avatarUrl
      })
    }).then(function (room) {
      wx.hideLoading()
      storage.saveRoom(room)
      that.setData({
        showJoinModal: false,
        joinRoomCode: ''
      })
      wx.navigateTo({ url: '/pages/room/room?id=' + room.id })
    }).catch(function (err) {
      wx.hideLoading()
      console.error('enter room failed', err)
      wx.showToast({ title: api.getErrorMessage(err, '进入失败'), icon: 'none' })
    })
  },

  goHistory: function () {
    wx.navigateTo({ url: '/pages/history/list' })
  },

  onEnterRoom: function (e) {
    var roomId = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/room/room?id=' + roomId })
  },

  onEditProfile: function () {
    this.setData({
      showEditModal: true,
      editNickname: this.data.profile.nickname,
      editAvatarUrl: this.data.profile.avatarUrl
    })
  },

  onCloseModal: function () {
    this.pendingJoinAction = null
    this.setData({ showEditModal: false })
  },

  onNicknameInput: function (e) {
    this.setData({ editNickname: e.detail.value })
  },

  onChooseAvatar: function (e) {
    this.setData({ editAvatarUrl: e.detail.avatarUrl })
  },

  onSaveProfile: function () {
    var nickname = this.data.editNickname.trim()
    var avatarUrl = this.data.editAvatarUrl
    var pendingJoinAction = this.pendingJoinAction
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (!avatarUrl) {
      wx.showToast({ title: '请先添加头像', icon: 'none' })
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
      this.pendingJoinAction = null
      this.setData({
        showEditModal: false
      })
      this.loadData()
      wx.showToast({ title: '保存成功', icon: 'success' })
      if (pendingJoinAction) pendingJoinAction(profile)
    }.bind(this)).catch(function (err) {
      wx.hideLoading()
      wx.showToast({ title: api.getErrorMessage(err, '保存失败'), icon: 'none' })
    })
  },

  ensureProfileBeforeJoin: function (resume) {
    var that = this
    var localProfile = storage.getUserProfile()

    api.getMyProfile().then(function (profile) {
      if (profile && profile.nickname && profile.avatarUrl) {
        storage.saveUserProfile({
          nickname: profile.nickname,
          avatarUrl: profile.avatarUrl
        })
        resume(profile)
        return
      }

      wx.showToast({ title: '请先完善头像和昵称', icon: 'none' })
      that.pendingJoinAction = resume
      that.setData({
        showJoinModal: false,
        showEditModal: true,
        editNickname: (profile && profile.nickname) || localProfile.nickname || '',
        editAvatarUrl: (profile && profile.avatarUrl) || localProfile.avatarUrl || ''
      })
    }).catch(function (err) {
      console.error('load profile failed', err)
      wx.showToast({ title: api.getErrorMessage(err, '请先完善资料'), icon: 'none' })
      that.pendingJoinAction = resume
      that.setData({
        showJoinModal: false,
        showEditModal: true,
        editNickname: localProfile.nickname || '',
        editAvatarUrl: localProfile.avatarUrl || ''
      })
    })
  }
})
