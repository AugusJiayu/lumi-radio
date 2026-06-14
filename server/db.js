const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

/**
 * SQLite 数据库封装（使用 sql.js 纯 JS 实现）
 */
class LumiDB {
  // 滚动清理上限
  static MAX_CHAT_ROWS = 500;
  static MAX_PLAY_ROWS = 100;

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
        tts_hash TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 迁移：为已有表补 tts_hash 列
    try {
      this.db.run(`ALTER TABLE chat_history ADD COLUMN tts_hash TEXT`);
    } catch (_) { /* 列已存在则忽略 */ }

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

  saveChat(role, content, metadata = null, ttsHash = null) {
    const stmt = this.db.prepare(
      'INSERT INTO chat_history (role, content, metadata, tts_hash) VALUES (?, ?, ?, ?)'
    );
    stmt.run([role, content, metadata ? JSON.stringify(metadata) : null, ttsHash]);
    stmt.free();
    this._trimTable('chat_history', LumiDB.MAX_CHAT_ROWS);
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
    this._trimTable('play_history', LumiDB.MAX_PLAY_ROWS);
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

  // ===== 滚动清理 =====

  /**
   * 裁剪表到最大行数，删除最旧的记录
   * @param {string} table 表名
   * @param {number} maxRows 保留的最大行数
   */
  _trimTable(table, maxRows) {
    const stmt = this.db.prepare(`SELECT COUNT(*) AS cnt FROM ${table}`);
    stmt.step();
    const count = stmt.getAsObject().cnt;
    stmt.free();

    if (count <= maxRows) return;

    const excess = count - maxRows;
    // 删除最旧的 excess 条（id 最小的）
    this.db.run(
      `DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} ORDER BY id ASC LIMIT ?)`,
      [excess]
    );
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
