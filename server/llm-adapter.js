const MimoAdapter = require('./llm/mimo-adapter');

/**
 * LLM 适配器工厂
 * 管理适配器实例，支持运行时切换
 */
class LLMAdapter {
  constructor(db) {
    this.db = db;
    this.adapters = {};
    this.currentAdapter = null;

    // 注册内置适配器
    this.registerAdapter('mimo', MimoAdapter);

    // 从数据库加载配置并初始化默认适配器
    this.initFromDB();
  }

  /**
   * 注册适配器类型
   */
  registerAdapter(name, AdapterClass) {
    this.adapters[name] = AdapterClass;
  }

  /**
   * 从数据库初始化配置
   */
  initFromDB() {
    const provider = this.db.getPref('llm_provider', 'mimo');
    const apiKey = this.db.getPref('llm_api_key', process.env.MIMO_API_KEY || '');
    const baseUrl = this.db.getPref('llm_base_url', process.env.MIMO_BASE_URL || '');
    const model = this.db.getPref('llm_model', process.env.MIMO_MODEL || '');
    const temperature = this.db.getPref('llm_temperature', 0.8);

    this.setAdapter(provider, { apiKey, baseUrl, model, temperature });
  }

  /**
   * 设置/切换当前适配器
   */
  setAdapter(provider, config = {}) {
    const AdapterClass = this.adapters[provider];
    if (!AdapterClass) {
      throw new Error(`Unknown LLM provider: ${provider}`);
    }

    // 如果已有同类型适配器，更新配置而非重建
    if (this.currentAdapter && this.currentProvider === provider) {
      this.currentAdapter.updateConfig(config);
    } else {
      this.currentAdapter = new AdapterClass(config);
      this.currentProvider = provider;
    }
  }

  /**
   * 更新配置并持久化
   */
  updateConfig(config) {
    if (config.provider) this.db.setPref('llm_provider', config.provider);
    if (config.apiKey) this.db.setPref('llm_api_key', config.apiKey);
    if (config.baseUrl) this.db.setPref('llm_base_url', config.baseUrl);
    if (config.model) this.db.setPref('llm_model', config.model);
    if (config.temperature !== undefined) this.db.setPref('llm_temperature', config.temperature);

    this.setAdapter(
      config.provider || this.currentProvider,
      config
    );
  }

  /**
   * 获取当前配置（脱敏）
   */
  getConfig() {
    return {
      provider: this.currentProvider,
      apiKey: this.currentAdapter.apiKey ? '***' + this.currentAdapter.apiKey.slice(-4) : '',
      baseUrl: this.currentAdapter.baseUrl,
      model: this.currentAdapter.model,
      temperature: this.currentAdapter.temperature
    };
  }

  /**
   * 非流式调用
   */
  async chat(messages, options = {}) {
    if (!this.currentAdapter) {
      throw new Error('No LLM adapter configured');
    }
    return this.currentAdapter.chat(messages, options);
  }

  /**
   * 流式调用
   */
  async chatStream(messages, options = {}, onChunk = () => {}) {
    if (!this.currentAdapter) {
      throw new Error('No LLM adapter configured');
    }
    return this.currentAdapter.chatStream(messages, options, onChunk);
  }

  /**
   * 带工具调用的对话（agentic loop）
   */
  async chatWithTools(messages, tools = [], onToolCall = () => {}, options = {}) {
    if (!this.currentAdapter) {
      throw new Error('No LLM adapter configured');
    }
    return this.currentAdapter.chatWithTools(messages, tools, onToolCall, options);
  }
}

module.exports = LLMAdapter;
