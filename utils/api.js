const ENV_ID = 'prod-d4g4lbypz81013dea'
const SERVICE_NAME = 'express-s5eq-002'

function request(options) {
  options = options || {}

  return new Promise(function (resolve, reject) {
    if (!wx.cloud || !wx.cloud.callContainer) {
      reject(new Error('cloud_container_unavailable'))
      return
    }

    wx.cloud.callContainer({
      config: {
        env: ENV_ID
      },
      path: options.path,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'X-WX-SERVICE': SERVICE_NAME,
        'content-type': 'application/json'
      },
      success: function (res) {
        var statusCode = res.statusCode || 0
        if (statusCode >= 200 && statusCode < 300) {
          resolve(res.data || {})
          return
        }

        var message = 'request_failed'
        if (res.data && res.data.error) message = res.data.error
        var error = new Error(message)
        error.statusCode = statusCode
        error.response = res.data
        reject(error)
      },
      fail: reject
    })
  })
}

function createRoom(owner) {
  return request({
    path: '/api/rooms',
    method: 'POST',
    data: { owner: owner || {} }
  }).then(function (data) {
    return data.room
  })
}

function getRoom(roomId) {
  return request({
    path: '/api/rooms/' + encodeURIComponent(roomId)
  }).then(function (data) {
    return data.room
  })
}

function getRoomByCode(code) {
  return request({
    path: '/api/rooms/by-code/' + encodeURIComponent(code)
  }).then(function (data) {
    return data.room
  })
}

function listRooms(status) {
  var path = '/api/rooms'
  if (status) path += '?status=' + encodeURIComponent(status)

  return request({ path: path }).then(function (data) {
    return data.rooms || []
  })
}

function addPlayer(roomId, player) {
  return request({
    path: '/api/rooms/' + encodeURIComponent(roomId) + '/players',
    method: 'POST',
    data: player || {}
  }).then(function (data) {
    return data.room
  })
}

function addRound(roomId, sourceId, targetId, amount) {
  return request({
    path: '/api/rooms/' + encodeURIComponent(roomId) + '/rounds',
    method: 'POST',
    data: {
      sourceId: sourceId,
      targetId: targetId,
      amount: amount
    }
  }).then(function (data) {
    return data.room
  })
}

function deleteRound(roomId, roundId) {
  return request({
    path: '/api/rooms/' + encodeURIComponent(roomId) + '/rounds/' + encodeURIComponent(roundId),
    method: 'DELETE'
  }).then(function (data) {
    return data.room
  })
}

function getSettlement(roomId) {
  return request({
    path: '/api/rooms/' + encodeURIComponent(roomId) + '/settlement',
    method: 'POST'
  }).then(function (data) {
    return data.settlementList || []
  })
}

function finishRoom(roomId) {
  return request({
    path: '/api/rooms/' + encodeURIComponent(roomId) + '/finish',
    method: 'POST'
  }).then(function (data) {
    return data.room
  })
}

module.exports = {
  ENV_ID: ENV_ID,
  SERVICE_NAME: SERVICE_NAME,
  request: request,
  createRoom: createRoom,
  getRoom: getRoom,
  getRoomByCode: getRoomByCode,
  listRooms: listRooms,
  addPlayer: addPlayer,
  addRound: addRound,
  deleteRound: deleteRound,
  getSettlement: getSettlement,
  finishRoom: finishRoom
}
