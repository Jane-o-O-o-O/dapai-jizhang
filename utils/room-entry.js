function safeDecode(value) {
  try {
    return decodeURIComponent(value || '')
  } catch (err) {
    return value || ''
  }
}

function parseParams(text) {
  var params = {}
  var source = safeDecode(text).replace(/^\?/, '')
  if (!source) return params

  var pairs = source.split('&')
  for (var i = 0; i < pairs.length; i++) {
    if (!pairs[i]) continue
    var parts = pairs[i].split('=')
    var key = safeDecode(parts.shift() || '').trim()
    var value = safeDecode(parts.join('=') || '').trim()
    if (key) params[key] = value
  }

  return params
}

function parseQueryFromPath(path) {
  var value = path || ''
  var queryIndex = value.indexOf('?')
  if (queryIndex < 0) return {}
  return parseParams(value.slice(queryIndex + 1))
}

function normalizeRoomCode(code) {
  var value = String(code || '').trim()
  if (value.indexOf('poker_room:') === 0) {
    value = value.replace('poker_room:', '')
  }
  return value.toUpperCase()
}

function getEntryFromOptions(options) {
  var rawOptions = options || {}
  var sceneParams = parseParams(rawOptions.scene || '')
  var roomId = rawOptions.id || rawOptions.roomId || sceneParams.r || sceneParams.id || sceneParams.roomId || ''
  var roomCode = rawOptions.code || sceneParams.c || sceneParams.code || ''

  if (!roomId && !roomCode && rawOptions.scene) {
    roomCode = normalizeRoomCode(rawOptions.scene)
  }

  return {
    roomId: String(roomId || '').trim(),
    roomCode: normalizeRoomCode(roomCode),
    scene: rawOptions.scene || ''
  }
}

function getEntryFromPath(path) {
  return getEntryFromOptions(parseQueryFromPath(path || ''))
}

function getEntryFromScanResult(scanResult) {
  var result = scanResult || {}
  var pathEntry = getEntryFromPath(result.path || '')
  if (pathEntry.roomId || pathEntry.roomCode) return pathEntry

  return {
    roomId: '',
    roomCode: normalizeRoomCode(result.result || ''),
    scene: ''
  }
}

module.exports = {
  getEntryFromOptions: getEntryFromOptions,
  getEntryFromPath: getEntryFromPath,
  getEntryFromScanResult: getEntryFromScanResult,
  normalizeRoomCode: normalizeRoomCode,
  parseParams: parseParams
}
