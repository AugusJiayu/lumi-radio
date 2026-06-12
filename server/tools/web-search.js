const fetch = require('node-fetch');

/**
 * 联网搜索工具
 * 使用搜狗搜索（国内可用），无需 API Key
 */
class WebSearchTool {
  constructor() {
    this.name = 'web_search';
    this.description = '搜索互联网获取实时信息。当你需要查找歌曲的发行年份、录制故事、音乐人背景等真实信息时使用此工具。';
    this.input_schema = {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，例如 "David Gates Bread band If 1971 album"'
        }
      },
      required: ['query']
    };
  }

  /**
   * 获取工具定义（Anthropic 格式）
   */
  getDefinition() {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.input_schema
    };
  }

  /**
   * 执行搜索 — 搜狗搜索（国内可用）
   */
  async execute(args) {
    const { query } = args;
    if (!query) return '错误：缺少搜索关键词';

    // 尝试搜狗搜索
    try {
      const result = await this.sogouSearch(query);
      if (result && result !== '未找到相关搜索结果。') return result;
    } catch (err) {
      console.error('[WebSearch] 搜狗搜索失败:', err.message);
    }

    // 回退：使用 Bing 国内版
    try {
      const result = await this.bingSearch(query);
      if (result && result !== '未找到相关搜索结果。') return result;
    } catch (err) {
      console.error('[WebSearch] Bing 搜索失败:', err.message);
    }

    return '搜索服务暂时不可用。';
  }

  /**
   * 搜狗搜索
   */
  async sogouSearch(query) {
    const url = `https://www.sogou.com/web?query=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      timeout: 15000
    });
    const html = await response.text();

    const results = [];

    // 搜狗搜索结果：提取标题和摘要
    // 匹配 <h3> 标签内的链接标题
    const titleRegex = /<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/g;
    let match;
    while ((match = titleRegex.exec(html)) !== null && results.length < 5) {
      const title = match[1].replace(/<[^>]*>/g, '').trim();
      if (title && title.length > 5) {
        results.push(title);
      }
    }

    // 提取摘要片段
    const snippetRegex = /<p[^>]*class="[^"]*(?:text|abstract|content)[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
    while ((match = snippetRegex.exec(html)) !== null && results.length < 8) {
      const snippet = match[1].replace(/<[^>]*>/g, '').trim();
      if (snippet && snippet.length > 10 && !results.includes(snippet)) {
        results.push(snippet);
      }
    }

    if (results.length === 0) {
      return '未找到相关搜索结果。';
    }

    return `【搜索结果 - ${query}】\n${results.map(r => `- ${r}`).join('\n')}`;
  }

  /**
   * Bing 国内版搜索（回退）
   */
  async bingSearch(query) {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setmkt=zh-CN`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9'
      },
      timeout: 15000
    });
    const html = await response.text();

    const results = [];

    // Bing 搜索结果
    const regex = /<li class="b_algo"[^>]*>[\s\S]*?<h2><a[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
    let match;
    while ((match = regex.exec(html)) !== null && results.length < 5) {
      const title = match[1].replace(/<[^>]*>/g, '').trim();
      const snippet = match[2].replace(/<[^>]*>/g, '').trim();
      if (title) {
        results.push(snippet ? `${title}: ${snippet}` : title);
      }
    }

    if (results.length === 0) {
      return '未找到相关搜索结果。';
    }

    return `【搜索结果 - ${query}】\n${results.map(r => `- ${r}`).join('\n')}`;
  }
}

module.exports = WebSearchTool;
