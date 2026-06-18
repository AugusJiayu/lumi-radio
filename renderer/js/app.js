/**
 * Lumi 前端主控
 */
const APP_API_BASE = 'http://localhost:3077';

class LumiApp {
  constructor() {
    this.ws = null;
    this.currentPage = 'home';
    this.state = {
      connected: false,
      isPlaying: false,
      currentSong: null,
      volume: 0.8
    };
    this.listeners = {};

    this.init();
  }

  init() {
    this.connectWebSocket();
    this.setupNavigation();
    this.setupDotMatrix();
    this.setupClock();
    this.setupProfile();
    this.setupTopbar();
    this.setupElectronCommands();
    this.setupNeteaseLogin();

    // 初始化：只显示 home 页面
    this.switchPage('home');

    // 提前加载头像（确保聊天消息可用）
    this._loadProfileData();

    // Border glow — always visible, pulses with music
    this._createBorderGlow();

    // Material Theme — 色彩吸收引擎
    this._initMaterialTheme();
  }

  // ===== WebSocket =====

  connectWebSocket() {
    this.ws = new WebSocket('ws://localhost:3077');

    this.ws.onopen = () => {
      console.log('[App] Connected');
      this.state.connected = true;
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        this.handleMessage(JSON.parse(event.data));
      } catch (err) {
        console.error('[App] Parse error:', err);
      }
    };

    this.ws.onclose = () => {
      this.state.connected = false;
      this.emit('disconnected');
      setTimeout(() => this.connectWebSocket(), 3000);
    };

    this.ws.onerror = () => {};

