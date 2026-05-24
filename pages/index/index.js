const storage = require('../../utils/storage')

Page({
  data: {
    theme: 'light',
    profile: { nickname: '', avatarUrl: '' },
    userStats: { totalGames: 0, winCount: 0, winRate: 0 },
    activeRooms: [],
    showEditModal: false,
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
    var room = storage.createRoom(profile.nickname, profile.avatarUrl)
    wx.redirectTo({ url: '/pages/room/room?id=' + room.id })
  },

  onScanEnter: function () {
    wx.scanCode({
      onlyFromCamera: false,
      success: function (res) {
        var result = res.result
        if (result && result.indexOf('poker_room:') === 0) {
          var roomId = result.replace('poker_room:', '')
          var room = storage.getRoomById(roomId)
          if (room) {
            wx.navigateTo({ url: '/pages/room/room?id=' + roomId })
          } else {
            wx.showToast({ title: '房间不存在', icon: 'none' })
          }
        } else {
          wx.showToast({ title: '无效的房间码', icon: 'none' })
        }
      },
      fail: function () {
        wx.showToast({ title: '扫码取消', icon: 'none' })
      }
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
