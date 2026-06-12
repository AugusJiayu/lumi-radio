const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

/**
 * Mimo TTS 语音合成封装
 * 使用 OpenAI 兼容格式 + audio 字段返回 base64 音频
 */
class MimoTTS {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.TTS_API_KEY || '';
    // TTS 使用 OpenAI 兼容端点
    this.baseUrl = config.baseUrl || process.env.TTS_BASE_URL || 'https://token-plan-cn.xiaomimimo.com';
    this.voiceId = config.voiceId || process.env.TTS_VOICE_ID || 'Chloe';
    this.speed = config.speed ?? 0.9;
    this.cacheDir = config.cacheDir || path.join(__dirname, '../../data/tts-cache');
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getHash(text, voiceId) {
    return crypto.createHash('md5').update(`${text}|${voiceId}`).digest('hex');
  }

  updateConfig(config) {
    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    if (config.voiceId) this.voiceId = config.voiceId;
    if (config.speed !== undefined) this.speed = config.speed;
  }

  /**
   * 合成语音（带缓存）
   * @param {string} text - 要合成的文本
   * @returns {Promise<{filePath: string, fileName: string, hash: string, cached: boolean}>}
   */
  async synthesize(text) {
    const hash = this.getHash(text, this.voiceId);
    const fileName = `${hash}.wav`;
    const cachedPath = path.join(this.cacheDir, fileName);

    // 命中缓存
    if (fs.existsSync(cachedPath)) {
      return { filePath: cachedPath, fileName, hash, cached: true };
    }

    // 调用 Mimo TTS API（OpenAI 兼容格式）
    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mimo-v2.5-tts',
          messages: [
            {
              role: 'user',
              content: 'Convert the following text to speech.'
            },
            {
              role: 'assistant',
              content: text
            }
          ],
          audio: {
            format: 'wav',
            voice: this.voiceId,
            speed: this.speed
          }
        }),
        timeout: 30000
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`TTS API error (${response.status}): ${errText}`);
      }

      const result = await response.json();

      // 从 OpenAI 兼容响应中提取 base64 音频
      const audioData = result.choices?.[0]?.message?.audio?.data;
      if (!audioData) {
        throw new Error('TTS API 未返回音频数据');
      }

      // base64 解码并写入文件
      const audioBuffer = Buffer.from(audioData, 'base64');
      fs.writeFileSync(cachedPath, audioBuffer);

      console.log(`[TTS] 合成完成: ${fileName} (${audioBuffer.length} bytes)`);
      return { filePath: cachedPath, fileName, hash, cached: false, base64: audioData };
    } catch (err) {
      console.error('[TTS] 合成失败:', err.message);
      throw err;
    }
  }

  getCachedPath(hash) {
    const fileName = `${hash}.wav`;
    const filePath = path.join(this.cacheDir, fileName);
    return fs.existsSync(filePath) ? filePath : null;
  }

  cleanCache(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const files = fs.readdirSync(this.cacheDir);
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > maxAge) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }

    return cleaned;
  }
}

module.exports = MimoTTS;
