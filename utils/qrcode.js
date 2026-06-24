const SIZE = 21
const QUIET_ZONE = 4
const DATA_CODEWORDS = 19
const EC_CODEWORDS = 7
const MAX_BYTES = 17

function makeTables() {
  var exp = new Array(512)
  var log = new Array(256)
  var x = 1

  for (var i = 0; i < 255; i++) {
    exp[i] = x
    log[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }

  for (var j = 255; j < 512; j++) {
    exp[j] = exp[j - 255]
  }

  return { exp: exp, log: log }
}

const GF = makeTables()

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return GF.exp[GF.log[a] + GF.log[b]]
}

function multiplyPoly(a, b) {
  var result = new Array(a.length + b.length - 1).fill(0)
  for (var i = 0; i < a.length; i++) {
    for (var j = 0; j < b.length; j++) {
      result[i + j] ^= gfMul(a[i], b[j])
    }
  }
  return result
}

function rsGenerator(degree) {
  var poly = [1]
  for (var i = 0; i < degree; i++) {
    poly = multiplyPoly(poly, [1, GF.exp[i]])
  }
  return poly
}

function rsCompute(data, ecCount) {
  var generator = rsGenerator(ecCount)
  var ec = new Array(ecCount).fill(0)

  for (var i = 0; i < data.length; i++) {
    var factor = data[i] ^ ec[0]
    ec.shift()
    ec.push(0)

    if (factor !== 0) {
      for (var j = 0; j < ecCount; j++) {
        ec[j] ^= gfMul(generator[j + 1], factor)
      }
    }
  }

  return ec
}

function pushBits(bits, value, length) {
  for (var i = length - 1; i >= 0; i--) {
    bits.push((value >> i) & 1)
  }
}

function textToBytes(text) {
  var bytes = []
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i)
    if (code > 255) throw new Error('qr_text_must_be_ascii')
    bytes.push(code)
  }
  return bytes
}

function buildDataCodewords(text) {
  var bytes = textToBytes(text)
  if (bytes.length > MAX_BYTES) throw new Error('qr_text_too_long')

  var bits = []
  pushBits(bits, 0x4, 4)
  pushBits(bits, bytes.length, 8)

  for (var i = 0; i < bytes.length; i++) {
    pushBits(bits, bytes[i], 8)
  }

  var maxBits = DATA_CODEWORDS * 8
  var terminator = Math.min(4, maxBits - bits.length)
  for (var t = 0; t < terminator; t++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  var data = []
  for (var b = 0; b < bits.length; b += 8) {
    var value = 0
    for (var k = 0; k < 8; k++) {
      value = (value << 1) | bits[b + k]
    }
    data.push(value)
  }

  var pads = [0xec, 0x11]
  var padIndex = 0
  while (data.length < DATA_CODEWORDS) {
    data.push(pads[padIndex % 2])
    padIndex++
  }

  return data
}

function createMatrix() {
  var modules = []
  var reserved = []
  for (var y = 0; y < SIZE; y++) {
    modules[y] = []
    reserved[y] = []
    for (var x = 0; x < SIZE; x++) {
      modules[y][x] = false
      reserved[y][x] = false
    }
  }
  return { modules: modules, reserved: reserved }
}

function setModule(matrix, x, y, dark, reserve) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  matrix.modules[y][x] = !!dark
  if (reserve) matrix.reserved[y][x] = true
}

function addFinder(matrix, x, y) {
  for (var dy = -1; dy <= 7; dy++) {
    for (var dx = -1; dx <= 7; dx++) {
      var xx = x + dx
      var yy = y + dy
      var inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
      var dark = inFinder && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4))
      setModule(matrix, xx, yy, dark, true)
    }
  }
}

function addPatterns(matrix) {
  addFinder(matrix, 0, 0)
  addFinder(matrix, SIZE - 7, 0)
  addFinder(matrix, 0, SIZE - 7)

  for (var i = 8; i <= SIZE - 9; i++) {
    setModule(matrix, i, 6, i % 2 === 0, true)
    setModule(matrix, 6, i, i % 2 === 0, true)
  }

  setModule(matrix, 8, SIZE - 8, true, true)
}

function setFormatBits(matrix, formatBits) {
  for (var i = 0; i < 15; i++) {
    var dark = ((formatBits >> i) & 1) === 1

    if (i < 6) setModule(matrix, 8, i, dark, true)
    else if (i < 8) setModule(matrix, 8, i + 1, dark, true)
    else setModule(matrix, 8, SIZE - 15 + i, dark, true)

    if (i < 8) setModule(matrix, SIZE - i - 1, 8, dark, true)
    else if (i < 9) setModule(matrix, 7, 8, dark, true)
    else setModule(matrix, 15 - i - 1, 8, dark, true)
  }

  setModule(matrix, 8, SIZE - 8, true, true)
}

function reserveFormat(matrix) {
  setFormatBits(matrix, 0)
}

function getFormatBits() {
  var data = 1 << 3
  var value = data << 10
  var generator = 0x537

  for (var i = 14; i >= 10; i--) {
    if (((value >> i) & 1) !== 0) {
      value ^= generator << (i - 10)
    }
  }

  return ((data << 10) | value) ^ 0x5412
}

function addData(matrix, codewords) {
  var bits = []
  for (var i = 0; i < codewords.length; i++) {
    pushBits(bits, codewords[i], 8)
  }

  var bitIndex = 0
  var upward = true

  for (var x = SIZE - 1; x > 0; x -= 2) {
    if (x === 6) x--

    for (var row = 0; row < SIZE; row++) {
      var y = upward ? SIZE - 1 - row : row

      for (var dx = 0; dx < 2; dx++) {
        var xx = x - dx
        if (matrix.reserved[y][xx]) continue

        var bit = bitIndex < bits.length ? bits[bitIndex] === 1 : false
        var mask = ((xx + y) % 2) === 0
        setModule(matrix, xx, y, bit !== mask, false)
        bitIndex++
      }
    }

    upward = !upward
  }
}

function createMatrixForText(text) {
  var data = buildDataCodewords(text)
  var ec = rsCompute(data, EC_CODEWORDS)
  var matrix = createMatrix()

  addPatterns(matrix)
  reserveFormat(matrix)
  addData(matrix, data.concat(ec))
  setFormatBits(matrix, getFormatBits())

  return matrix.modules
}

function createRows(text) {
  var modules = createMatrixForText(text)
  var rows = []

  for (var y = -QUIET_ZONE; y < SIZE + QUIET_ZONE; y++) {
    var cells = []
    for (var x = -QUIET_ZONE; x < SIZE + QUIET_ZONE; x++) {
      var inside = x >= 0 && y >= 0 && x < SIZE && y < SIZE
      cells.push({ dark: inside ? modules[y][x] : false })
    }
    rows.push({ cells: cells })
  }

  return rows
}

module.exports = {
  createRows: createRows
}
