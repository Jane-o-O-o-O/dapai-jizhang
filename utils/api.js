const FUNCTION_NAME = 'room-api'

function normalizeError(err) {
  var raw = err || {}
  var detail = raw.result || raw.response || raw
  var code = raw.message || 'request_failed'
  var message = code

  if (detail && detail.error) {
    code = detail.error
    message = detail.error
  }
  if (detail && detail.errMsg) message = detail.errMsg
  if (detail && detail.message) message = detail.message

  var error = new Error(message)
  error.code = code
  error.response = detail
  return error
}

function getErrorMessage(err, fallback) {
  var code = (err && (err.code || err.message)) || ''
  var detailMessage = ''
  if (err && err.response) {
    detailMessage = err.response.message || err.response.errMsg || ''
  }
  var lowerDetail = detailMessage.toLowerCase()
  var lowerCode = String(code || '').toLowerCase()
  var messages = {
    cloud_function_unavailable: '云开发不可用',
    room_not_found: '房间不存在',
    room_code_required: '请输入房间码',
    owner_name_required: '请先设置昵称',
    player_name_required: '请输入昵称',
    source_and_target_required: '请选择玩家',
    amount_invalid: '请输入正确金额',
    player_not_found: '玩家不存在',
    round_not_found: '记录不存在',
    player_avatar_required: '请添加头像',
    profile_required: '请先完善头像和昵称',
    openid_required: '登录状态异常',
    action_not_found: '接口不存在',
    internal_error: '云服务异常'
  }

  if (lowerDetail.indexOf('collection') >= 0 || lowerDetail.indexOf('database') >= 0 || lowerDetail.indexOf('coll not exists') >= 0) return '云数据库未初始化'
  if (lowerDetail.indexOf('permission') >= 0 || lowerDetail.indexOf('access') >= 0 || lowerDetail.indexOf('auth') >= 0) return '云数据库无权限'
  if (messages[code]) return messages[code]
  if (lowerCode.indexOf('collection') >= 0 || lowerCode.indexOf('database') >= 0 || lowerCode.indexOf('coll not exists') >= 0) return '云数据库未初始化'
  if (lowerCode.indexOf('permission') >= 0 || lowerCode.indexOf('access') >= 0 || lowerCode.indexOf('auth') >= 0) return '云数据库无权限'
  if (lowerCode.indexOf('functionname') >= 0 || lowerCode.indexOf('function') >= 0) return '云函数未部署'
  return fallback || '操作失败'
}

function getErrorDetail(err) {
  if (!err) return '没有收到错误详情'
  var response = err.response || {}
  var detail = response.message || response.errMsg || err.message || err.code || ''
  if (!detail) return '没有收到错误详情'
  return String(detail).slice(0, 500)
}

function request(action, data) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud || !wx.cloud.callFunction) {
      reject(new Error('cloud_function_unavailable'))
      return
    }

    wx.cloud.callFunction({
      name: FUNCTION_NAME,
      data: {
        action: action,
        payload: data || {}
      },
      success: function (res) {
        var result = res.result || {}
        if (result.ok === false) {
          reject(normalizeError(result))
          return
        }
        resolve(result)
      },
      fail: function (err) {
        reject(normalizeError(err))
      }
    })
  })
}

function createRoom(owner) {
  return request('createRoom', { owner: owner || {} }).then(function (data) {
    return data.room
  })
}

function ping() {
  return request('ping', {})
}

function getMyProfile() {
  return request('getMyProfile', {}).then(function (data) {
    return data.profile || null
  })
}

function saveMyProfile(profile) {
  return request('saveMyProfile', profile || {}).then(function (data) {
    return data.profile || null
  })
}

function getRoom(roomId) {
  return request('getRoom', { roomId: roomId }).then(function (data) {
    return data.room
  })
}

function getRoomByCode(code) {
  return request('getRoomByCode', { code: code }).then(function (data) {
    return data.room
  })
}

function listRooms(status) {
  return request('listRooms', { status: status || '' }).then(function (data) {
    return data.rooms || []
  })
}

function addPlayer(roomId, player) {
  return request('addPlayer', {
    roomId: roomId,
    player: player || {}
  }).then(function (data) {
    return data.room
  })
}

function addRound(roomId, sourceId, targetId, amount) {
  return request('addRound', {
    roomId: roomId,
    sourceId: sourceId,
    targetId: targetId,
    amount: amount
  }).then(function (data) {
    return data.room
  })
}

function deleteRound(roomId, roundId) {
  return request('deleteRound', {
    roomId: roomId,
    roundId: roundId
  }).then(function (data) {
    return data.room
  })
}

function getSettlement(roomId) {
  return request('getSettlement', { roomId: roomId }).then(function (data) {
    return data.settlementList || []
  })
}

function finishRoom(roomId) {
  return request('finishRoom', { roomId: roomId }).then(function (data) {
    return {
      room: data.room,
      game: data.game
    }
  })
}

function getRoomQRCode(roomId) {
  return request('getRoomQRCode', { roomId: roomId }).then(function (data) {
    return {
      fileID: data.fileID || '',
      tempFileURL: data.tempFileURL || ''
    }
  })
}

module.exports = {
  FUNCTION_NAME: FUNCTION_NAME,
  request: request,
  getErrorMessage: getErrorMessage,
  getErrorDetail: getErrorDetail,
  ping: ping,
  getMyProfile: getMyProfile,
  saveMyProfile: saveMyProfile,
  createRoom: createRoom,
  getRoom: getRoom,
  getRoomByCode: getRoomByCode,
  listRooms: listRooms,
  addPlayer: addPlayer,
  addRound: addRound,
  deleteRound: deleteRound,
  getSettlement: getSettlement,
  finishRoom: finishRoom,
  getRoomQRCode: getRoomQRCode
}
