/**
 * 播放器逻辑
 */
const API_BASE = 'http://localhost:3077';

class Player {
  constructor() {
    this.audio = document.getElementById('audio-player');
    this.ttsAudio = document.getElementById('audio-tts');
    this.playlist = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.volume = 0.8;
    this.isMuted = false;
    this.likedSongs = new Set(); // 存 songId

    // Audio Breathing Effect
    this._breathEffect = null;
    this._breathReady = false;

    // 播放列表播完后自动请求更多音乐的定时器
    this._moreMusicTimer = null;

    this.init();
  }

  init() {
    this.setupHomeControls();
    this.setupNPControls();
    this.setupVolumeControl();
    this.setupQueue();
    this.setupAudioEvents();
    this.setupAppEvents();
    this.audio.volume = this.volume;
    this.ttsAudio.volume = this.volume;
    this.loadLikedSongs();
  }

  /**
   * Initialize Audio Breathing Effect.
   * Must be called after user interaction (audio policy).
   */
  _initBreath() {
    if (this._breathReady) return;

    const nowBar = document.getElementById('now-bar');
    if (!nowBar) return;

    this._breathEffect = new AudioBreathEffect({
      audioEl: this.audio,
      targetEl: nowBar,
      attackMs: 150,
      releaseMs: 500,
    });

    this._breathEffect.init();
    this._breathEffect.connect();
    this._breathReady = true;
  }

  _startBreath() {
    this._initBreath();
    if (!this._breathEffect) return;

    const nowBar = document.getElementById('now-bar');
    if (nowBar) nowBar.classList.add('breathing');

    this._breathEffect.resume().then(() => {
      this._breathEffect.start();
    });
  }

  _stopBreath() {
    if (!this._breathEffect) return;

    const nowBar = document.getElementById('now-bar');
    if (nowBar) nowBar.classList.remove('breathing');

    this._breathEffect.stop();
  }

  // ===== 从后端加载已喜欢的歌曲 =====

  loadLikedSongs() {
    fetch(`${API_BASE}/api/liked-songs`)
      .then(r => r.json())
      .then(data => {
        if (data.liked && Array.isArray(data.liked)) {
          data.liked.forEach(id => this.likedSongs.add(String(id)));
          // 如果当前有歌在播，刷新心型状态
          this.refreshHeartState();
        }
      })
      .catch(err => console.error('[Player] loadLikedSongs failed:', err));
  }

  refreshHeartState() {
    const track = this.playlist[this.currentIndex];
    if (!track) return;
    const isLiked = this.likedSongs.has(track.name);

    const heartBtn = document.getElementById('btn-heart');
    const npHeartBtn = document.querySelector('.np-heart-btn');

    if (heartBtn) {
      isLiked ? heartBtn.classList.add('liked') : heartBtn.classList.remove('liked');
    }
    if (npHeartBtn) {
      npHeartBtn.innerHTML = isLiked
        ? '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" stroke="currentColor" stroke-width="2" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
        : '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="none" stroke="currentColor" stroke-width="2" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
      isLiked ? npHeartBtn.classList.add('liked') : npHeartBtn.classList.remove('liked');
    }
  }

  // ===== 首页控制 =====