    // 心跳
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'dj_response': this.emit('dj_response', msg); break;
      case 'dj_streaming': this.emit('dj_streaming', msg.chunk); break;
      case 'dj_stream_end': this.emit('dj_stream_end'); break;
      case 'dj_thinking': this.emit('dj_thinking'); break;
      case 'dj_state': this.emit('dj_state', msg.state); break;
      case 'lyrics': this.emit('lyrics', msg.lyrics); break;
      case 'playback_state':
        this.state.currentSong = msg.song;
        this.state.isPlaying = msg.isPlaying;
        this.emit('playback_update', msg);
        break;
      case 'playback_update': this.emit('playback_update', msg); break;
      case 'play_transitions': this.emit('play_transitions', msg); break;
      case 'command': this.emit('command', msg.action); break;
      case 'error': this.emit('error', msg.message); break;
      case 'stt_started': this.emit('stt_started'); break;
      case 'stt_result': this.emit('stt_result', msg); break;
      case 'stt_error': this.emit('stt_error', msg.error); break;
    }
  }

  send(msg) {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    // 二进制数据（音频块）直接发送，不做 JSON 序列化
    if (msg instanceof ArrayBuffer || msg instanceof Uint8Array || ArrayBuffer.isView(msg)) {
      this.ws.send(msg instanceof Uint8Array ? msg.buffer : msg);
    } else {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendMessage(text) { this.send({ type: 'user_message', text }); }
  sendCommand(action) { this.send({ type: 'command', action }); }

  // ===== 事件系统 =====

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  // ===== 页面路由 =====

  setupNavigation() {
    document.querySelectorAll('.nav-pill').forEach(btn => {
      btn.addEventListener('click', () => this.switchPage(btn.dataset.page));
    });
  }

  switchPage(page) {
    // 隐藏所有页面（双保险：classList + inline style）
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });
    document.querySelectorAll('.nav-pill').forEach(b => b.classList.remove('active'));

    // 显示目标页面
    const pageEl = document.getElementById(`page-${page}`);
    const navBtn = document.querySelector(`.nav-pill[data-page="${page}"]`);

    if (pageEl) {
      pageEl.classList.add('active');
      pageEl.style.display = 'flex';
    }
    navBtn?.classList.add('active');
    this.currentPage = page;

    // 沉浸式播放页：隐藏 topbar/visualizer/胶囊导航
    document.body.classList.toggle('np-immersive', page === 'nowplaying');
    // 聊天页/个人页：隐藏极光条
    document.body.classList.toggle('chat-view', page === 'chat' || page === 'profile');
    // 品味页：仅隐藏胶囊导航
    document.body.classList.toggle('nav-hidden', page === 'taste');

    // Now Playing 页面：阻止整页 wheel 滚动（仅歌词区域允许滚动）
    if (page === 'nowplaying') {
      this._setupNPScrollLock();
    }

    this.emit('page_change', page);
  }

  /**
   * Now Playing 页面滚动锁定：
   * 阻止 wheel/touchmove 在非歌词区域引起的整页位移
   */
  _setupNPScrollLock() {
    if (this._npScrollLocked) return;
    this._npScrollLocked = true;

    const npPage = document.getElementById('page-nowplaying');
    if (!npPage) return;

    // wheel 事件：仅 .np-lyrics 内部允许默认滚动
    npPage.addEventListener('wheel', (e) => {
      const lyrics = document.getElementById('np-lyrics');
      if (lyrics && (e.target === lyrics || lyrics.contains(e.target))) {
        // 在歌词区域内：允许滚动，但到边界时阻止继续传播
        const atTop = lyrics.scrollTop <= 0 && e.deltaY < 0;
        const atBottom = lyrics.scrollTop + lyrics.clientHeight >= lyrics.scrollHeight && e.deltaY > 0;
        if (atTop || atBottom) {
          e.preventDefault();
        }
        return;
      }
      // 非歌词区域：完全阻止
      e.preventDefault();
    }, { passive: false });

    // 阻止键盘引起的滚动（Page Up/Down, Arrow keys, Space, Home/End）
    npPage.addEventListener('keydown', (e) => {
      const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
      if (scrollKeys.includes(e.key)) {
        const lyrics = document.getElementById('np-lyrics');
        if (lyrics && (e.target === lyrics || lyrics.contains(e.target))) return;
        e.preventDefault();
      }
    });
  }

  // ===== Splash Logo (dot matrix, splash screen only) =====

  setupDotMatrix() {
    this.dotSplashLogo = new DotMatrixText('dot-splash-logo-canvas', {
      dotSize: 4,
      dotGap: 2,
      charGap: 5,
      glowBlur: 6,
      crtNoise: true,
    });
    this.dotSplashLogo.setText('LUMI', 6);

    const observer = new MutationObserver(() => {
      this.dotSplashLogo?.refresh();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }

  // ===== Border Glow =====

  _createBorderGlow() {
    const glow = document.createElement('div');
    glow.className = 'window-border-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);
    this._borderGlowEl = glow;
  }

  // ===== Material Theme =====

  _initMaterialTheme() {
    this.glassTheme = new MaterialTheme();

    // 默认从光斑取色（首页模式）
    this.glassTheme.startBlobSampling();

    // 页面切换时切换取色策略
    this.on('page_change', (page) => {
      if (page === 'nowplaying') {
        // 播放页：从封面取色（由 player.js 触发）
        this.glassTheme.stopBlobSampling();
      } else {
        // 其他页面：从光斑取色
        this.glassTheme.startBlobSampling();
      }
    });
  }

  // ===== 数字时钟 =====

  setupClock() {
    this._colonVisible = true;
    this._lastClockTime = '';
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);

    // Colon blink
    setInterval(() => {
      this._colonVisible = !this._colonVisible;
      const colon = document.querySelector('.clock-colon');
      if (colon) colon.classList.toggle('hidden', !this._colonVisible);
    }, 1500);
  }

  updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${h}${m}`;

    if (timeStr !== this._lastClockTime) {
      this._lastClockTime = timeStr;
      const h1 = document.getElementById('clock-h1');
      const h2 = document.getElementById('clock-h2');
      const m1 = document.getElementById('clock-m1');
      const m2 = document.getElementById('clock-m2');
      if (h1) h1.textContent = h[0];
      if (h2) h2.textContent = h[1];
      if (m1) m1.textContent = m[0];
      if (m2) m2.textContent = m[1];
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

    const dateEl = document.getElementById('clock-date');
    const fullDateEl = document.getElementById('clock-full-date');
    if (dateEl) dateEl.textContent = days[now.getDay()];
    if (fullDateEl) fullDateEl.textContent =
      `${now.getDate()} · ${months[now.getMonth()]} · ${now.getFullYear()}`;
  }

  // ===== Profile 个人页 =====

  setupProfile() {
    // 头像上传（只绑定一次）
    if (!this._profileInited) {
      this._profileInited = true;

      const avatarWrap = document.getElementById('profile-avatar-wrap');
      const fileInput = document.getElementById('avatar-file-input');
      if (avatarWrap && fileInput) {
        avatarWrap.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => this._showAvatarCrop(ev.target.result);
          reader.readAsDataURL(file);
          fileInput.value = '';
        });
        this._initCropModal();
      }

      // 主题切换
      document.getElementById('setting-theme')?.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme;
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('lumi-theme', next);
        window.lumiAPI?.toggleTheme(next);
        this._updateProfileThemeLabel(next);
      });

      // 我的音乐品味
      document.getElementById('setting-taste')?.addEventListener('click', () => {
        this._openTasteEditor();
      });

      // 网易云登录
      document.getElementById('setting-netease')?.addEventListener('click', () => {
        this._openNeteaseFromProfile();
      });

      // 加载数据
      this._loadProfileData();
    }

    // 用户名编辑（每次重新绑定，因为元素会被替换）
    this._bindNameEdit();
  }

  _bindNameEdit() {
    const nameEl = document.getElementById('profile-name');
    if (!nameEl || nameEl._bound) return;
    nameEl._bound = true;
    nameEl.addEventListener('click', () => {
      if (nameEl.tagName === 'INPUT') return;
      const current = nameEl.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'profile-name-input';
      input.value = current;
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      let saved = false;
      const save = () => {
        if (saved) return;
        saved = true;
        const newName = input.value.trim() || 'Lumi Listener';
        const span = document.createElement('div');
        span.id = 'profile-name';
        span.className = 'profile-name';
        span.textContent = newName;
        input.replaceWith(span);
        fetch(`${APP_API_BASE}/api/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'username', value: newName })
        }).catch(() => {});
        this._username = newName;
        this._bindNameEdit();
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') { input.value = current; save(); }
      });
    });
  }

  _setAvatarImage(src) {
    const el = document.getElementById('profile-avatar');
    if (!el) return;
    el.innerHTML = `<img src="${src}" alt="avatar">`;
  }

  /**
   * 初始化头像裁剪弹窗（只绑定一次）
   */
  _initCropModal() {
    const overlay = document.getElementById('avatar-crop-overlay');
    const viewport = document.getElementById('avatar-crop-viewport');
    const img = document.getElementById('avatar-crop-img');
    const closeBtn = document.getElementById('avatar-crop-close');
    const cancelBtn = document.getElementById('avatar-crop-cancel');
    const confirmBtn = document.getElementById('avatar-crop-confirm');

    if (!overlay || !viewport || !img) return;

    // 关闭弹窗
    const hide = () => { overlay.style.display = 'none'; };
    closeBtn?.addEventListener('click', hide);
    cancelBtn?.addEventListener('click', hide);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) hide(); });

    // 拖拽移动图片
    let dragging = false;
    let startX, startY, imgStartLeft, imgStartTop;

    const clampPosition = () => {
      // 限制图片拖拽范围：确保圆形区域始终被图片覆盖
      const vw = viewport.offsetWidth;
      const vh = viewport.offsetHeight;
      const iw = img.offsetWidth;
      const ih = img.offsetHeight;
      const circleR = 100; // 圆形半径
      const cx = vw / 2;
      const cy = vh / 2;

      // 圆形左边缘 = cx - circleR，右边缘 = cx + circleR
      // 图片 left 必须满足：left <= 圆左边缘  且  left + iw >= 圆右边缘
      const maxLeft = cx - circleR;                // 图片左边缘不超过圆左边缘
      const minLeft = cx + circleR - iw;            // 图片右边缘不低于圆右边缘
      const maxTop = cy - circleR;
      const minTop = cy + circleR - ih;

      let left = parseFloat(img.style.left) || 0;
      let top = parseFloat(img.style.top) || 0;
      left = Math.min(maxLeft, Math.max(minLeft, left));
      top = Math.min(maxTop, Math.max(minTop, top));
      img.style.left = left + 'px';
      img.style.top = top + 'px';
    };

    viewport.addEventListener('pointerdown', (e) => {
      if (e.target === img || e.target === viewport || viewport.contains(e.target)) {
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        imgStartLeft = parseFloat(img.style.left) || 0;
        imgStartTop = parseFloat(img.style.top) || 0;
        viewport.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    });

    viewport.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      img.style.left = (imgStartLeft + dx) + 'px';
      img.style.top = (imgStartTop + dy) + 'px';
      clampPosition();
    });

    viewport.addEventListener('pointerup', () => { dragging = false; });

    // 确认裁剪
    confirmBtn?.addEventListener('click', () => this._cropAndUpload(img, viewport));
  }

  /**
   * 打开裁剪弹窗，加载图片
   */
  _showAvatarCrop(dataUrl) {
    const overlay = document.getElementById('avatar-crop-overlay');
    const viewport = document.getElementById('avatar-crop-viewport');
    const img = document.getElementById('avatar-crop-img');
    if (!overlay || !viewport || !img) return;

    img.src = dataUrl;
    overlay.style.display = 'flex';

    // 图片加载后居中并适配
    img.onload = () => {
      const vw = viewport.offsetWidth;
      const vh = viewport.offsetHeight;
      const circleR = 100;
      const targetSize = circleR * 2; // 图片至少覆盖圆形区域

      // 缩放图片：让短边至少等于圆形直径
      const imgW = img.naturalWidth;
      const imgH = img.naturalHeight;
      const scale = Math.max(targetSize / imgW, targetSize / imgH);
      const displayW = imgW * scale;
      const displayH = imgH * scale;
      img.style.width = displayW + 'px';
      img.style.height = displayH + 'px';

      // 居中
      img.style.left = ((vw - displayW) / 2) + 'px';
      img.style.top = ((vh - displayH) / 2) + 'px';
    };
  }

  /**
   * 裁剪圆形区域并上传
   */
  async _cropAndUpload(img, viewport) {
    const vw = viewport.offsetWidth;
    const vh = viewport.offsetHeight;
    const circleR = 100;
    const outSize = 200; // 输出尺寸

    // 计算圆形中心在视口中的位置
    const cx = vw / 2;
    const cy = vh / 2;

    // 图片在视口中的偏移
    const imgLeft = parseFloat(img.style.left) || 0;
    const imgTop = parseFloat(img.style.top) || 0;

    // 缩放比例：自然尺寸 → 显示尺寸
    const scale = img.naturalWidth / img.offsetWidth;

    // 圆形区域在图片自然坐标中的位置
    const srcX = (cx - circleR - imgLeft) * scale;
    const srcY = (cy - circleR - imgTop) * scale;
    const srcSize = circleR * 2 * scale;

    // Canvas 裁剪
    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d');

    // 圆形裁剪
    ctx.beginPath();
    ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, outSize, outSize);

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // 本地预览 + 上传
    this._setAvatarImage(croppedDataUrl);
    document.getElementById('avatar-crop-overlay').style.display = 'none';

    try {
      const res = await fetch(`${APP_API_BASE}/api/avatar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: croppedDataUrl })
      });
      const result = await res.json();
      if (result.url) {
        this._avatarUrl = APP_API_BASE + result.url;
        this._setAvatarImage(this._avatarUrl);
      }
    } catch (err) {
      console.error('[App] 头像上传失败:', err);
    }
  }

  getUserAvatarHTML() {
    if (this._avatarUrl) {
      return `<div class="chat-user-avatar"><img src="${this._avatarUrl}" alt=""></div>`;
    }
    return '<div class="chat-user-avatar">♪</div>';
  }

  _updateProfileThemeLabel(theme) {
    const el = document.getElementById('theme-label');
    if (el) el.textContent = theme === 'light' ? '浅色' : '深色';
  }

  async _loadProfileData() {
    // 头像
    try {
      const res = await fetch(`${APP_API_BASE}/api/avatar`);
      const data = await res.json();
      if (data.exists && data.url) {
        this._avatarUrl = APP_API_BASE + data.url;
        this._setAvatarImage(this._avatarUrl);
      }
    } catch (_) {}

    // 用户名
    try {
      const res = await fetch(`${APP_API_BASE}/api/config`);
      const data = await res.json();
      if (data.username) {
        const nameEl = document.getElementById('profile-name');
        if (nameEl) nameEl.textContent = data.username;
        this._username = data.username;
      }
    } catch (_) {}

    // 主题标签
    this._updateProfileThemeLabel(document.documentElement.dataset.theme || 'dark');

    // 喜欢数
    try {
      const res = await fetch(`${APP_API_BASE}/api/liked-songs`);
      const data = await res.json();
      const el = document.getElementById('stat-liked');
      if (el) el.textContent = data.songs?.length || 0;
    } catch (_) {}

    // 聊天数
    try {
      const res = await fetch(`${APP_API_BASE}/api/history?limit=9999`);
      const data = await res.json();
      const el = document.getElementById('stat-chats');
      if (el) el.textContent = Array.isArray(data) ? data.length : 0;
    } catch (_) {}

    // 网易云状态
    try {
      const res = await fetch(`${APP_API_BASE}/api/netease/status`);
      const data = await res.json();
      this._updateProfileNeteaseStatus(data.loggedIn);
    } catch (_) {}
  }

  _updateProfileNeteaseStatus(loggedIn) {
    const el = document.getElementById('profile-netease-status');
    if (!el) return;
    el.innerHTML = loggedIn
      ? '<span class="conn-dot"></span>网易云已连接'
      : '<span class="conn-dot conn-dot-off"></span>未登录网易云';
    // 同步设置项文字
    const neteaseVal = document.querySelector('#setting-netease .setting-value');
    if (neteaseVal) neteaseVal.textContent = loggedIn ? '已登录' : '→';
  }

  // ===== 网易云：Profile 页入口 =====

  async _openNeteaseFromProfile() {
    try {
      const res = await fetch(`${APP_API_BASE}/api/netease/status`);
      const data = await res.json();
      if (data.loggedIn) {
        // 已登录 → 显示确认登出弹窗
        this._showNeteaseStatusModal();
      } else {
        // 未登录 → 打开 QR 扫码
        this.openNeteaseLogin();
      }
    } catch {
      this.openNeteaseLogin();
    }
  }

  _showNeteaseStatusModal() {
    const overlay = document.getElementById('netease-login-overlay');
    const qrBox = document.getElementById('netease-qr-box');
    const statusEl = document.getElementById('netease-qr-status');
    if (!overlay || !qrBox) return;

    overlay.style.display = 'flex';
    const titleEl = document.getElementById('netease-modal-title');
    if (titleEl) titleEl.textContent = '网易云音乐';
    const hintEl = document.getElementById('netease-qr-hint');
    if (hintEl) hintEl.style.display = 'none';
    qrBox.innerHTML = `
      <div class="netease-status-card">
        <div class="netease-status-icon">✓</div>
        <div class="netease-status-text">网易云音乐已登录</div>
        <button class="netease-logout-btn" id="netease-logout-btn">退出登录</button>
      </div>
    `;
    if (statusEl) statusEl.textContent = '';

    document.getElementById('netease-logout-btn')?.addEventListener('click', async () => {
      try {
        await fetch(`${APP_API_BASE}/api/netease/logout`, { method: 'POST' });
        this.updateNeteaseStatus(false);
      } catch {}
      this.closeNeteaseLogin();
    });
  }

  // ===== 音乐品味编辑 =====

  _openTasteEditor() {
    this.switchPage('taste');
    this._loadTaste();
    // 返回按钮（只绑定一次）
    if (!this._tasteBackBound) {
      this._tasteBackBound = true;
      document.getElementById('taste-back')?.addEventListener('click', () => {
        this.switchPage('profile');
      });
    }
  }

  async _loadTaste() {
    const container = document.getElementById('taste-container');
    if (!container) return;
    container.innerHTML = '<div class="netease-qr-loading">加载中...</div>';

    try {
      const res = await fetch(`${APP_API_BASE}/api/user-files/taste.md`);
      const data = await res.json();
      this._tasteSections = this._parseTaste(data.content || '');
      this._renderTasteSections();
    } catch {
      container.innerHTML = '<div class="netease-qr-loading">加载失败</div>';
    }
  }

  _parseTaste(content) {
    const sections = [];
    let current = null;
    for (const line of content.split('\n')) {
      const h2 = line.match(/^##\s+(.+)/);
      const item = line.match(/^-\s+(.+)/);
      if (h2) {
        current = { title: h2[1].trim(), items: [] };
        sections.push(current);
      } else if (item && current) {
        current.items.push(item[1].trim());
      }
    }
    return sections;
  }

  _serializeTaste(sections) {
    let md = '# 我的音乐品味\n';
    for (const sec of sections) {
      md += `\n## ${sec.title}\n`;
      for (const item of sec.items) {
        md += `- ${item}\n`;
      }
    }
    return md;
  }

  _renderTasteSections() {
    const container = document.getElementById('taste-container');
    if (!container) return;
    container.innerHTML = '';

    for (let si = 0; si < this._tasteSections.length; si++) {
      const sec = this._tasteSections[si];
      const secEl = document.createElement('div');
      secEl.className = 'taste-section';

      const titleEl = document.createElement('div');
      titleEl.className = 'taste-section-title';
      titleEl.textContent = sec.title;
      secEl.appendChild(titleEl);

      const tagsEl = document.createElement('div');
      tagsEl.className = 'taste-tags';

      // 已有标签
      for (let ii = 0; ii < sec.items.length; ii++) {
        tagsEl.appendChild(this._createTasteTag(si, ii, sec.items[ii]));
      }

      // 添加按钮
      const addBtn = document.createElement('button');
      addBtn.className = 'taste-add-btn';
      addBtn.textContent = '+ 添加';
      addBtn.addEventListener('click', () => {
        this._startAddTasteItem(si, tagsEl, addBtn);
      });
      tagsEl.appendChild(addBtn);

      secEl.appendChild(tagsEl);
      container.appendChild(secEl);
    }
  }

  _createTasteTag(sectionIdx, itemIdx, text) {
    const tag = document.createElement('span');
    tag.className = 'taste-tag';
    tag.textContent = text;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'taste-tag-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      this._tasteSections[sectionIdx].items.splice(itemIdx, 1);
      this._saveTaste();
      this._renderTasteSections();
    });
    tag.appendChild(removeBtn);

    return tag;
  }

  _startAddTasteItem(sectionIdx, tagsEl, addBtn) {
    // 隐藏添加按钮
    addBtn.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'taste-add-input';
    input.placeholder = '输入内容...';
    tagsEl.insertBefore(input, addBtn);
    input.focus();

    const finish = () => {
      const val = input.value.trim();
      if (val) {
        this._tasteSections[sectionIdx].items.push(val);
        this._saveTaste();
        this._renderTasteSections();
      } else {
        input.remove();
        addBtn.style.display = '';
      }
    };

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(); }
      if (e.key === 'Escape') { input.value = ''; finish(); }
    });
  }

  async _saveTaste() {
    const md = this._serializeTaste(this._tasteSections);
    try {
      await fetch(`${APP_API_BASE}/api/user-files/taste.md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: md })
      });
    } catch (err) {
      console.error('[App] 保存品味失败:', err);
    }
  }

  _escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ===== Topbar =====

  setupTopbar() {
    document.getElementById('btn-menu')?.addEventListener('click', () => {
      // TODO: 菜单
    });
  }

  // ===== 连接状态 =====

  // ===== Electron =====

  setupElectronCommands() {
    window.lumiAPI?.onCommand((cmd) => this.emit('command', cmd));
  }

  // ===== 网易云 QR 扫码登录 =====

  setupNeteaseLogin() {
    this._qrPolling = null;

    // 登录按钮
    document.getElementById('btn-netease-login')?.addEventListener('click', () => {
      this._openNeteaseFromProfile();
    });

    // 关闭弹窗
    document.getElementById('netease-login-close')?.addEventListener('click', () => {
      this.closeNeteaseLogin();
    });

    // 点击遮罩关闭
    document.getElementById('netease-login-overlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'netease-login-overlay') this.closeNeteaseLogin();
    });

    // 检查登录状态
    this.checkNeteaseStatus();
  }

  async checkNeteaseStatus() {
    try {
      const res = await fetch(`${APP_API_BASE}/api/netease/status`);
      const data = await res.json();
      this.updateNeteaseStatus(data.loggedIn);
    } catch {}
  }

  updateNeteaseStatus(loggedIn) {
    const dot = document.getElementById('netease-status-dot');
    const icon = document.getElementById('netease-status-icon');
    if (dot) {
      dot.className = 'netease-dot ' + (loggedIn ? 'online' : 'offline');
    }
    if (icon) {
      icon.style.color = loggedIn ? 'var(--green)' : 'var(--text-dim)';
    }
    // 更新按钮 title
    const btn = document.getElementById('btn-netease-login');
    if (btn) btn.title = loggedIn ? '网易云已登录（点击登出）' : '网易云音乐登录';
    // 同步 Profile 页状态
    this._updateProfileNeteaseStatus(loggedIn);
  }

  async openNeteaseLogin() {
    // 如果已登录，点击登出
    try {
      const statusRes = await fetch(`${APP_API_BASE}/api/netease/status`);
      const statusData = await statusRes.json();
      if (statusData.loggedIn) {
        await fetch(`${APP_API_BASE}/api/netease/logout`, { method: 'POST' });
        this.updateNeteaseStatus(false);
        return;
      }
    } catch {}

    // 显示弹窗
    const overlay = document.getElementById('netease-login-overlay');
    const qrBox = document.getElementById('netease-qr-box');
    const statusEl = document.getElementById('netease-qr-status');
    if (!overlay || !qrBox) return;

    overlay.style.display = 'flex';
    qrBox.classList.remove('expanded');
    const titleEl = document.getElementById('netease-modal-title');
    if (titleEl) titleEl.textContent = '登录网易云音乐';
    const hintEl = document.getElementById('netease-qr-hint');
    if (hintEl) hintEl.style.display = '';
    qrBox.innerHTML = '<div class="netease-qr-loading">正在获取二维码...</div>';
    if (statusEl) statusEl.textContent = '';

    // 获取二维码
    await this.fetchQRCode();
  }

  closeNeteaseLogin() {
    const overlay = document.getElementById('netease-login-overlay');
    if (overlay) overlay.style.display = 'none';
    // 恢复 qrBox 状态
    const qrBox = document.getElementById('netease-qr-box');
    if (qrBox) qrBox.classList.remove('expanded');
    const hintEl = document.getElementById('netease-qr-hint');
    if (hintEl) hintEl.style.display = '';
    // 停止轮询
    if (this._qrPolling) {
      clearInterval(this._qrPolling);
      this._qrPolling = null;
    }
  }

  async fetchQRCode() {
    const qrBox = document.getElementById('netease-qr-box');
    const statusEl = document.getElementById('netease-qr-status');

    try {
      // Step 1: 获取 unikey
      const keyRes = await fetch(`${APP_API_BASE}/api/netease/qr-key`);
      const keyData = await keyRes.json();

      if (keyData.code !== 200 || !keyData.data?.unikey) {
        if (qrBox) qrBox.innerHTML = '<div class="netease-qr-loading">获取二维码失败</div>';
        return;
      }

      const unikey = keyData.data.unikey;

      // Step 2: 创建二维码
      const createRes = await fetch(`${APP_API_BASE}/api/netease/qr-create?key=${encodeURIComponent(unikey)}`);
      const createData = await createRes.json();

      if (createData.code !== 200 || !createData.data?.qrimg) {
        if (qrBox) qrBox.innerHTML = '<div class="netease-qr-loading">生成二维码失败</div>';
        return;
      }

      // 显示二维码
      if (qrBox) {
        qrBox.innerHTML = `<img src="${createData.data.qrimg}" alt="扫码登录">`;
      }

      // Step 3: 轮询扫码状态
      this.startQRPolling(unikey);

    } catch (err) {
      console.error('[App] QR 登录流程失败:', err);
      if (qrBox) qrBox.innerHTML = '<div class="netease-qr-loading">网络错误，请重试</div>';
    }
  }

  startQRPolling(unikey) {
    // 清除旧轮询
    if (this._qrPolling) clearInterval(this._qrPolling);

    const statusEl = document.getElementById('netease-qr-status');
    const qrBox = document.getElementById('netease-qr-box');

    this._qrPolling = setInterval(async () => {
      try {
        const res = await fetch(`${APP_API_BASE}/api/netease/qr-check?key=${encodeURIComponent(unikey)}`);
        const data = await res.json();

        switch (data.code) {
          case 800: // 二维码过期
            if (statusEl) statusEl.textContent = '二维码已过期，正在刷新...';
            clearInterval(this._qrPolling);
            this._qrPolling = null;
            await this.fetchQRCode();
            break;

          case 801: // 等待扫码
            if (statusEl) statusEl.textContent = '等待扫码...';
            break;

          case 802: // 已扫码，等待确认
            if (statusEl) statusEl.textContent = '已扫码，等待确认...';
            break;

          case 803: // 登录成功
            if (statusEl) statusEl.textContent = '登录成功！';
            clearInterval(this._qrPolling);
            this._qrPolling = null;
            this.updateNeteaseStatus(true);
            // 1.5 秒后关闭弹窗
            setTimeout(() => this.closeNeteaseLogin(), 1500);
            break;
        }
      } catch (err) {
        console.error('[App] 轮询 QR 状态失败:', err);
      }
    }, 2000);
  }
}

const app = new LumiApp();
