const storage = require('../../utils/storage')

Component({
  properties: {
    game: {
      type: Object,
      value: {}
    },
    theme: {
      type: String,
      value: 'light'
    }
  },

  data: {
    timeText: '',
    topPlayer: null
  },

  lifetimes: {
    attached() {
      this.updateDisplay()
    }
  },

  observers: {
    'game'() {
      this.updateDisplay()
    }
  },

  methods: {
    updateDisplay() {
      const game = this.data.game
      if (!game || !game.createdAt) return

      this.setData({
        timeText: storage.formatDate(game.createdAt, 'YYYY-MM-DD')
      })

      if (game.status === 'finished' && game.topPlayer) {
        this.setData({
          topPlayer: { name: game.topPlayer.name, score: game.topPlayer.total }
        })
      } else if (game.status === 'finished' && game.rounds && game.rounds.length > 0) {
        const scores = storage.calcGameScores(game)
        const entries = Object.values(scores).sort((a, b) => b.total - a.total)
        if (entries.length > 0) {
          this.setData({
            topPlayer: { name: entries[0].name, score: entries[0].total }
          })
        }
      }
    },

    onTap() {
      const game = this.data.game
      wx.navigateTo({ url: `/pages/game/detail?id=${game.id}` })
    }
  }
})
