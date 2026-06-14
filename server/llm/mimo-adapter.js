const fetch = require('node-fetch');
const BaseAdapter = require('./base-adapter');

/**
 * Mimo 大模型适配器
 * 支持 OpenAI 兼容格式和 Anthropic 格式
 */
class MimoAdapter extends BaseAdapter {
  constructor(config = {}) {
    super({
      baseUrl: config.baseUrl || process.env.MIMO_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/anthropic',
      model: config.model || process.env.MIMO_MODEL || 'mimo-v2.5',
      apiKey: config.apiKey || process.env.MIMO_API_KEY || '',
      temperature: config.temperature ?? 0.8,
      maxTokens: config.maxTokens ?? 4096
    });
    this.isAnthropic = this.baseUrl.includes('anthropic');
  }

  /**
   * 构建请求体
   */
  buildBody(messages, options = {}, stream = false) {
    const model = options.model || this.model;
    const temperature = options.temperature ?? this.temperature;
    const maxTokens = options.maxTokens ?? this.maxTokens;

    if (this.isAnthropic) {
      // Anthropic 格式
      const systemMsg = messages.find(m => m.role === 'system');
      const otherMessages = messages.filter(m => m.role !== 'system');

      const body = {
        model,
        max_tokens: maxTokens,
        temperature,
        stream,
        system: systemMsg ? systemMsg.content : undefined,
        messages: otherMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        }))
      };

      // 添加工具定义
      if (options.tools && options.tools.length > 0) {
        body.tools = options.tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema
        }));
      }

      return body;
    }

    // OpenAI 格式
    return {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream
    };
  }

  /**
   * 构建请求头
   */
  getHeaders() {
    if (this.isAnthropic) {
      return {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      };
    }
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 获取 API 端点
   */
  getEndpoint() {
    if (this.isAnthropic) {
      return `${this.baseUrl}/v1/messages`;
    }
    return `${this.baseUrl}/chat/completions`;
  }

  /**
   * 非流式调用
   */
  async chat(messages, options = {}) {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const body = this.buildBody(messages, options, false);
      const headers = this.getHeaders();
      const endpoint = this.getEndpoint();

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        timeout: 30000
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Mimo API error (${response.status}): ${text}`);
      }

      const data = await response.json();

      if (this.isAnthropic) {
        const text = data.content?.[0]?.text;
        if (text) return text;
        console.warn(`[LLM] chat attempt ${attempt}/${maxRetries} 返回空:`, JSON.stringify(data).slice(0, 300));
      } else {
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
        console.warn(`[LLM] chat attempt ${attempt}/${maxRetries} 返回空`);
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error('chat: 多次重试均返回空内容');
  }

  /**
   * 带工具调用的对话（agentic loop）
   * 支持 Anthropic 格式的 tool_use / tool_result
   */
  async chatWithTools(messages, tools = [], onToolCall = () => {}, options = {}) {
    if (!this.isAnthropic || tools.length === 0) {
      // 不支持工具，回退到普通调用
      return await this.chat(messages, options);
    }

    const maxIterations = 5; // 防止无限循环，prompt 引导最多3轮搜索
    let currentMessages = [...messages];

    for (let i = 0; i < maxIterations; i++) {
      console.log(`[LLM] chatWithTools 迭代 ${i + 1}/${maxIterations}`);
      const body = this.buildBody(currentMessages, { ...options, tools }, false);
      const headers = this.getHeaders();
      const endpoint = this.getEndpoint();

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          timeout: 60000
        });
      } catch (fetchErr) {
        console.error(`[LLM] 网络请求失败，回退到普通调用:`, fetchErr.message);
        return await this.chat(messages, options);
      }

      if (!response.ok) {
        const text = await response.text();
        // 如果 API 不支持 tools 参数，回退到普通调用
        if (text.includes('tools') || text.includes('tool_use')) {
          console.warn(`[LLM] API 不支持工具调用，回退到普通调用`);
          return await this.chat(messages, options);
        }
        throw new Error(`Mimo API error (${response.status}): ${text}`);
      }

      const data = await response.json();
      const content = data.content || [];

      // 检查是否有 tool_use 块
      const toolUseBlocks = content.filter(b => b.type === 'tool_use');

      if (toolUseBlocks.length === 0) {
        // 没有工具调用，提取文本回复
        const textBlocks = content.filter(b => b.type === 'text');
        return textBlocks.map(b => b.text).join('');
      }

      // 有工具调用：执行工具并构建 tool_result
      // 先把 assistant 的完整 response 加入消息
      currentMessages.push({ role: 'assistant', content });

      // 执行每个工具调用
      const toolResults = [];
      for (const toolBlock of toolUseBlocks) {
        console.log(`[LLM] 工具调用: ${toolBlock.name}`, JSON.stringify(toolBlock.input).slice(0, 100));
        const result = await onToolCall(toolBlock.name, toolBlock.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: String(result)
        });
      }

      // 把工具结果作为 user 消息发回
      currentMessages.push({ role: 'user', content: toolResults });
    }

    // 达到最大迭代次数：不再给 tools，强制 LLM 基于已有搜索结果整理输出
    console.warn(`[LLM] chatWithTools 达到最大迭代 ${maxIterations}，强制整理输出`);
    const finalBody = this.buildBody(currentMessages, { ...options, tools: [] }, false);
    const finalHeaders = this.getHeaders();
    const finalEndpoint = this.getEndpoint();
    try {
      const finalResp = await fetch(finalEndpoint, {
        method: 'POST',
        headers: finalHeaders,
        body: JSON.stringify(finalBody),
        timeout: 60000
      });
      if (finalResp.ok) {
        const finalData = await finalResp.json();
        const finalText = (finalData.content || [])
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('');
        if (finalText) return finalText;
      }
    } catch (e) {
      console.error(`[LLM] 强制整理输出失败:`, e.message);
    }
    // 最后兜底（极小概率走到这里）
    return 'emmm 让我想想... 你刚才说的我还需要消化一下，不如先聊聊别的？';
  }

  /**
   * 流式调用
   */
  async chatStream(messages, options = {}, onChunk = () => {}) {
    const body = this.buildBody(messages, options, true);
    const headers = this.getHeaders();
    const endpoint = this.getEndpoint();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: 60000
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Mimo API error (${response.status}): ${text}`);
    }

    let fullContent = '';
    const decoder = new TextDecoder();
    let lineBuffer = '';
    let rawBuffer = ''; // 保留原始响应，用于兜底解析

    return new Promise((resolve, reject) => {
      response.body.on('data', (chunk) => {
        const decoded = decoder.decode(chunk, { stream: true });
        rawBuffer += decoded;
        lineBuffer += decoded;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            let content;
            if (this.isAnthropic) {
              // Anthropic SSE: {"type":"content_block_delta","delta":{"text":"..."}}
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                content = parsed.delta.text;
              }
            } else {
              content = parsed.choices?.[0]?.delta?.content;
            }

            if (content) {
              fullContent += content;
              onChunk(content);
            }
          } catch (e) {}
        }
      });

      response.body.on('end', () => {
        // 处理 lineBuffer 中最后一条未完成的行
        if (lineBuffer.trim()) {
          const trimmed = lineBuffer.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              let content;
              if (this.isAnthropic) {
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  content = parsed.delta.text;
                }
              } else {
                content = parsed.choices?.[0]?.delta?.content;
              }
              if (content) {
                fullContent += content;
                onChunk(content);
              }
            } catch (e) {}
          }
        }

        // 兜底：如果 SSE 解析没拿到内容，尝试把原始响应当普通 JSON 解析
        if (fullContent.length === 0 && rawBuffer.trim()) {
          console.warn('[LLM] SSE 未解析到内容，尝试兜底 JSON 解析, raw:', rawBuffer.slice(0, 200));
          try {
            const data = JSON.parse(rawBuffer);
            if (this.isAnthropic) {
              fullContent = data.content?.[0]?.text || '';
            } else {
              fullContent = data.choices?.[0]?.message?.content || '';
            }
            if (fullContent) {
              console.log('[LLM] 兜底解析成功, 长度:', fullContent.length);
              onChunk(fullContent);
            }
          } catch (e) {
            console.warn('[LLM] 兜底解析也失败:', e.message);
          }
        }

        resolve(fullContent);
      });

      response.body.on('error', reject);
    });
  }
}

module.exports = MimoAdapter;
