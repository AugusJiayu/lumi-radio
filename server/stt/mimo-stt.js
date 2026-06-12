const fetch = require('node-fetch');
const FormData = require('form-data');

/**
 * STT 语音识别封装
 * 支持 OpenAI 兼容格式 /v1/audio/transcriptions
 * 默认使用 SiliconFlow SenseVoice（免费）
 */
class MimoSTT {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.STT_API_KEY || process.env.TTS_API_KEY || '';
    this.baseUrl = (config.baseUrl || process.env.STT_BASE_URL || 'https://api.siliconflow.cn').replace(/\/+$/, '');
    this.apiPath = config.apiPath || process.env.STT_API_PATH || '/v1/audio/transcriptions';
    this.model = config.model || process.env.STT_MODEL || 'FunAudioLLM/SenseVoiceSmall';
    this.language = config.language || process.env.STT_LANGUAGE || 'zh';
    // 认证模式：bearer（SiliconFlow/OpenAI 标准）或 api-key（Mimo 等）
    this.authMode = config.authMode || process.env.STT_AUTH_MODE || 'bearer';
  }

  /**
   * 识别音频
   * @param {Buffer} audioBuffer - 音频数据
   * @param {string} filename - 文件名（含扩展名，用于推断格式）
   * @returns {Promise<string>} 识别出的文字
   */
  async transcribe(audioBuffer, filename = 'audio.webm') {
    const form = new FormData();
    form.append('file', audioBuffer, {
      filename,
      contentType: filename.endsWith('.wav') ? 'audio/wav' : 'audio/webm'
    });
    form.append('model', this.model);
    form.append('language', this.language);

    const url = `${this.baseUrl}${this.apiPath}`;
    console.log(`[STT] 请求: ${url} (${audioBuffer.length} bytes, model=${this.model})`);

    // 根据 authMode 选择认证头
    const authHeader = this.authMode === 'bearer'
      ? { 'Authorization': `Bearer ${this.apiKey}` }
      : { 'api-key': this.apiKey };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeader,
        ...form.getHeaders()
      },
      body: form,
      timeout: 30000
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`STT API error (${response.status}): ${errText}`);
    }

    const result = await response.json();
    return result.text || '';
  }
}

module.exports = MimoSTT;
