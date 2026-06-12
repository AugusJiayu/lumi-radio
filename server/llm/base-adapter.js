/**
 * LLM 适配器统一接口
 * 所有大模型适配器必须继承此类并实现 chat() 和 chatStream() 方法
 */
class BaseAdapter {
  constructor(config = {}) {
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || '';
    this.model = config.model || '';
    this.temperature = config.temperature ?? 0.8;
    this.maxTokens = config.maxTokens ?? 1024;
  }

  /**
   * 非流式对话
   * @param {Array} messages - OpenAI 格式的消息数组 [{role, content}]
   * @param {Object} options - 可选参数覆盖
   * @returns {Promise<string>} 模型回复内容
   */
  async chat(messages, options = {}) {
    throw new Error('chat() not implemented');
  }

  /**
   * 流式对话
   * @param {Array} messages - OpenAI 格式的消息数组
   * @param {Object} options - 可选参数覆盖
   * @param {Function} onChunk - 每个 chunk 的回调 (chunk: string) => void
   * @returns {Promise<string>} 完整回复内容
   */
  async chatStream(messages, options = {}, onChunk = () => {}) {
    throw new Error('chatStream() not implemented');
  }

  /**
   * 带工具调用的对话（agentic loop）
   * @param {Array} messages - 消息数组
   * @param {Array} tools - 工具定义列表
   * @param {Function} onToolCall - 工具调用回调 (toolName, args) => Promise<result>
   * @param {Object} options - 可选参数
   * @returns {Promise<string>} 最终文本回复
   */
  async chatWithTools(messages, tools = [], onToolCall = () => {}, options = {}) {
    throw new Error('chatWithTools() not implemented');
  }

  /**
   * 更新配置（用于运行时切换 API Key 等）
   */
  updateConfig(config) {
    if (config.apiKey !== undefined) this.apiKey = config.apiKey;
    if (config.baseUrl !== undefined) this.baseUrl = config.baseUrl;
    if (config.model !== undefined) this.model = config.model;
    if (config.temperature !== undefined) this.temperature = config.temperature;
    if (config.maxTokens !== undefined) this.maxTokens = config.maxTokens;
  }
}

module.exports = BaseAdapter;
