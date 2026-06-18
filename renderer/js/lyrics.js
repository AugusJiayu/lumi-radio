/**
 * 歌词系统 — LRC 解析 + 渲染 + 同步 + 元数据/致谢
 */
class LyricsManager {
  constructor() {
    this.lines = [];        // [{ time: 秒数, text: '歌词' }]
    this.metadata = {};     // { ar: '歌手', ti: '歌名', al: '专辑', by: '来源' }
    this.credits = [];      // ['致谢行1', '致谢行2', ...]
    this.container = null;
    this.currentIdx = -1;
    this._lineEls = [];     // 缓存歌词行 DOM 引用
    this._creditEls = [];   // 缓存致谢行 DOM 引用
    this._creditsVisible = false;
  }

  /**
   * 解析 LRC 格式歌词
   * @param {string} lrcText - LRC 原文
   * @returns {Array<{time: number, text: string}>}
   */
  parseLRC(lrcText) {
    if (!lrcText) return [];
    const lines = [];
    const metaRegex = /^\[(ar|ti|al|by|offset|re|ve):(.*)\]$/;
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
    const credits = [];
    const metadata = {};

    for (const rawLine of lrcText.split('\n')) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      // 1. 元数据标签 [ar:xxx], [ti:xxx], [al:xxx], [by:xxx]
      const metaMatch = trimmed.match(metaRegex);
      if (metaMatch) {
        metadata[metaMatch[1]] = metaMatch[2].trim();
        continue;
      }

      // 2. 带时间戳的歌词行
      let hasTimestamp = false;
      const timestamps = [];
      let match;
      while ((match = timeRegex.exec(trimmed)) !== null) {
        hasTimestamp = true;
        const min = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const ms = parseInt(match[3].padEnd(3, '0'), 10);
        timestamps.push(min * 60 + sec + ms / 1000);
      }
      timeRegex.lastIndex = 0;

      if (hasTimestamp) {
        // 提取最后一个时间戳之后的文本
        const lastTsEnd = trimmed.lastIndexOf(']');
        const text = lastTsEnd >= 0 ? trimmed.substring(lastTsEnd + 1).trim() : '';
        if (text) {
          for (const time of timestamps) {
            lines.push({ time, text });
          }
        }
      }

      // 3. 无时间戳的纯文本行 → 致谢信息
      if (!hasTimestamp && trimmed.length > 0) {
        // 过滤掉纯符号行（如 --------、**** 等装饰线）
        if (!/^[-=*#~]+$/.test(trimmed)) {
          credits.push(trimmed);
        }
      }
    }

    this.metadata = metadata;
    this.credits = credits;

    // 按时间排序
    lines.sort((a, b) => a.time - b.time);
    return lines;
  }

  /**
   * 渲染歌词到容器
   * @param {string} lrcText - LRC 原文
   * @param {string} containerId - 容器 DOM id
   */
  render(lrcText, containerId = 'np-lyrics') {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.lines = this.parseLRC(lrcText);
    this.currentIdx = -1;
    this._creditsVisible = false;

    if (this.lines.length === 0) {
      // 没有带时间戳的歌词，但可能有致谢信息
      if (this.credits.length > 0) {
        this._renderCredits();
      } else {
        this.container.innerHTML = '<div class="np-lyric-placeholder">♪ 暂无歌词</div>';
      }
      this._lineEls = [];
      return;
    }

    // 构建致谢 + 歌词 HTML
    let html = '';

    // 致谢头部（前奏期间显示）
    if (this.credits.length > 0 || Object.keys(this.metadata).length > 0) {
      html += '<div class="np-credits-header">';
      if (this.metadata.ti) {
        html += `<div class="np-lyric-credit np-credit-title">${this._escape(this.metadata.ti)}</div>`;
      }
      if (this.metadata.ar) {
        html += `<div class="np-lyric-credit">Artist: ${this._escape(this.metadata.ar)}</div>`;
      }
      if (this.metadata.al) {
        html += `<div class="np-lyric-credit">Album: ${this._escape(this.metadata.al)}</div>`;
      }
      for (const credit of this.credits) {
        html += `<div class="np-lyric-credit">${this._escape(credit)}</div>`;
      }
      html += '</div>';
    }

    // 歌词行
    html += this.lines
      .map((line, i) => `<div class="np-lyric-line" data-idx="${i}">${this._escape(line.text)}</div>`)
      .join('');

    // 致谢尾部（尾奏期间显示）
    if (this.credits.length > 0) {
      html += '<div class="np-credits-footer">';
      for (const credit of this.credits) {
        html += `<div class="np-lyric-credit">${this._escape(credit)}</div>`;
      }
      html += '</div>';
    }

    this.container.innerHTML = html;

    // 缓存 DOM 引用
    this._lineEls = Array.from(this.container.querySelectorAll('.np-lyric-line'));
    this._creditEls = Array.from(this.container.querySelectorAll('.np-lyric-credit'));
  }

