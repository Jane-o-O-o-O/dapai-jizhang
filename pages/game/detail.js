const storage = require('../../utils/storage')

Page({
  data: {
    theme: 'light',
    gameId: '',
    game: {},
    rankings: [],
    timeText: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ gameId: options.id })
    }
  },

  onShow() {
    var theme = wx.getStorageSync('poker_theme') || 'light'
    this.setData({ theme: theme })
    this.setNavBar(theme)
    this.loadGame()
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

  loadGame() {
    const game = storage.getGameById(this.data.gameId)
    if (!game) {
      wx.showToast({ title: '牌局不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    const scores = storage.calcGameScores(game)
    const rankings = game.players.map(p => ({
      ...p,
      total: scores[p.id] ? scores[p.id].total : 0
    })).sort((a, b) => b.total - a.total)

    this.setData({
      game,
      rankings,
      timeText: storage.formatDate(game.createdAt, 'YYYY-MM-DD HH:mm')
    })
  },

  onDelete() {
    var that = this
    wx.showModal({
      title: '删除牌局',
      content: '确定删除该牌局吗？此操作不可恢复。',
      success: function (res) {
        if (res.confirm) {
          storage.deleteGame(that.data.gameId)
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1000)
        }
      }
    })
  }
})
