const fetch = require('node-fetch');

/**
 * 网易云音乐 API 封装
 * 使用 NeteaseCloudMusicApi 的 HTTP 模式
 */
class NeteaseMusic {
  constructor(apiBase = 'http://localhost:3000') {
    this.apiBase = apiBase;
    this.cookie = '';
  }

  /**
   * 设置登录 cookie
   * @param {string} cookie - MUSIC_U cookie 字符串
   */
  setCookie(cookie) {
    this.cookie = cookie || '';
  }

  /**
   * 获取当前 cookie
   */
  getCookie() {
    return this.cookie;
  }

  /**
   * 获取请求 headers
   */
  getHeaders() {
    const headers = {};
    if (this.cookie) {
      headers['Cookie'] = `MUSIC_U=${this.cookie}`;
    }
    return headers;
  }

  /**
   * 搜索歌曲
   * @param {string} keyword - 搜索关键词
   * @param {number} limit - 结果数量
   * @returns {Promise<Array>} 歌曲列表
   */
  async search(keyword, limit = 5) {
    try {
      const url = `${this.apiBase}/cloudsearch?keywords=${encodeURIComponent(keyword)}&limit=${limit}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (!data.result || !data.result.songs) {
        return [];
      }

      return data.result.songs.map(song => ({
        id: song.id,
        name: song.name,
        artist: song.ar.map(a => a.name).join('/'),
        album: song.al.name,
        cover: song.al.picUrl,
        duration: song.dt,
        publishTime: song.publishTime || null
      }));
    } catch (err) {
      console.error('[Netease] 搜索失败:', err.message);
      return [];
    }
  }

  /**
   * 获取歌曲播放链接
   * @param {number|string} songId - 歌曲ID
   * @param {number} br - 码率 (128000/192000/320000)
   * @returns {Promise<string|null>} 播放URL
   */
  async getPlayUrl(songId, br = 320000) {
    try {
      const url = `${this.apiBase}/song/url?id=${songId}&br=${br}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (data.data && data.data[0] && data.data[0].url) {
        return data.data[0].url;
      }
      return null;
    } catch (err) {
      console.error('[Netease] 获取播放链接失败:', err.message);
      return null;
    }
  }

  /**
   * 获取歌词
   * @param {number|string} songId - 歌曲ID
   * @returns {Promise<Object>} {lrc, tlyric}
   */
  async getLyric(songId) {
    try {
      const url = `${this.apiBase}/lyric?id=${songId}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      const data = await response.json();

      return {
        lrc: data.lrc?.lyric || '',
        tlyric: data.tlyric?.lyric || ''
      };
    } catch (err) {
      console.error('[Netease] 获取歌词失败:', err.message);
      return { lrc: '', tlyric: '' };
    }
  }

  /**
   * 获取歌曲详情
   * @param {number|string} songId - 歌曲ID
   * @returns {Promise<Object|null>} 歌曲详情
   */
  async getSongDetail(songId) {
    try {
      const url = `${this.apiBase}/song/detail?ids=${songId}`;
      const response = await fetch(url, { headers: this.getHeaders() });
      const data = await response.json();

      if (data.songs && data.songs[0]) {
        const song = data.songs[0];
        return {
          id: song.id,
          name: song.name,
          artist: song.ar.map(a => a.name).join('/'),
          album: song.al.name,
          cover: song.al.picUrl,
          duration: song.dt,
          publishTime: song.publishTime || null
        };
      }
      return null;
    } catch (err) {
      console.error('[Netease] 获取歌曲详情失败:', err.message);
      return null;
    }
  }

  /**
   * 解析 DJ 返回的播放列表
   * 搜索每首歌并获取播放链接
   * @param {Array} playList - [{name, artist}]
   * @returns {Promise<Array>} 完整的播放信息
   */
  async resolvePlayList(playList) {
    const results = [];

    for (const item of playList) {
      try {
        // 搜索歌曲
        const searchResult = await this.search(`${item.name} ${item.artist}`, 3);
        if (searchResult.length === 0) {
          console.warn(`[Netease] 未找到: ${item.name} - ${item.artist}`);
          continue;
        }

        // 找最匹配的结果
        const song = this.findBestMatch(searchResult, item.name, item.artist);
        if (!song) continue;

        // 获取播放链接
        const url = await this.getPlayUrl(song.id);
        if (!url) {
          console.warn(`[Netease] 无法获取播放链接: ${song.name}`);
          continue;
        }

        results.push({
          ...song,
          url
        });
      } catch (err) {
        console.error(`[Netease] 解析失败 ${item.name}:`, err.message);
      }
    }

    return results;
  }

  /**
   * 找到最匹配的搜索结果
   */
  findBestMatch(results, name, artist) {
    // 精确匹配
    const exact = results.find(s =>
      s.name === name && s.artist.includes(artist)
    );
    if (exact) return exact;

    // 名称包含匹配
    const nameMatch = results.find(s =>
      s.name.includes(name) || name.includes(s.name)
    );
    if (nameMatch) return nameMatch;

    // 返回第一个结果
    return results[0];
  }
}

module.exports = NeteaseMusic;
