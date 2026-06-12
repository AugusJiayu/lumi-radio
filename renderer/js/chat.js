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
      if (data.say) this.addEntry('dj', data.say);
    });

    app.on('dj_thinking', () => this.addStreaming());
    app.on('dj_streaming', (chunk) => this.appendToStreaming(chunk));
    app.on('error', (msg) => {
      this.removeStreaming();
      this.addEntry('dj', msg);
    });
  }

  addEntry(role, content) {
    // 移除欢迎页
    this.messages.querySelector('.chat-welcome')?.remove();

    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const el = document.createElement('div');
    el.className = `chat-entry ${role === 'user' ? 'user-entry' : ''} fade-in`;
    const avatarHTML = role === 'dj'
      ? '<div class="lumi-avatar lumi-sm"><div class="lumi-sphere"><div class="lumi-eyes"><div class="lumi-eye"></div><div class="lumi-eye"></div></div></div></div>'
      : (typeof app !== 'undefined' && app.getUserAvatarHTML ? app.getUserAvatarHTML() : '<div class="chat-user-avatar">♪</div>');
    el.innerHTML = `
      <div class="chat-avatar-col">${avatarHTML}</div>
      <div class="chat-entry-body">
        <div class="chat-entry-text">${this.escape(content)}</div>
        <div class="chat-entry-actions">
          <button class="chat-replay-btn" onclick="player.setDJMessage && player.setDJMessage('${this.escape(content).replace(/'/g, "\\'")}')">▶ REPLAY</button>
        </div>
      </div>
    `;

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
      for (const msg of history) {
        this.addEntry(msg.role, msg.content);
      }
    } catch {
      // 静默失败
    }
  }
}

const chat = new Chat();
