require('dotenv').config();

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const LumiDB = require('./db');
const LLMAdapter = require('./llm-adapter');
const Context = require('./context');
const Router = require('./router');
const Scheduler = require('./scheduler');
const NeteaseMusic = require('./music/netease');
const MimoTTS = require('./tts/mimo-tts');
const MimoSTT = require('./stt/mimo-stt');
const fetch = require('node-fetch');

// ===== 初始化 =====

const PORT = process.env.SERVER_PORT || 3077;
const DB_PATH = path.join(__dirname, '../data/lumi.db');
const USER_DIR = path.join(__dirname, '../user');

let db, llmAdapter, context, musicService, ttsService, sttService, router, scheduler;
let server, wss;

/**
 * 启动后端服务
 */
async function startServer() {
  // 初始化数据库（sql.js 是异步的）
  db = new LumiDB(DB_PATH);
  await db.waitForReady();

  // 初始化各模块
  llmAdapter = new LLMAdapter(db);
  context = new Context(USER_DIR);
  musicService = new NeteaseMusic();
  // 加载已保存的网易云登录 cookie
  const savedCookie = db.getPref('netease_cookie', '');
  if (savedCookie) {
    musicService.setCookie(savedCookie);
    console.log('[Server] 已加载网易云登录状态');
  }
  ttsService = new MimoTTS({
    apiKey: db.getPref('tts_api_key', process.env.TTS_API_KEY),
    baseUrl: db.getPref('tts_base_url', process.env.TTS_BASE_URL),
    voiceId: db.getPref('tts_voice_id', process.env.TTS_VOICE_ID),
    speed: db.getPref('tts_speed', parseFloat(process.env.TTS_SPEED) || 0.9)
  });
  sttService = new MimoSTT({
    apiKey: db.getPref('stt_api_key', process.env.STT_API_KEY || db.getPref('tts_api_key', process.env.TTS_API_KEY)),
    baseUrl: db.getPref('stt_base_url', process.env.STT_BASE_URL || 'https://api.siliconflow.cn'),
    apiPath: db.getPref('stt_api_path', process.env.STT_API_PATH || '/v1/audio/transcriptions'),
    model: db.getPref('stt_model', process.env.STT_MODEL || 'FunAudioLLM/SenseVoiceSmall'),
    language: db.getPref('stt_language', process.env.STT_LANGUAGE || 'zh'),
    authMode: db.getPref('stt_auth_mode', process.env.STT_AUTH_MODE || 'bearer')
  });
  router = new Router(context, llmAdapter, musicService, ttsService, db);
  scheduler = new Scheduler(router, db);

  // Express 应用
  const app = express();
  app.use(express.json());

  // 静态文件服务：TTS 缓存
  app.use('/tts', express.static(path.join(__dirname, '../data/tts-cache')));

  // 静态文件服务：前端
  app.use(express.static(path.join(__dirname, '../renderer')));

  // ===== API 路由 =====

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', uptime: process.uptime() });
  });

  // 获取聊天历史
  app.get('/api/history', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json(db.getChatHistory(limit));
  });

  // 获取播放记录
  app.get('/api/plays', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(db.getPlayHistory(limit));
  });

  // 获取/更新配置
  app.get('/api/config', (req, res) => {
    res.json({
      llm: llmAdapter.getConfig(),
      tts: {
        voiceId: ttsService.voiceId,
        speed: ttsService.speed
      },
      stt: {
        baseUrl: sttService.baseUrl,
        apiPath: sttService.apiPath,
        model: sttService.model,
        language: sttService.language,
        authMode: sttService.authMode
      },
      autoBroadcast: db.getPref('auto_broadcast', true),
      username: db.getPref('username', '')
    });
  });

  app.post('/api/config', (req, res) => {
    try {
      const { llm, tts, stt, autoBroadcast, key, value } = req.body;

      // 通用 key-value 存储
      if (key && value !== undefined) {
        db.setPref(key, value);
        return res.json({ success: true });
      }

      if (llm) llmAdapter.updateConfig(llm);
      if (tts) {
        ttsService.updateConfig(tts);
        if (tts.apiKey) db.setPref('tts_api_key', tts.apiKey);
        if (tts.voiceId) db.setPref('tts_voice_id', tts.voiceId);
        if (tts.speed !== undefined) db.setPref('tts_speed', tts.speed);
      }
      if (stt) {
        if (stt.apiKey) { sttService.apiKey = stt.apiKey; db.setPref('stt_api_key', stt.apiKey); }
        if (stt.baseUrl) { sttService.baseUrl = stt.baseUrl.replace(/\/+$/, ''); db.setPref('stt_base_url', stt.baseUrl); }
        if (stt.apiPath) { sttService.apiPath = stt.apiPath; db.setPref('stt_api_path', stt.apiPath); }
        if (stt.model) { sttService.model = stt.model; db.setPref('stt_model', stt.model); }
        if (stt.language) { sttService.language = stt.language; db.setPref('stt_language', stt.language); }
        if (stt.authMode) { sttService.authMode = stt.authMode; db.setPref('stt_auth_mode', stt.authMode); }
      }
      if (autoBroadcast !== undefined) {
        db.setPref('auto_broadcast', autoBroadcast);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 获取用户品味文件内容
  app.get('/api/user-files/:filename', (req, res) => {
    const filename = req.params.filename;
    const allowed = ['taste.md', 'routines.md', 'mood-rules.md', 'FavPlaylists.json'];
    if (!allowed.includes(filename)) {
      return res.status(400).json({ error: '不允许访问该文件' });
    }

    const filePath = path.join(USER_DIR, filename);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({ filename, content });
    } catch (err) {
      res.status(404).json({ error: '文件不存在' });
    }
  });

  // 更新用户品味文件
  app.put('/api/user-files/:filename', (req, res) => {
    const filename = req.params.filename;
    const allowed = ['taste.md', 'routines.md', 'mood-rules.md'];
    if (!allowed.includes(filename)) {
      return res.status(400).json({ error: '不允许修改该文件' });
    }

    const filePath = path.join(USER_DIR, filename);
    try {
      fs.writeFileSync(filePath, req.body.content, 'utf-8');
      context.reload();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===== 头像 =====
  const AVATAR_DIR = path.join(__dirname, '../data');
  const AVATAR_PATH = path.join(AVATAR_DIR, 'avatar.png');

  // 静态文件服务：data 目录（头像等）
  app.use('/data', express.static(AVATAR_DIR));

  app.get('/api/avatar', (req, res) => {
    if (fs.existsSync(AVATAR_PATH)) {
      res.json({ exists: true, url: `/data/avatar.png?t=${Date.now()}` });
    } else {
      res.json({ exists: false, url: null });
    }
  });

  app.post('/api/avatar', (req, res) => {
    try {
      const { image } = req.body; // base64 data URL
      if (!image) return res.status(400).json({ error: '缺少图片数据' });

      // 去掉 data:image/xxx;base64, 前缀
      const base64 = image.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');

      // 限制 5MB
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: '图片不能超过 5MB' });
      }

      if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
      fs.writeFileSync(AVATAR_PATH, buffer);
      res.json({ success: true, url: `/data/avatar.png?t=${Date.now()}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 获取调度任务
  app.get('/api/scheduler', (req, res) => {
    res.json(scheduler.getJobs());
  });

  // 获取歌词（供切歌时前端请求）
  app.get('/api/lyrics/:id', async (req, res) => {
    try {
      const lyricData = await musicService.getLyric(req.params.id);
      const lrc = lyricData.lrc || '';
      const tlyric = lyricData.tlyric || '';
      res.json({ lrc, tlyric });
    } catch (err) {
      res.json({ lrc: '', tlyric: '' });
    }
  });

  // ===== 喜欢的歌曲（FavPlaylists.json） =====

  const FAV_PATH = path.join(USER_DIR, 'FavPlaylists.json');

  function readFavPlaylists() {
    try {
      return JSON.parse(fs.readFileSync(FAV_PATH, 'utf-8'));
    } catch {
      return { songs: [] };
    }
  }

  function writeFavPlaylists(data) {
    fs.writeFileSync(FAV_PATH, JSON.stringify(data, null, 2), 'utf-8');
    if (context) context.reload();
  }

  // 获取已喜欢的歌曲列表
  app.get('/api/liked-songs', (req, res) => {
    try {
      const fav = readFavPlaylists();
      const liked = fav.songs.map(s => s.name);
      res.json({ liked, songs: fav.songs });
    } catch (err) {
      res.json({ liked: [], songs: [] });
    }
  });

  // 喜欢/取消喜欢
  app.post('/api/liked-songs', (req, res) => {
    try {
      const { action, song } = req.body;
      const fav = readFavPlaylists();

      if (action === 'like') {
        // 去重：检查是否已存在
        const exists = fav.songs.some(s => s.name === song.name && s.artist === song.artist);
        if (!exists) {
          fav.songs.push({
            name: song.name,
            artist: song.artist
          });
          writeFavPlaylists(fav);
        }
      } else if (action === 'unlike') {
        fav.songs = fav.songs.filter(s => !(s.name === song.name && s.artist === song.artist));
        writeFavPlaylists(fav);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ===== 网易云 QR 扫码登录 =====

  const NETEASE_API = process.env.NETEASE_API || 'http://localhost:3000';

  // 获取 QR 登录 key
  app.get('/api/netease/qr-key', async (req, res) => {
    try {
      const ts = Date.now();
      const resp = await fetch(`${NETEASE_API}/login/qr/key?timestamp=${ts}`);
      const data = await resp.json();
      res.json(data);
    } catch (err) {
      console.error('[Netease] 获取 QR key 失败:', err.message);
      res.status(500).json({ code: -1, message: '获取二维码失败' });
    }
  });

  // 创建 QR 二维码图片
  app.get('/api/netease/qr-create', async (req, res) => {
    try {
      const key = req.query.key;
      if (!key) return res.status(400).json({ code: -1, message: '缺少 key 参数' });
      const resp = await fetch(`${NETEASE_API}/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true&timestamp=${Date.now()}`);
      const data = await resp.json();
      res.json(data);
    } catch (err) {
      console.error('[Netease] 创建 QR 失败:', err.message);
      res.status(500).json({ code: -1, message: '创建二维码失败' });
    }
  });

  // 轮询 QR 扫码状态
  app.get('/api/netease/qr-check', async (req, res) => {
    try {
      const key = req.query.key;
      if (!key) return res.status(400).json({ code: -1, message: '缺少 key 参数' });
      const resp = await fetch(`${NETEASE_API}/login/qr/check?key=${encodeURIComponent(key)}&timestamp=${Date.now()}`);
      const data = await resp.json();

      // 登录成功：code 803，从 Set-Cookie 中提取 MUSIC_U
      if (data.code === 803) {
        const setCookie = resp.headers.get('set-cookie') || '';
        const match = setCookie.match(/MUSIC_U=([^;]+)/);
        if (match) {
          const musicU = match[1];
          musicService.setCookie(musicU);
          db.setPref('netease_cookie', musicU);
          console.log('[Netease] 登录成功，cookie 已保存');
        }
      }

      res.json(data);
    } catch (err) {
      console.error('[Netease] 检查 QR 状态失败:', err.message);
      res.status(500).json({ code: -1, message: '检查扫码状态失败' });
    }
  });

  // 获取网易云登录状态
  app.get('/api/netease/status', (req, res) => {
    res.json({ loggedIn: !!musicService.getCookie() });
  });

  // 登出网易云
  app.post('/api/netease/logout', (req, res) => {
    musicService.setCookie('');
    db.setPref('netease_cookie', '');
    res.json({ success: true });
  });

  // ===== HTTP + WebSocket 服务 =====

  return new Promise((resolve, reject) => {
    server = http.createServer(app);

    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
      console.log('[Server] 新的 WebSocket 连接');
      router.addClient(ws);

      // STT 状态：累计音频块 + 转写锁
      let sttActive = false;
      let sttChunkIndex = 0;
      let sttTranscribing = false;
      let sttPending = [];

      ws.on('message', (data, isBinary) => {
        // 二进制数据 → 音频块，排队转写
        if (isBinary && sttActive) {
          const chunk = Buffer.from(data);
          if (sttTranscribing) {
            sttPending.push(chunk);
          } else {
            transcribeChunk(chunk, sttChunkIndex++);
          }
          return;
        }

        // 文本数据 → JSON 控制消息
        try {
          const msg = JSON.parse(data);
          switch (msg.type) {
            case 'user_message':
              router.handleMessage(msg.text, ws).catch(err => {
                console.error('[Server] 处理消息失败:', err.message);
                if (ws.readyState === 1) {
                  ws.send(JSON.stringify({ type: 'error', message: '抱歉，我刚才走神了，能再说一遍吗？' }));
                }
              });
              break;
            case 'command':
              router.executeCommand({ action: msg.action }, ws);
              break;
            case 'ping':
              if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'pong' }));
              break;

            // ===== 语音识别 =====
            case 'stt_start':
              sttActive = true;
              sttChunkIndex = 0;
              sttTranscribing = false;
              sttPending = [];
              console.log('[STT] 会话已开始');
              if (ws.readyState === 1) {
                ws.send(JSON.stringify({ type: 'stt_started' }));
              }
              break;

            case 'stt_stop':
              sttActive = false;
              // 等当前转写完后，如果有剩余也转写完
              if (sttPending.length > 0 && !sttTranscribing) {
                const remaining = Buffer.concat(sttPending);
                sttPending = [];
                transcribeChunk(remaining, sttChunkIndex++);
              }
              break;
          }
        } catch (err) {
          console.error('[Server] 消息处理错误:', err);
        }
      });

      // 转写单个音频块
      async function transcribeChunk(audioBuffer, index) {
        sttTranscribing = true;
        try {
          const text = await sttService.transcribe(audioBuffer, `chunk_${index}.webm`);
          if (text && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'stt_result', text, index }));
            console.log(`[STT] 片段 ${index}: "${text}"`);
          }
        } catch (err) {
          console.error(`[STT] 转写失败 (${index}):`, err.message);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'stt_error', error: err.message }));
          }
        } finally {
          sttTranscribing = false;
          // 处理排队中的音频块
          if (sttPending.length > 0) {
            const next = Buffer.concat(sttPending);
            sttPending = [];
            transcribeChunk(next, sttChunkIndex++);
          }
        }
      }

      ws.on('error', (err) => {
        console.error('[Server] WebSocket 错误:', err.message);
      });

      ws.on('close', () => {
        console.log('[Server] WebSocket 连接断开');
        sttActive = false;
      });
    });

    server.listen(PORT, () => {
      console.log(`[Server] Lumi 服务已启动: http://localhost:${PORT}`);
      scheduler.start();
      resolve();
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[Server] 端口 ${PORT} 已被占用`);
        reject(err);
      }
    });
  });
}

/**
 * 停止后端服务
 */
function stopServer() {
  if (scheduler) scheduler.stop();
  if (wss) wss.close();
  if (server) server.close();
  if (db) db.close();
  console.log('[Server] Lumi 服务已停止');
}

module.exports = { startServer, stopServer };