  _setupTextarea(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;

    // Enter to send, Shift+Enter for newline
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendFromInput(inputId);
      }
    });

    // Auto-resize height
    el.addEventListener('input', () => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 100) + 'px';
    });
  }

  setupHomeControls() {
    document.getElementById('btn-play')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('btn-prev')?.addEventListener('click', () => this.prevTrack());
    document.getElementById('btn-next')?.addEventListener('click', () => this.nextTrack());

    // 点击 now-bar 歌名区域进入全局播放页
    document.querySelector('.now-bar-info')?.addEventListener('click', () => {
      app.switchPage('nowplaying');
    });

    // 发送按钮
    document.getElementById('btn-send')?.addEventListener('click', () => this.sendFromInput('user-input'));
    document.getElementById('btn-chat-send')?.addEventListener('click', () => this.sendFromInput('chat-input'));

    // 语音输入
    document.getElementById('btn-mic')?.addEventListener('click', () => this.startVoiceInput('user-input'));
    document.getElementById('btn-chat-mic')?.addEventListener('click', () => this.startVoiceInput('chat-input'));

    // 回车发送 + Shift+Enter 换行 + 自动高度
    this._setupTextarea('user-input');
    this._setupTextarea('chat-input');

    // Replay TTS
    document.getElementById('btn-replay-tts')?.addEventListener('click', () => {
      if (this.ttsAudio.src) this.ttsAudio.play().catch(() => {});
    });

    // 进度条点击 + 拖动
    this.setupProgressBarDrag('progress-bar');
    this.setupProgressBarDrag('np-progress-bar');

    // 喜欢按钮
    document.getElementById('btn-heart')?.addEventListener('click', (e) => {
      console.log('[Player] 心型按钮被点击, playlist:', this.playlist.length, 'index:', this.currentIndex);
      this.toggleLike();
    });
  }

  setupProgressBarDrag(barId) {
    const bar = document.getElementById(barId);
    if (!bar) return;
    let dragging = false;

    const seek = (e) => {
      if (!this.audio.duration) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.audio.currentTime = ratio * this.audio.duration;

      // 拖动时同步小圆点
      if (barId === 'progress-bar') {
        const dot = document.getElementById('progress-dot');
        if (dot) dot.style.left = (ratio * 100) + '%';
        const fill = document.getElementById('progress-fill');
        if (fill) fill.style.width = (ratio * 100) + '%';
      }
    };

    bar.addEventListener('mousedown', (e) => {
      dragging = true;
      seek(e);
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (dragging) seek(e);
    });

    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // ===== Now Playing 控制 =====

  setupNPControls() {
    document.getElementById('np-btn-play')?.addEventListener('click', () => this.togglePlay());
    document.getElementById('np-btn-prev')?.addEventListener('click', () => this.prevTrack());
    document.getElementById('np-btn-next')?.addEventListener('click', () => this.nextTrack());
    document.querySelector('.np-heart-btn')?.addEventListener('click', () => this.toggleLike());

    // 返回按钮
    document.getElementById('np-btn-back')?.addEventListener('click', () => {
      app.switchPage('home');
    });

    // 音量按钮（静音切换）
    document.getElementById('np-btn-vol')?.addEventListener('click', () => this.toggleMute());
  }

  // ===== 音量控制 =====

  setupVolumeControl() {
    const volBtn = document.getElementById('btn-vol');
    const volWrap = document.querySelector('.now-vol-wrap');
    const sliderPopup = document.getElementById('vol-slider-popup');
    const sliderTrack = document.getElementById('vol-slider-track');
    const sliderFill = document.getElementById('vol-slider-fill');

    if (!volBtn || !sliderPopup || !sliderTrack || !sliderFill) return;

    // hover 控制弹窗显隐 — 悬浮在音量按钮上显示，移到弹窗上可拖动
    let hideTimer = null;

    const showPopup = () => {
      clearTimeout(hideTimer);
      sliderPopup.style.opacity = '1';
      sliderPopup.style.visibility = 'visible';
    };

    const hidePopup = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        sliderPopup.style.opacity = '0';
        sliderPopup.style.visibility = 'hidden';
      }, 200); // 延迟隐藏，给鼠标移到弹窗的时间
    };

    // 鼠标进入按钮或弹窗时显示
    volWrap.addEventListener('mouseenter', showPopup);
    // 鼠标离开整个容器时隐藏
    volWrap.addEventListener('mouseleave', hidePopup);

    // 点击音量按钮 → 静音切换
    volBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMute();
    });

    // 音量滑块拖动 — 支持从轨道或圆点拖拽
    const sliderDot = document.getElementById('vol-slider-dot');
    let isDragging = false;

    const updateVolume = (e) => {
      const rect = sliderTrack.getBoundingClientRect();
      const y = rect.bottom - e.clientY;
      const ratio = Math.max(0, Math.min(1, y / rect.height));
      this.setVolume(ratio);
    };

    // 轨道点击 + 拖拽
    sliderTrack.addEventListener('mousedown', (e) => {
      isDragging = true;
      updateVolume(e);
      e.preventDefault();
    });

    // 圆点拖拽（阻止事件冒泡到轨道，避免重复处理）
    if (sliderDot) {
      sliderDot.addEventListener('mousedown', (e) => {
        isDragging = true;
        e.preventDefault();
        e.stopPropagation();
      });
    }

    document.addEventListener('mousemove', (e) => {
      if (isDragging) updateVolume(e);
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  setVolume(val) {
    this.volume = val;
    this.isMuted = val === 0;
    this.audio.volume = val;
    this.ttsAudio.volume = val;

    const fill = document.getElementById('vol-slider-fill');
    const dot = document.getElementById('vol-slider-dot');
    const pct = val * 100;

    if (fill) fill.style.height = pct + '%';
    // 圆点跟随填充条顶部定位
    if (dot) dot.style.bottom = `calc(${pct}% - 6px)`;

    this.updateVolIcon();
  }

  toggleMute() {
    if (this.isMuted) {
      this.setVolume(this.volume > 0 ? this.volume : 0.8);
    } else {
      this.setVolume(0);
    }
  }

  updateVolIcon() {
    const icon = document.getElementById('vol-icon');
    if (!icon) return;

    if (this.volume === 0) {
      icon.innerHTML = '<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
    } else if (this.volume < 0.5) {
      icon.innerHTML = '<path fill="currentColor" d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
    } else {
      icon.innerHTML = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
    }
  }

  // ===== Queue 播放列表 =====

  setupQueue() {
    const header = document.getElementById('queue-header');
    const panel = document.getElementById('queue-panel');

    header?.addEventListener('click', () => {
      panel?.classList.toggle('open');
    });

    this.renderQueue();
  }

  renderQueue() {
    const list = document.getElementById('queue-list');
    const count = document.getElementById('queue-count');
    const panel = document.getElementById('queue-panel');
    if (!list || !count) return;

    count.textContent = `${this.playlist.length} TRACKS`;

    if (this.playlist.length === 0) {
      list.innerHTML = '<div class="queue-empty">No tracks in queue</div>';
      if (panel) panel.classList.remove('open');
      return;
    }

    // 有歌曲时展开面板
    if (panel) panel.classList.add('open');

    const playSvg = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>';

    list.innerHTML = this.playlist.map((track, i) => {
      const isActive = i === this.currentIndex;
      return `
        <div class="queue-item ${isActive ? 'active' : ''}" data-index="${i}">
          <div class="queue-item-num">
            <span>${i + 1}</span>
            ${playSvg}
          </div>
          <span class="queue-item-name">${track.name}</span>
          <span class="queue-item-artist">${track.artist}</span>
        </div>`;
    }).join('');

    // 点击跳转
    list.querySelectorAll('.queue-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        if (!isNaN(idx) && idx !== this.currentIndex) {
          this.currentIndex = idx;
          this.playCurrentTrack();
        }
      });
    });

    // 滚动到当前播放项
    const activeEl = list.querySelector('.queue-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  sendFromInput(inputId) {
    const input = document.getElementById(inputId);
    const text = input?.value.trim();
    if (text) {
      this.addUserMessage(text);
      app.sendMessage(text);
      input.value = '';
      // Reset textarea height
      if (input.tagName === 'TEXTAREA') {
        input.style.height = 'auto';
      }
    }
  }

  // ===== 语音输入（分段录音 → 后端转写，静音自动停止） =====

  async startVoiceInput(inputId) {
    const micBtn = document.getElementById(inputId === 'user-input' ? 'btn-mic' : 'btn-chat-mic');
    const input = document.getElementById(inputId);
    if (!input) return;

    // 如果正在录音，停止
    if (this._sttActive) {
      this._stopVoiceInput();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      this._sttActive = true;
      this._sttInput = input;
      this._sttMicBtn = micBtn;
      this._sttText = '';
      if (micBtn) micBtn.classList.add('recording');
      input.placeholder = '正在听...';
      input.value = '';

      // 通知后端开启 STT 会话
      app.send({ type: 'stt_start' });

      // 监听 STT 结果：每次追加文字
      this._onSttResult = (msg) => {
        if (!this._sttActive) return;
        // 拼接每段识别结果（用空格分隔）
        this._sttText = this._sttText ? (this._sttText + ' ' + msg.text) : msg.text;
        input.value = this._sttText;
      };
      this._onSttError = (err) => {
        console.error('[Player] STT 错误:', err);
      };
      app.on('stt_result', this._onSttResult);
      app.on('stt_error', this._onSttError);

      // 音量监控（静音检测）
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      let silenceStart = Date.now();
      const SILENCE_TIMEOUT = 10000;

      this._sttSilenceTimer = setInterval(() => {
        if (!this._sttActive) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        if (avg < 5) {
          if (Date.now() - silenceStart > SILENCE_TIMEOUT) {
            console.log('[Player] 10 秒无声音，自动停止');
            this._stopVoiceInput();
          }
        } else {
          silenceStart = Date.now();
        }
      }, 300);

      this._sttAudioCtx = audioCtx;

      // MediaRecorder 分段录音（每 3 秒一个 chunk）
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && this._sttActive) {
          e.data.arrayBuffer().then(buf => {
            app.send(new Uint8Array(buf));  // 发送二进制音频块
          });
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start(3000); // 每 3 秒触发 ondataavailable
      this._sttMediaRecorder = recorder;

      console.log('[Player] 语音识别已启动');

    } catch (err) {
      console.error('[Player] 麦克风访问失败:', err);
      this._sttActive = false;
      if (err.name === 'NotAllowedError') {
        alert('请允许麦克风权限后重试');
      } else {
        alert('无法访问麦克风: ' + err.message);
      }
    }
  }

  _stopVoiceInput() {
    if (!this._sttActive) return;
    this._sttActive = false;

    // 停止录音
    if (this._sttMediaRecorder && this._sttMediaRecorder.state !== 'inactive') {
      this._sttMediaRecorder.stop();
      this._sttMediaRecorder = null;
    }
    if (this._sttSilenceTimer) {
      clearInterval(this._sttSilenceTimer);
      this._sttSilenceTimer = null;
    }
    if (this._sttAudioCtx) {
      this._sttAudioCtx.close().catch(() => {});
      this._sttAudioCtx = null;
    }

    // 通知后端结束 STT
    app.send({ type: 'stt_stop' });

    // 取消监听
    if (this._onSttResult) {
      app.listeners['stt_result'] = (app.listeners['stt_result'] || []).filter(cb => cb !== this._onSttResult);
      this._onSttResult = null;
    }
    if (this._onSttError) {
      app.listeners['stt_error'] = (app.listeners['stt_error'] || []).filter(cb => cb !== this._onSttError);
      this._onSttError = null;
    }

    // 恢复 UI
    if (this._sttMicBtn) this._sttMicBtn.classList.remove('recording');
    if (this._sttInput) {
      this._sttInput.placeholder = 'Say something to the DJ...';
      this._sttInput.focus();
    }
    this._sttMicBtn = null;
    this._sttInput = null;

    console.log('[Player] 语音识别已停止');
  }

  // ===== 喜欢/取消喜欢 =====

  toggleLike() {
    const track = this.playlist[this.currentIndex];
    console.log('[Player] toggleLike called, track:', track?.name, 'currentIndex:', this.currentIndex, 'playlist length:', this.playlist.length);
    if (!track) return;

    const songName = track.name;
    const heartBtn = document.getElementById('btn-heart');
    const npHeartBtn = document.querySelector('.np-heart-btn');
    const filledSvg = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" stroke="currentColor" stroke-width="2" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    const outlineSvg = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="none" stroke="currentColor" stroke-width="2" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';

    if (this.likedSongs.has(songName)) {
      // 取消喜欢
      this.likedSongs.delete(songName);
      if (heartBtn) heartBtn.classList.remove('liked');
      if (npHeartBtn) { npHeartBtn.innerHTML = outlineSvg; npHeartBtn.classList.remove('liked'); }
      this.sendLikeAction('unlike', track);
    } else {
      // 喜欢
      this.likedSongs.add(songName);
      if (heartBtn) heartBtn.classList.add('liked');
      if (npHeartBtn) { npHeartBtn.innerHTML = filledSvg; npHeartBtn.classList.add('liked'); }
      this.sendLikeAction('like', track);
    }
  }

  sendLikeAction(action, track) {
    fetch(`${API_BASE}/api/liked-songs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        song: {
          name: track.name,
          artist: track.artist
        }
      })
    }).catch(err => console.error('[Player] sendLikeAction failed:', err));
  }

  // ===== 音频事件 =====

  setupAudioEvents() {
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('loadedmetadata', () => {
      this.setTime('time-total', this.audio.duration);
      this.setTime('np-time-total', this.audio.duration);
    });
    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.updatePlayButtons();
      this.setStatus('PLAYING');
      this._startBreath();
    });
    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      this.updatePlayButtons();
      this.setStatus('PAUSED');
      this._stopBreath();
    });

    // TTS 播完后播放歌曲
    this.ttsAudio.addEventListener('ended', () => {
      // intro 模式下由 handleDJResponse 的 onended 处理音量恢复，跳过重启歌曲
      if (this._introMode) return;
      // 非 intro 模式（如独立 TTS 播放结束后），才自动播放歌曲
      if (this.playlist.length > 0 && !this.audio.src) this.playCurrentTrack();
    });

    // 歌曲播完事件：优先处理延迟 intro 过渡
    this.audio.addEventListener('ended', () => {
      if (this._pendingIntro) {
        const intro = this._pendingIntro;
        this._pendingIntro = null;
        // 将 pendingIntro 中的歌曲加入播放列表
        if (intro.songs?.length > 0) {
          for (const song of intro.songs) {
            if (!this.playlist.some(s => s.name === song.name && s.artist === song.artist)) {
              this.playlist.push(song);
            }
          }
          this.renderQueue();
        }
        // 逐字显示文字 + 播放 TTS 台词，结束后切下一首
        if (intro.sayText) this._startTypewriter(intro.sayText, this._getAudioDurationMs(intro.ttsAudio));
        this._playTTSOverlay(intro.ttsAudio, () => {
          this._stopTypewriter();
          this.nextTrack();
        });
        return;
      }
      // 默认行为：播下一首
      this.nextTrack();
    });
  }

  setStatus(text) {
    const el = document.getElementById('now-status');
    if (el) el.textContent = text;
  }

  /**
   * 更新 ON AIR 徽章状态
   * @param {'idle'|'thinking'|'choosing'|'writing'|'speaking'} state
   */
  setDJState(state) {
    const badge = document.getElementById('on-air-badge');
    const text = document.getElementById('on-air-text');
    if (!badge || !text) return;

    // 清除所有状态 class
    badge.className = 'on-air-badge';

    const stateMap = {
      idle:     { label: 'ON AIR', cls: '' },
      thinking: { label: 'THINKING', cls: 'state-thinking' },
      choosing: { label: 'CHOOSING', cls: 'state-choosing' },
      writing:  { label: 'WRITING', cls: 'state-writing' },
      speaking: { label: 'SPEAKING', cls: 'state-speaking' }
    };

    const s = stateMap[state] || stateMap.idle;
    text.textContent = s.label;
    if (s.cls) badge.classList.add(s.cls);
  }

  // ===== 应用事件 =====

  setupAppEvents() {
    app.on('dj_response', (data) => this.handleDJResponse(data));
    app.on('dj_thinking', () => this.setDJState('thinking'));
    app.on('dj_state', (state) => this.setDJState(state));
    app.on('lyrics', (lrcText) => {
      if (window.lyricsManager) window.lyricsManager.render(lrcText);
    });
    app.on('dj_streaming', (chunk) => this.appendToDJMessage(chunk));
    app.on('dj_stream_end', () => this.endDJStream());
    app.on('command', (action) => {
      switch (action) {
        case 'skip': this.nextTrack(); break;
        case 'pause': this.audio.pause(); break;
        case 'resume': this.audio.play().catch(() => {}); break;
        case 'toggle': this.togglePlay(); break;
      }
    });
    app.on('error', (msg) => this.setDJMessage(msg));
  }

  handleDJResponse(data) {
    this.endDJStream();
    const sayText = data.say || this._djPendingText || '';
    this._djPendingText = '';

    // 更新 DJ Note
    if (data.reason) {
      const noteText = document.getElementById('dj-note-text');
      if (noteText) noteText.textContent = data.reason;
      const npNoteText = document.getElementById('np-dj-note-text');
      if (npNoteText) npNoteText.textContent = data.reason;
    }

    const action = data.action || 'chat';
    console.log(`[Player] DJ action: ${action}`);

    switch (action) {
      case 'chat':
        // 纯聊天：无 TTS，快速流式显示
        if (sayText) this._startTypewriter(sayText, null);
        break;

      case 'play':
        // 播放新歌：设置播放列表 + 可选 TTS intro
        if (data.songs?.length > 0) {
          this.playlist = data.songs;
          this.currentIndex = 0;
          this.updateNowPlaying();
          this.renderQueue();
          this.playCurrentTrack();
        }
        if (data.ttsAudio) {
          // TTS 播放时逐字显示文字
          if (sayText) this._startTypewriter(sayText, this._getAudioDurationMs(data.ttsAudio));
          this._playTTSOverlay(data.ttsAudio);
        } else if (sayText) {
          this._revealFullText(sayText);
        }
        break;

      case 'queue':
        // 追加队列：加歌 + 即时确认文字（快速显示）
        if (data.songs?.length > 0) {
          const wasEmpty = this.playlist.length === 0;
          for (const song of data.songs) {
            if (!this.playlist.some(s => s.name === song.name && s.artist === song.artist)) {
              this.playlist.push(song);
            }
          }
          this.renderQueue();
          console.log(`[Player] 已加入 ${data.songs.length} 首到队列`);

          // 仅当播放列表之前完全为空时，自动开始播放
          // 如果用户只是暂停了音乐，不应跳过当前歌曲
          if (wasEmpty) {
            this.currentIndex = 0;
            this.playCurrentTrack();
          }
        }
        if (sayText) this._startTypewriter(sayText, null);
        break;

      case 'queue_intro':
        // 队列衔接台词：存储 TTS + 文字，等当前歌结束后播放
        if (data.ttsAudio) {
          this._pendingIntro = {
            ttsAudio: data.ttsAudio,
            songs: data.songs,
            sayText
          };
        } else if (sayText) {
          this._revealFullText(sayText);
        }
        break;

      case 'intro':
        // 歌曲过渡：TTS 说完后播放下一首
        if (data.songs?.length > 0) {
          for (const song of data.songs) {
            if (!this.playlist.some(s => s.name === song.name && s.artist === song.artist)) {
              this.playlist.push(song);
            }
          }
          this.renderQueue();
        }
        if (data.ttsAudio) {
          if (sayText) this._startTypewriter(sayText, this._getAudioDurationMs(data.ttsAudio));
          this._playTTSOverlay(data.ttsAudio, () => {
            this._stopTypewriter();
            if (data.songs?.length > 0) this.nextTrack();
          });
        } else if (data.songs?.length > 0) {
          if (sayText) this._revealFullText(sayText);
          this.nextTrack();
        } else if (sayText) {
          this._revealFullText(sayText);
        }
        break;

      default:
        console.warn(`[Player] 未知 action: ${action}`);
        break;
    }
  }

  /**
   * 播放 TTS 覆盖层：音乐降低音量，TTS 结束后渐强恢复
   * @param {string} ttsBase64 - TTS 音频的 base64 编码
   * @param {Function} onEnd - TTS 结束后的回调（可选）
   */
  _playTTSOverlay(ttsBase64, onEnd) {
    this._introMode = true;
    this.audio.volume = 0.15;
    try {
      const binaryStr = atob(ttsBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const blobUrl = URL.createObjectURL(blob);

      this.ttsAudio.src = blobUrl;
      this.ttsAudio.play().then(() => {
        console.log('[Player] TTS 开始播放');
        this._startSpeaking();
      }).catch(err => {
        console.warn('[Player] TTS 播放失败:', err.message);
        this._introMode = false;
        this.audio.volume = this.volume;
        this._stopSpeaking();
        if (onEnd) onEnd();
      });

      this.ttsAudio.onended = () => {
        URL.revokeObjectURL(blobUrl);
        this._stopSpeaking();
        if (this._introMode) {
          this._introMode = false;
          this._fadeVolume(0.15, this.volume, 800);
        }
        this.ttsAudio.onended = null;
        if (onEnd) onEnd();
      };
    } catch (err) {
      console.warn('[Player] TTS base64 解码失败:', err.message);
      this._introMode = false;
      this.audio.volume = this.volume;
      this._stopSpeaking();
      if (onEnd) onEnd();
    }
  }

  /**
   * 开始语音可视化：流体渐变光晕（Siri / ChatGPT Voice 风格）
   */
  _startSpeaking() {
    document.body.classList.add('lumi-speaking');

    const inputRow = document.querySelector('.input-row');
    const nowBar = document.getElementById('now-bar');

    // 添加 speak-glow 基础类（如果还没有）
    if (inputRow && !inputRow.classList.contains('speak-glow')) {
      inputRow.classList.add('speak-glow');
    }
    if (nowBar && !nowBar.classList.contains('speak-glow')) {
      nowBar.classList.add('speak-glow');
    }

    // 下一帧激活（确保 CSS transition 生效）
    requestAnimationFrame(() => {
      inputRow?.classList.add('speaking', 'active');
      nowBar?.classList.add('speaking', 'active');
    });
  }

  /**
   * 停止语音可视化
   */
  _stopSpeaking() {
    document.body.classList.remove('lumi-speaking');

    const inputRow = document.querySelector('.input-row');
    const nowBar = document.getElementById('now-bar');

    // 先移除 active（触发 opacity 淡出），等动画结束后再移除 speak-glow
    inputRow?.classList.remove('active', 'speaking');
    nowBar?.classList.remove('active', 'speaking');

    setTimeout(() => {
      inputRow?.classList.remove('speak-glow');
      nowBar?.classList.remove('speak-glow');
    }, 400); // 匹配 CSS transition 0.4s
  }

  /**
   * 平滑过渡音量（用于 DJ intro 结束后音乐渐强）
   */
  _fadeVolume(from, to, duration) {
    const steps = 20;
    const stepTime = duration / steps;
    const delta = (to - from) / steps;
    let current = from;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current += delta;
      this.audio.volume = Math.max(0, Math.min(1, current));
      if (step >= steps) {
        clearInterval(timer);
        this.audio.volume = to;
      }
    }, stepTime);
  }

  // ===== 播放控制 =====

  playCurrentTrack() {
    const track = this.playlist[this.currentIndex];
    if (!track?.url) return;

    // 取消待触发的自动请求（用户手动开始播放或 DJ 响应时）
    this._cancelMoreMusicRequest();

    this.audio.src = track.url;
    this.audio.play().catch(() => {});
    this.updateNowPlaying();
    this.renderQueue();

    // 连接可视化
    try { visualizer.connectAudio(this.audio); } catch {}
  }

  updateNowPlaying() {
    const track = this.playlist[this.currentIndex];
    if (!track) return;

    // 更新首页播放条 - 歌名滚动
    const nowSong = document.getElementById('now-song-name');
    const songScroll = document.getElementById('now-song-scroll');
    if (nowSong) {
      const text = `${track.name} — ${track.artist}`;
      nowSong.textContent = text;

      // 清理旧的克隆和滚动状态
      if (songScroll) {
        const oldClone = songScroll.querySelector('.now-song-clone');
        if (oldClone) oldClone.remove();
        songScroll.classList.remove('scroll');

        // 检查是否需要滚动
        setTimeout(() => {
          if (nowSong.scrollWidth > songScroll.clientWidth) {
            // 用 data-text 属性做 CSS 滚动，不克隆 DOM
            songScroll.classList.add('scroll');
            nowSong.dataset.text = text;
          }
        }, 50);
      }
    }

    // 更新播放状态动画
    const nowBar = document.getElementById('now-bar');
    if (nowBar) {
      if (this.isPlaying) {
        nowBar.classList.add('playing');
      } else {
        nowBar.classList.remove('playing');
      }
    }

    // 更新 Now Playing 页
    const npName = document.getElementById('np-song-name');
    const npArtist = document.getElementById('np-song-artist');
    const npCover = document.getElementById('np-album-cover');
    const npPlaceholder = document.querySelector('.np-album-placeholder');
    const npBg = document.getElementById('np-bg');

    if (npName) npName.textContent = track.name;
    if (npArtist) npArtist.textContent = track.artist;
    if (npCover && track.cover) {
      npCover.src = track.cover;
      npCover.style.display = 'block';
      if (npPlaceholder) npPlaceholder.style.display = 'none';
      // 设置模糊背景
      if (npBg) npBg.style.backgroundImage = `url(${track.cover})`;

      // 封面加载后提取主色，驱动 Material Theme
      npCover.onload = () => {
        if (window.app?.glassTheme) {
          window.app.glassTheme.sampleFromAlbum(npCover);
        }
      };
      // 如果封面已缓存（complete），立即取色
      if (npCover.complete && npCover.naturalWidth) {
        if (window.app?.glassTheme) {
          window.app.glassTheme.sampleFromAlbum(npCover);
        }
      }
    } else {
      // 无封面时使用默认色
      if (window.app?.glassTheme) {
        window.app.glassTheme.applyDefault();
      }
    }

    // 清空旧歌词（新歌词会通过 lyrics 事件覆盖）
    if (window.lyricsManager) window.lyricsManager.clear();

    // 刷新心型按钮状态
    this.refreshHeartState();
  }

  togglePlay() {
    this.isPlaying ? this.audio.pause() : this.audio.play().catch(() => {});
  }

  updatePlayButtons() {
    const playIcon = '<path fill="currentColor" d="M8 5v14l11-7z"/>';
    const pauseIcon = '<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';

    const btnPlay = document.getElementById('play-icon');
    if (btnPlay) btnPlay.innerHTML = this.isPlaying ? pauseIcon : playIcon;

    // np 页面用 class 切换 SVG 显示
    const npBtnPlay = document.getElementById('np-btn-play');
    if (npBtnPlay) {
      const iconPlay = npBtnPlay.querySelector('.icon-play');
      const iconPause = npBtnPlay.querySelector('.icon-pause');
      if (iconPlay) iconPlay.style.display = this.isPlaying ? 'none' : 'block';
      if (iconPause) iconPause.style.display = this.isPlaying ? 'block' : 'none';
    }

    // 更新播放状态动画
    const nowBar = document.getElementById('now-bar');
    if (nowBar) {
      if (this.isPlaying) {
        nowBar.classList.add('playing');
      } else {
        nowBar.classList.remove('playing');
      }
    }
  }

  nextTrack() {
    if (this.playlist.length === 0) return;
    if (this.currentIndex >= this.playlist.length - 1) {
      // 播放列表已播完 — 自动请求 DJ 推荐更多音乐
      this.audio.pause();
      this.audio.currentTime = 0;
      this.setStatus('IDLE');
      this._requestMoreFromDJ();
      return;
    }
    this.currentIndex++;
    this.playCurrentTrack();
  }

  /**
   * 播放列表播完后，自动请求 DJ 推荐更多音乐
   */
  _requestMoreFromDJ() {
    // 收集最近播放过的歌名，避免重复
    const recentNames = this.playlist.map(s => `${s.name} - ${s.artist}`).join(', ');
    const msg = recentNames
      ? `The playlist just ended. Those were: ${recentNames}. Surprise me with something different — don't repeat any of these.`
      : 'The playlist just ended. Surprise me with something new.';

    // 清空播放列表，等 DJ 响应后重新填充
    this.playlist = [];
    this.currentIndex = 0;
    this.audio.removeAttribute('src');
    this.renderQueue();
    this.updateNowPlaying();

    // 10分钟后自动请求 DJ 推荐更多音乐
    this._moreMusicTimer = setTimeout(() => {
      this._moreMusicTimer = null;
      app.sendMessage(msg);
    }, 10 * 60 * 1000);
  }

  /**
   * 取消待触发的自动请求（用户手动操作时调用）
   */
  _cancelMoreMusicRequest() {
    if (this._moreMusicTimer) {
      clearTimeout(this._moreMusicTimer);
      this._moreMusicTimer = null;
    }
  }

  prevTrack() {
    if (this.playlist.length === 0) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
    } else {
      this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
      this.playCurrentTrack();
    }
  }

  updateProgress() {
    const { currentTime, duration } = this.audio;
    if (!duration) return;
    const pct = (currentTime / duration) * 100;

    const fill1 = document.getElementById('progress-fill');
    const fill2 = document.getElementById('np-progress-fill');
    if (fill1) fill1.style.width = pct + '%';
    if (fill2) fill2.style.width = pct + '%';

    // 更新拖动小圆点位置
    const dot = document.getElementById('progress-dot');
    if (dot) dot.style.left = pct + '%';

    this.setTime('time-current', currentTime);
    this.setTime('np-time-current', currentTime);

    // 同步歌词
    if (window.lyricsManager) window.lyricsManager.sync(currentTime);
  }

  setTime(id, seconds) {
    const el = document.getElementById(id);
    if (!el || !seconds || isNaN(seconds)) return;
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    el.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
  }

  setDJMessage(text) {
    const container = document.getElementById('dj-messages');
    if (!container) return;

    // 如果正在流式输出，用最终文字替换流式内容
    if (this._djStreaming) {
      const lastMsg = container.querySelector('.dj-msg:last-child .dj-msg-text');
      if (lastMsg) {
        lastMsg.textContent = text;
        this._djStreaming = false;
        return;
      }
    }

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const msg = document.createElement('div');
    msg.className = 'dj-msg';
    msg.innerHTML = `
      <div class="dj-msg-avatar"><div class="lumi-avatar lumi-sm"><div class="lumi-sphere"><div class="lumi-eyes"><div class="lumi-eye"></div><div class="lumi-eye"></div></div></div></div></div>
      <div class="dj-msg-body">
        <div class="dj-msg-text">${text}</div>
        <div class="dj-msg-meta">${time}</div>
      </div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }

  appendToDJMessage(chunk) {
    // 缓冲流式文本，等 TTS 播放时才逐字显示
    if (!this._djTextBuffer) this._djTextBuffer = '';
    this._djTextBuffer += chunk;
  }

  // 流式结束 — 解析 JSON，存储 say 文本等 TTS 播放时显示
  endDJStream() {
    if (!this._djTextBuffer) return;

    let text = this._djTextBuffer;
    this._djTextBuffer = '';

    // 从 JSON 中提取 say 字段（LLM 返回 JSON 时）
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.say) text = parsed.say;
      }
    } catch (e) { /* 非 JSON，直接使用原文 */ }

    this._djPendingText = text;
  }

  // 逐字显示 DJ 文字，与 TTS 音频同步
  /**
   * 逐字显示 DJ 文字
   * @param {string} text - 要显示的文字
   * @param {number|null} durationMs - 音频时长（毫秒），null 表示无音频（chat 模式，快速显示）
   */
  _startTypewriter(text, durationMs) {
    this._stopTypewriter();

    const container = document.getElementById('dj-messages');
    if (!container) return;

    this._djStreaming = true;
    this._typewriterRevealed = 0;
    this._typewriterText = text;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const msg = document.createElement('div');
    msg.className = 'dj-msg';
    msg.innerHTML = `
      <div class="dj-msg-avatar"><div class="lumi-avatar lumi-sm"><div class="lumi-sphere"><div class="lumi-eyes"><div class="lumi-eye"></div><div class="lumi-eye"></div></div></div></div></div>
      <div class="dj-msg-body">
        <div class="dj-msg-text"></div>
        <div class="dj-msg-meta">${time}</div>
      </div>`;
    container.appendChild(msg);

    const startReveal = (ms) => {
      const visibleChars = text.replace(/[\s.,!?;:'"()\-—–…]/g, '').length;
      const targetMs = ms * 0.85;
      let msPerChar = Math.max(15, Math.min(200, targetMs / Math.max(1, visibleChars)));

      this._typewriterTimer = setInterval(() => {
        if (this._typewriterRevealed >= text.length) {
          this._stopTypewriter();
          return;
        }
        const el = container.querySelector('.dj-msg:last-child .dj-msg-text');
        if (el) {
          this._typewriterRevealed++;
          el.textContent = text.substring(0, this._typewriterRevealed);
          container.scrollTop = container.scrollHeight;
        }
      }, msPerChar);
    };

    if (durationMs == null) {
      // 无音频（chat）：快速显示
      const visibleChars = text.replace(/[\s.,!?;:'"()\-—–…]/g, '').length;
      startReveal(Math.max(1500, visibleChars * 25));
    } else {
      startReveal(durationMs);
    }
  }

  /**
   * 从 base64 WAV 计算音频时长（毫秒）
   * 不依赖 Audio 元素，避免 src 竞争
   */
  _getAudioDurationMs(base64) {
    try {
      const binary = atob(base64);
      const sampleRate = binary.charCodeAt(24) | (binary.charCodeAt(25) << 8) | (binary.charCodeAt(26) << 16) | (binary.charCodeAt(27) << 24);
      const byteRate = binary.charCodeAt(28) | (binary.charCodeAt(29) << 8) | (binary.charCodeAt(30) << 16) | (binary.charCodeAt(31) << 24);
      if (byteRate > 0) {
        const dataSize = binary.length - 44;
        return (dataSize / byteRate) * 1000;
      }
    } catch {}
    return 10000;
  }

  _stopTypewriter() {
    if (this._typewriterTimer) {
      clearInterval(this._typewriterTimer);
      this._typewriterTimer = null;
    }
    this._djStreaming = false;
  }

  // 立即显示全部文字（无音频时的后备）
  _revealFullText(text) {
    const container = document.getElementById('dj-messages');
    if (!container) return;
    this._djStreaming = true;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const msg = document.createElement('div');
    msg.className = 'dj-msg';
    msg.innerHTML = `
      <div class="dj-msg-avatar"><div class="lumi-avatar lumi-sm"><div class="lumi-sphere"><div class="lumi-eyes"><div class="lumi-eye"></div><div class="lumi-eye"></div></div></div></div></div>
      <div class="dj-msg-body">
        <div class="dj-msg-text">${text}</div>
        <div class="dj-msg-meta">${time}</div>
      </div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    this._djStreaming = false;
  }

  // 添加用户消息到对话记录
  addUserMessage(text) {
    const container = document.getElementById('dj-messages');
    if (!container) return;

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const msg = document.createElement('div');
    msg.className = 'dj-msg user';
    msg.innerHTML = `
      <div class="dj-msg-avatar">♪</div>
      <div class="dj-msg-body">
        <div class="dj-msg-text">${text}</div>
        <div class="dj-msg-meta">${time}</div>
      </div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
  }
}

const player = new Player();
