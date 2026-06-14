/**
 * 聊天历史逻辑
 */
class Chat {
  constructor() {
    this.messages = document.getElementById('chat-messages');
    this.init();
  }

  init() {
    this.setupAppEvents();
    this.loadHistory();
  }

  setupAppEvents() {
    app.on('dj_response', (data) => {
      this.removeStreaming();
      if (data.say) this.addEntry('dj', data.say, data.ttsHash || null);
    });

    app.on('dj_thinking', () => this.addStreaming());
    app.on('dj_streaming', (chunk) => this.appendToStreaming(chunk));
    app.on('error', (msg) => {
      this.removeStreaming();
      this.addEntry('dj', msg);
    });
  }

  addEntry(role, content, ttsHash = null) {
    // 移除欢迎页
    this.messages.querySelector('.chat-welcome')?.remove();

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const el = document.createElement('div');
    el.className = `chat-entry ${role === 'user' ? 'user-entry' : ''} fade-in`;

    const avatarHTML = role === 'dj'
      ? '<div class="lumi-avatar lumi-sm"><div class="lumi-sphere"><div class="lumi-eyes"><div class="lumi-eye"></div><div class="lumi-eye"></div></div></div></div>'
      : (typeof app !== 'undefined' && app.getUserAvatarHTML ? app.getUserAvatarHTML() : '<div class="chat-user-avatar">♪</div>');

    // DJ 消息：头像在左 + REPLAY 按钮；用户消息：头像在右，无 REPLAY
    if (role === 'dj') {
      el.innerHTML = `
        <div class="chat-avatar-col">${avatarHTML}</div>
        <div class="chat-entry-body">
          <div class="chat-entry-text">${this.escape(content)}</div>
          ${ttsHash ? `<div class="chat-entry-actions">
            <button class="chat-replay-btn" data-tts-hash="${ttsHash}">▶ REPLAY</button>
          </div>` : ''}
        </div>
      `;
      // REPLAY 按钮事件
      const replayBtn = el.querySelector('.chat-replay-btn');
      if (replayBtn) {
        replayBtn.addEventListener('click', () => this.replayTTS(ttsHash));
      }
    } else {
      // 用户消息：avatar 先写，body 后写，CSS row-reverse 让 avatar 显示在右边
      el.innerHTML = `
        <div class="chat-avatar-col">${avatarHTML}</div>
        <div class="chat-entry-body">
          <div class="chat-entry-text">${this.escape(content)}</div>
        </div>
      `;
    }

    this.messages.appendChild(el);
    this.scroll();
  }

  addStreaming() {
    if (this.streamingEl) return;
    this.streamingEl = document.createElement('div');
    this.streamingEl.className = 'chat-entry fade-in';
    this.streamingEl.innerHTML = `
      <div class="chat-avatar-col">
        <div class="lumi-avatar lumi-sm"><div class="lumi-sphere"><div class="lumi-eyes"><div class="lumi-eye"></div><div class="lumi-eye"></div></div></div></div>
      </div>
      <div class="chat-entry-body">
        <div class="chat-entry-text streaming-text" style="color:var(--green)">···</div>
      </div>
    `;
    this.messages.appendChild(this.streamingEl);
    this.scroll();
  }

  appendToStreaming(chunk) {
    if (!this.streamingEl) this.addStreaming();
    const text = this.streamingEl.querySelector('.streaming-text');
    if (text) {
      text.textContent += chunk;
      this.scroll();
    }
  }

  removeStreaming() {
    this.streamingEl?.remove();
    this.streamingEl = null;
  }

  scroll() {
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  escape(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  /**
   * 播放 TTS 缓存音频
   * @param {string} hash - TTS 文件的 MD5 hash
   */
  async replayTTS(hash) {
    if (!hash) {
      this.showToast('语音已不存在');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/tts/${hash}.wav`);
      if (!res.ok) {
        this.showToast('语音已不存在');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // 复用 player 的 TTS audio 元素
      if (window.player && window.player.ttsAudio) {
        const wasMuted = window.player.isMuted;
        const origVol = window.player.volume;
        window.player.ttsAudio.src = url;
        window.player.ttsAudio.onended = () => {
          URL.revokeObjectURL(url);
          window.player.ttsAudio.onended = null;
        };
        window.player.ttsAudio.play().catch(() => {
          URL.revokeObjectURL(url);
          this.showToast('语音播放失败');
        });
      } else {
        // fallback：创建临时 audio
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play().catch(() => {
          URL.revokeObjectURL(url);
          this.showToast('语音播放失败');
        });
      }
    } catch (err) {
      this.showToast('语音已不存在');
    }
  }

  /**
   * 显示顶部 toast 提示
   * @param {string} msg - 提示文字
   */
  showToast(msg) {
    const existing = document.querySelector('.lumi-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'lumi-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  async loadHistory() {
    try {
      const res = await fetch(`${API_BASE}/api/history?limit=30`);
      const history = await res.json();
      if (history.length === 0) {
        this.messages.innerHTML = `
          <div class="chat-welcome">
            <div class="chat-welcome-icon">✦</div>
            <h2>LUMI FM</h2>
            <p>Your mood is my prompt.<br>I hate algorithm. I have taste.</p>
          </div>
        `;
        return;
      }

      this.messages.innerHTML = '';
      // 反转顺序：DESC 取出的是最新在前，反转后按时间正序渲染（用户消息在上，DJ回复在下）
      history.reverse();
      for (const msg of history) {
        // 从 metadata 中提取 tts_hash（如果有）
        let ttsHash = msg.tts_hash || null;
        if (!ttsHash && msg.metadata) {
          try {
            const meta = JSON.parse(msg.metadata);
            ttsHash = meta.tts_hash || null;
          } catch (_) {}
        }
        this.addEntry(msg.role, msg.content, ttsHash);
      }
    } catch {
      // 静默失败
    }
  }
}

const chat = new Chat();
