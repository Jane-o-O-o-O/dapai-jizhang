const storage = require('./utils/storage')

App({
  onLaunch: function () {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'prod-d4g4lbypz81013dea',
        traceUser: true
      })
    }

    storage.init()
  },

  globalData: {
    userInfo: null
  }
})
