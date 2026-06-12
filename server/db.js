const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

/**
 * SQLite 数据库封装（使用 sql.js 纯 JS 实现）
 */
class LumiDB {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    // 使用与 SQLite datetime('now','localtime') 一致的格式，避免字符串比较失败
    this.sessionStartedAt = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
    this.ready = this.init();
  }

  async init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();

    // 如果数据库文件存在，加载它
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    this.createTables();
    return this;
  }

  /**
   * 等待数据库就绪
   */
  async waitForReady() {
    if (!this.db) await this.ready;
    return this;
  }

  /**
   * 保存数据库到文件
   */
  save() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_name TEXT NOT NULL,
        artist TEXT NOT NULL,
        song_id TEXT,
        source TEXT DEFAULT 'netease',
        played_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS user_prefs (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS tts_cache (
        hash TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS liked_songs (
        song_id TEXT PRIMARY KEY,
        song_name TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        genre TEXT,
        liked_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    this.save();
  }

  // ===== 聊天记录 =====

  saveChat(role, content, metadata = null) {
    const stmt = this.db.prepare(
      'INSERT INTO chat_history (role, content, metadata) VALUES (?, ?, ?)'
    );
    stmt.run([role, content, metadata ? JSON.stringify(metadata) : null]);
    stmt.free();
    this.save();
  }

  getChatHistory(limit = 50, since = null) {
    let sql = 'SELECT * FROM chat_history';
    const params = [];
    if (since) {
      sql += ' WHERE created_at >= ?';
      params.push(since);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results.reverse();
  }

  // ===== 播放记录 =====

  savePlayRecord(songName, artist, songId = null) {
    const stmt = this.db.prepare(
      'INSERT INTO play_history (song_name, artist, song_id) VALUES (?, ?, ?)'
    );
    stmt.run([songName, artist, songId]);
    stmt.free();
    this.save();
  }

  getRecentPlays(limit = 10) {
    const stmt = this.db.prepare(
      'SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?'
    );
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  getPlayHistory(limit = 100) {
    const stmt = this.db.prepare(
      'SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?'
    );
    stmt.bind([limit]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  // ===== 用户偏好 =====

  getPref(key, defaultValue = null) {
    const stmt = this.db.prepare('SELECT value FROM user_prefs WHERE key = ?');
    stmt.bind([key]);
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject().value;
    }
    stmt.free();

    if (result === null) return defaultValue;

    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }

  setPref(key, value) {
    const stmt = this.db.prepare(
      "INSERT OR REPLACE INTO user_prefs (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))"
    );
    stmt.run([key, typeof value === 'string' ? value : JSON.stringify(value)]);
    stmt.free();
    this.save();
  }

  getAllPrefs() {
    const stmt = this.db.prepare('SELECT * FROM user_prefs');
    const prefs = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      try {
        prefs[row.key] = JSON.parse(row.value);
      } catch {
        prefs[row.key] = row.value;
      }
    }
    stmt.free();
    return prefs;
  }

  // ===== TTS 缓存索引 =====

  getTTSCache(hash) {
    const stmt = this.db.prepare('SELECT * FROM tts_cache WHERE hash = ?');
    stmt.bind([hash]);
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  }

  saveTTSCache(hash, filePath) {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO tts_cache (hash, file_path) VALUES (?, ?)'
    );
    stmt.run([hash, filePath]);
    stmt.free();
    this.save();
  }

  // ===== 清理 =====

  close() {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = LumiDB;