  /**
   * 仅渲染致谢信息（无歌词时）
   */
  _renderCredits() {
    let html = '<div class="np-credits-header">';
    if (this.metadata.ti) {
      html += `<div class="np-lyric-credit np-credit-title visible">${this._escape(this.metadata.ti)}</div>`;
    }
    if (this.metadata.ar) {
      html += `<div class="np-lyric-credit visible">Artist: ${this._escape(this.metadata.ar)}</div>`;
    }
    if (this.metadata.al) {
      html += `<div class="np-lyric-credit visible">Album: ${this._escape(this.metadata.al)}</div>`;
    }
    for (const credit of this.credits) {
      html += `<div class="np-lyric-credit visible">${this._escape(credit)}</div>`;
    }
    html += '</div>';
    this.container.innerHTML = html;
    this._creditEls = Array.from(this.container.querySelectorAll('.np-lyric-credit'));
  }

  /**
   * 根据当前播放时间同步高亮
   * @param {number} currentTime - 播放秒数
   */
  sync(currentTime) {
    if (!this.lines.length || !this.container) {
      // 无歌词但有致谢时，保持显示
      return;
    }

    // 找到当前应高亮的行
    let idx = -1;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (currentTime >= this.lines[i].time - 0.3) {
        idx = i;
        break;
      }
    }

    if (idx === this.currentIdx) return;
    this.currentIdx = idx;

    // 使用缓存的 DOM 引用更新样式
    const lineEls = this._lineEls;
    for (let i = 0; i < lineEls.length; i++) {
      const el = lineEls[i];
      const cl = el.classList;
      cl.remove('active', 'prev', 'next');
      if (i === idx) cl.add('active');
      else if (i < idx) cl.add('prev');
      else if (i === idx + 1) cl.add('next');
    }

    // 致谢信息显隐：前奏（第一行之前）和尾奏（最后一行之后）显示
    this._updateCreditsVisibility(currentTime);

    // 滚动到当前行（限制在 .np-lyrics 容器内，不影响页面其他区域）
    if (idx >= 0 && lineEls[idx]) {
      this._scrollToCenter(lineEls[idx]);
    }
  }

  /**
   * 控制致谢信息的显隐
   */
  _updateCreditsVisibility(currentTime) {
    if (!this._creditEls.length) return;

    const firstTime = this.lines[0].time;
    const lastTime = this.lines[this.lines.length - 1].time;
    // 前奏：当前时间 < 第一行时间 - 1s
    // 尾奏：当前时间 > 最后一行时间 + 2s
    const inIntro = currentTime < firstTime - 1;
    const inOutro = currentTime > lastTime + 2;
    const shouldShow = inIntro || inOutro;

    if (shouldShow !== this._creditsVisible) {
      this._creditsVisible = shouldShow;
      for (const el of this._creditEls) {
        el.classList.toggle('visible', shouldShow);
      }
      // 致谢显示时滚动到顶部（前奏）或底部（尾奏）
      if (shouldShow && this.container) {
        const target = inIntro
          ? this.container.querySelector('.np-credits-header')
          : this.container.querySelector('.np-credits-footer');
        if (target) {
          this._scrollToCenter(target);
        }
      }
    }
  }

  /**
   * 将目标元素滚动到容器中央（仅操作 .np-lyrics 容器，不影响页面）
   */
  _scrollToCenter(target) {
    if (!this.container || !target) return;
    const containerRect = this.container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top - containerRect.height / 2 + targetRect.height / 2;
    this.container.scrollTo({
      top: this.container.scrollTop + offset,
      behavior: 'smooth'
    });
  }

  /**
   * 清空歌词
   */
  clear() {
    this.lines = [];
    this.metadata = {};
    this.credits = [];
    this.currentIdx = -1;
    this._lineEls = [];
    this._creditEls = [];
    this._creditsVisible = false;
    if (this.container) {
      this.container.innerHTML = '<div class="np-lyric-placeholder">♪ 暂无歌词</div>';
    }
  }

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// 全局实例
window.lyricsManager = new LyricsManager();
