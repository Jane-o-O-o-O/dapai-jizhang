const storage = require('../../utils/storage')
const api = require('../../utils/api')

Page({
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
    wx.showLoading({ title: '创建中' })
    api.createRoom({
      name: profile.nickname,
      nickname: profile.nickname,
      avatarUrl: profile.avatarUrl
    }).then(function (room) {
      wx.hideLoading()
      storage.saveRoom(room)
      wx.redirectTo({ url: '/pages/room/room?id=' + room.id })
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '创建失败', icon: 'none' })
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
        that.enterRoomByCode(res.result)
      },
      fail: function () {
        wx.showToast({ title: '扫码取消', icon: 'none' })
      }
    })
  },

  enterRoomByCode: function (code) {
    var value = (code || '').trim()
    var profile = storage.getUserProfile()
    var that = this

    if (!value) {
      wx.showToast({ title: '请输入房间码', icon: 'none' })
      return
    }

    if (!profile.nickname) {
      wx.showToast({ title: '请先设置昵称', icon: 'none' })
      this.setData({
        showJoinModal: false,
        showEditModal: true,
        editNickname: '',
        editAvatarUrl: profile.avatarUrl
      })
      return
    }

    if (value.indexOf('poker_room:') === 0) {
      value = value.replace('poker_room:', '')
    }

    wx.showLoading({ title: '进入中' })
    api.getRoomByCode(value).then(function (room) {
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
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '房间不存在', icon: 'none' })
    })
  },

  findRoomByCode: function (code) {
    var value = (code || '').trim()
    if (!value) {
      wx.showToast({ title: '请输入房间码', icon: 'none' })
      return null
    }

    if (value.indexOf('poker_room:') === 0) {
      value = value.replace('poker_room:', '')
    }

    var room = storage.getRoomById(value)
    if (room) return room

    var roomName = value.toUpperCase()
    var rooms = storage.getRooms()
    for (var i = 0; i < rooms.length; i++) {
      if ((rooms[i].name || '').toUpperCase() === roomName) {
        return storage.getRoomById(rooms[i].id) || rooms[i]
      }
    }

    return null
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
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    storage.saveUserProfile({
      nickname: nickname,
      avatarUrl: this.data.editAvatarUrl
    })
    this.setData({ showEditModal: false })
    this.loadData()
    wx.showToast({ title: '保存成功', icon: 'success' })
  }
})
