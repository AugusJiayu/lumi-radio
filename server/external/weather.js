const fetch = require('node-fetch');

/**
 * 天气 API 封装（可选）
 * 使用 wttr.in 免费天气 API
 */
class Weather {
  constructor() {
    this.cache = null;
    this.cacheTime = 0;
    this.cacheDuration = 30 * 60 * 1000; // 30 分钟缓存
  }

  /**
   * 获取当前天气
   * @param {string} city - 城市名（可选，默认自动检测）
   * @returns {Promise<string|null>} 天气描述
   */
  async getWeather(city = '') {
    // 缓存检查
    if (this.cache && Date.now() - this.cacheTime < this.cacheDuration) {
      return this.cache;
    }

    try {
      const location = city || 'auto';
      const url = `https://wttr.in/${encodeURIComponent(location)}?format=%C+%t&lang=zh`;
      const response = await fetch(url, {
        timeout: 5000,
        headers: { 'User-Agent': 'Lumi-Radio/1.0' }
      });

      if (!response.ok) return null;

      const text = await response.text();
      this.cache = text.trim();
      this.cacheTime = Date.now();

      return this.cache;
    } catch (err) {
      console.warn('[Weather] 获取天气失败:', err.message);
      return null;
    }
  }
}

module.exports = Weather;
