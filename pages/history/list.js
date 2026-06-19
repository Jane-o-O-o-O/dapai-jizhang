const storage = require('../../utils/storage')
const api = require('../../utils/api')

Page({
  data: {
    theme: 'light',
    visibleGames: [],
    filteredCount: -1,
    pageSize: 20,
    keyword: '',
    selectedDate: '',
    currentFilter: 'all',
    filters: [
      { label: '全部', value: 'all' },
      { label: '本周', value: 'week' },
      { label: '本月', value: 'month' }
    ]
  },

  onShow() {
    var that = this
    var theme = wx.getStorageSync('poker_theme') || 'light'
    this.setData({ theme: theme })
    this.setNavBar(theme)
    clearTimeout(this._loadTimer)
    this._loadTimer = setTimeout(function () {
      that.loadGames()
    }, 50)
  },

  onUnload() {
    clearTimeout(this._loadTimer)
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

  loadGames() {
    const games = storage.getGames()
    this._allGames = games
    this.applyFilter()
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value })
    this.applyFilter()
  },

  onSearch() {
    this.applyFilter()
  },

  onClearSearch() {
    this.setData({ keyword: '' })
    this.applyFilter()
  },

  onDateChange(e) {
    this.setData({ selectedDate: e.detail.value })
    this.applyFilter()
  },

  onClearDate() {
    this.setData({ selectedDate: '' })
    this.applyFilter()
  },

  onFilter(e) {
    this.setData({ currentFilter: e.currentTarget.dataset.value })
    this.applyFilter()
  },

  applyFilter() {
    let games = [...(this._allGames || [])]
    const { keyword, selectedDate, currentFilter } = this.data

    // 关键词搜索
    if (keyword) {
      const kw = keyword.toLowerCase()
      games = games.filter(g => {
        if (g.typeName && g.typeName.toLowerCase().includes(kw)) return true
        if (g.location && g.location.toLowerCase().includes(kw)) return true
        if (g.note && g.note.toLowerCase().includes(kw)) return true
        if ((g.players || []).some(p => p.name && p.name.toLowerCase().includes(kw))) return true
        return false
      })
    }

    // 日期筛选
    if (selectedDate) {
      const selected = new Date(selectedDate)
      const year = selected.getFullYear()
      const month = selected.getMonth()
      const day = selected.getDate()

      games = games.filter(g => {
        const gameDate = new Date(g.createdAt)
        return gameDate.getFullYear() === year &&
               gameDate.getMonth() === month &&
               gameDate.getDate() === day
      })
    }

    // 时间筛选
    if (currentFilter === 'week') {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      games = games.filter(g => g.createdAt >= weekAgo)
    } else if (currentFilter === 'month') {
      const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      games = games.filter(g => g.createdAt >= monthAgo)
    }

    this._filteredGames = games
    this.setData({
      filteredCount: games.length,
      visibleGames: games.slice(0, this.data.pageSize)
    })
  },

  onReachBottom() {
    const games = this._filteredGames || []
    const nextCount = this.data.visibleGames.length + this.data.pageSize
    if (this.data.visibleGames.length >= games.length) return

    this.setData({
      visibleGames: games.slice(0, nextCount)
    })
  },

  onCreateRoom() {
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
  }
})
