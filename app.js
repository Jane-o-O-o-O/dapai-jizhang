// app.js
const storage = require('./utils/storage')

App({
  onLaunch() {
    // 初始化存储
    storage.init()
  },

  globalData: {
    userInfo: null
  }
})
