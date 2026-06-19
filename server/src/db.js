const fs = require('fs')
const path = require('path')
const { DatabaseSync } = require('node:sqlite')

const dbPath = path.resolve(process.cwd(), process.env.SQLITE_PATH || './data/dapai-jizhang.sqlite')
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const sqlite = new DatabaseSync(dbPath)
sqlite.exec('PRAGMA journal_mode = WAL')
sqlite.exec('PRAGMA foreign_keys = ON')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    openid TEXT PRIMARY KEY,
    nickname TEXT NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_rooms_status_updated
    ON rooms(status, updated_at DESC);

  CREATE TABLE IF NOT EXISTS histories (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    finished_at INTEGER NOT NULL
  );
`)

function runStatement(statement, method, params) {
  if (!params || params.length === 0) return statement[method]()
  if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    return statement[method](params[0])
  }
  return statement[method](...params)
}

module.exports = {
  exec(sql) {
    return sqlite.exec(sql)
  },

  prepare(sql) {
    const statement = sqlite.prepare(sql)

    return {
      get(...params) {
        return runStatement(statement, 'get', params)
      },

      all(...params) {
        return runStatement(statement, 'all', params)
      },

      run(...params) {
        return runStatement(statement, 'run', params)
      }
    }
  }
}
