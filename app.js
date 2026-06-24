const storage = require('./utils/storage')

App({
  onLaunch: function () {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d3g82yzmu88423dca',
        traceUser: true
      })
    }

    storage.init()
  },

  globalData: {
    userInfo: null
  }
})
