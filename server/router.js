/**
 * 意图分流器
 * 简单指令直连执行，自然语言走大模型
 */
const WebSearchTool = require('./tools/web-search');

class Router {
  constructor(context, llmAdapter, musicService, ttsService, db) {
    this.context = context;
    this.llm = llmAdapter;
    this.music = musicService;
    this.tts = ttsService;
    this.db = db;

    // 简单指令映射
    this.commands = {
      '下一首': 'skip', '切歌': 'skip', '换一首': 'skip', '跳过': 'skip',
      '暂停': 'pause', '停一下': 'pause', '暂停播放': 'pause',
      '继续': 'resume', '播放': 'resume', '继续播放': 'resume',
      '大声点': 'volume_up', '音量大一点': 'volume_up', '大声': 'volume_up',
      '小声点': 'volume_down', '音量小一点': 'volume_down', '小声': 'volume_down',
      '单曲循环': 'repeat_one', '循环播放': 'repeat_one',
      '随机播放': 'shuffle', '随机': 'shuffle',
      '喜欢': 'like', '收藏': 'like',
      '不喜欢': 'dislike', '不要这个': 'dislike',
    };

    // 当前播放状态
    this.currentSong = null;
    this.isPlaying = false;
    this.clients = new Set();

    // 会话状态
    this.sessionState = {
      isFirstMessage: true,
      lastPlayedSong: null,
      lastPlayedArtist: null
    };

    // 工具
    this.tools = [new WebSearchTool()];

    // 消息队列（防止并发 handleMessage 导致状态竞争）
    this.messageQueue = [];
    this.isProcessing = false;
  }

  /**
   * 注册 WebSocket 客户端
   */
  addClient(ws) {
    this.clients.add(ws);
    ws.on('close', () => {
      this.clients.delete(ws);
      // 如果所有客户端都断开，重置会话状态
      if (this.clients.size === 0) {
        this.sessionState.isFirstMessage = true;
        this.sessionState.lastPlayedSong = null;
        this.sessionState.lastPlayedArtist = null;
        console.log('[Router] 所有客户端断开，会话状态已重置');
      }
    });

    // 发送当前状态
    ws.send(JSON.stringify({
      type: 'playback_state',
      song: this.currentSong,
      isPlaying: this.isPlaying
    }));
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(data);
      }
    }
  }

  /**
   * 广播 DJ 状态变化
   * @param {'idle'|'thinking'|'choosing'|'writing'|'speaking'} state
   */
  broadcastState(state) {
    this.broadcast({ type: 'dj_state', state });
  }

  /**
   * 匹配简单指令
   * 只在输入是短指令时匹配（去掉语气词后基本等于关键词），
   * 避免 "下一首放一首薛之谦的歌" 这类自然语言被误判为 skip。
   */
  matchCommand(input) {
    const normalized = input.trim();
    // 去掉末尾语气词、助词、标点后的核心文本
    const stripped = normalized.replace(/[吧呢了啊哦呀嗯么吗嘛啦。！？,.!?]+$/g, '').trim();
    for (const [keyword, action] of Object.entries(this.commands)) {
      if (stripped === keyword || normalized === keyword) {
        return { action, keyword };
      }
    }
    return null;
  }

  /**
   * 执行简单指令
   */
  executeCommand(command, ws) {
    const { action } = command;

    switch (action) {
      case 'skip':
        this.broadcast({ type: 'command', action: 'skip' });
        return { handled: true, response: '切歌~' };

      case 'pause':
        this.isPlaying = false;
        this.broadcast({ type: 'command', action: 'pause' });
        return { handled: true, response: '暂停了' };

      case 'resume':
        this.isPlaying = true;
        this.broadcast({ type: 'command', action: 'resume' });
        return { handled: true, response: '继续~' };

      case 'volume_up':
        this.broadcast({ type: 'command', action: 'volume_up' });
        return { handled: true, response: '大声一点' };

      case 'volume_down':
        this.broadcast({ type: 'command', action: 'volume_down' });
        return { handled: true, response: '小声一点' };

      case 'like':
        if (this.currentSong) {
          this.db.setPref(`liked_${this.currentSong.id}`, true);
          return { handled: true, response: '已收藏 ♥' };
        }
        return { handled: true, response: '当前没有在播放歌曲' };

      default:
        return { handled: false };
    }
  }

  /**
   * 从 LLM 响应中解析 JSON
   * 处理各种常见格式：纯 JSON、markdown 代码块、前后有文字等
   */
  parseJsonResponse(text) {
    if (!text || typeof text !== 'string') return null;

    // 1. 尝试直接解析纯 JSON
    try {
      const obj = JSON.parse(text);
      if (obj && typeof obj === 'object') return obj;
    } catch {}

    // 2. 尝试从 markdown 代码块中提取 ```json ... ``` 或 ``` ... ```
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        const obj = JSON.parse(codeBlockMatch[1].trim());
        if (obj && typeof obj === 'object') return obj;
      } catch {}
    }

    // 3. 尝试提取第一个 { ... } 块（贪婪匹配最外层）
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        const obj = JSON.parse(braceMatch[0]);
        if (obj && typeof obj === 'object') return obj;
      } catch {}
    }

    // 4. 尝试逐行找到 JSON 起始位置，手动匹配括号
    const startIdx = text.indexOf('{');
    if (startIdx !== -1) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = startIdx; i < text.length; i++) {
        const ch = text[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        if (ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              const obj = JSON.parse(text.slice(startIdx, i + 1));
              if (obj && typeof obj === 'object') return obj;
            } catch {}
            break;
          }
        }
      }
    }

    return null;
  }

  /**
   * 处理用户消息（Agent 模式）
   * LLM 根据上下文决定 action：chat / play / queue / intro
   */
  async handleMessage(userInput, ws) {
    // 排队机制：防止并发执行导致状态竞争
    return new Promise((resolve) => {
      this.messageQueue.push({ userInput, ws, resolve });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) return;
    this.isProcessing = true;

    const { userInput, ws, resolve } = this.messageQueue.shift();
    try {
      const result = await this._handleMessageInner(userInput, ws);
      resolve(result);
    } catch (err) {
      console.error('[Router] handleMessage 异常:', err.message);
      resolve(null);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }

  async _handleMessageInner(userInput, ws) {
    await this.context.ready;
    console.log(`[Router] 收到消息: "${userInput}"`);

    // 1. 尝试匹配简单指令
    const command = this.matchCommand(userInput);
    if (command) {
      const result = this.executeCommand(command, ws);
      if (result.handled) {
        this.db.saveChat('user', userInput);
        this.db.saveChat('dj', result.response, { type: 'command' });
        return;
      }
    }

    // 2. 通知客户端开始处理
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'dj_thinking' }));
    this.broadcastState('thinking');

    try {
      // 4. 组装 prompt（含对话历史 + 当前播放状态）
      const currentTime = new Date();
      const weather = null;
      const recentPlays = this.db.getRecentPlays(10);
      const chatHistory = this.db.getChatHistory(40, this.db.sessionStartedAt);
      console.log(`[Router] 聊天历史: ${chatHistory.length} 条（本次会话）`);

      const playbackState = {
        isPlaying: this.isPlaying,
        currentSong: this.currentSong
      };
      const messages = this.context.assemblePrompt(
        userInput, currentTime, weather, recentPlays, chatHistory, playbackState
      );
      console.log(`[Router] Prompt 组装完成, messages: ${messages.length} 条`);

      // 5. LLM 决策（流式输出，低温确保 JSON 格式稳定）
      console.log(`[Router] 开始调用 LLM...`);
      let fullResponse = await this.llm.chatStream(messages, { temperature: 0.4 }, (chunk) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'dj_streaming', chunk }));
        }
      });
      console.log(`[Router] LLM 完成, 长度: ${fullResponse.length}`);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'dj_stream_end' }));
      }

      // 6. 解析 JSON 输出（空响应直接重试）
      let djOutput;
      const needsRetry = !fullResponse || fullResponse.trim().length === 0;
      if (!needsRetry) {
        try {
          djOutput = this.parseJsonResponse(fullResponse);
        } catch {}
      }

      if (!djOutput) {
        if (!needsRetry) {
          console.warn('[Router] 首次 JSON 解析失败，重试中...');
          console.warn('[Router] 原始响应:', fullResponse.slice(0, 200));
        } else {
          console.warn('[Router] LLM 返回空响应，重试中...');
        }
        // 重试：非流式调用，强调 JSON 格式
        try {
          const retryMessages = [...messages];
          retryMessages.push({
            role: 'user',
            content: 'Your previous response was not valid JSON. You MUST respond with ONLY a valid JSON object. No text before or after. Example: {"say":"...","action":"chat","play":[]}'
          });
          const retryResponse = await this.llm.chat(retryMessages);
          if (retryResponse && typeof retryResponse === 'string') {
            djOutput = this.parseJsonResponse(retryResponse);
          }
          if (djOutput) {
            console.log('[Router] 重试成功，JSON 解析通过');
          } else {
            console.warn('[Router] 重试返回:', (retryResponse || '').slice(0, 200));
          }
        } catch (retryErr) {
          console.error('[Router] 重试也失败:', retryErr.message);
        }

        if (!djOutput) {
          console.error('[Router] JSON 解析最终失败，降级为 chat');
          djOutput = { say: fullResponse ? fullResponse.slice(0, 200) : '', action: 'chat', play: [] };
        }
      }

      // 确保 action 字段存在，默认为 chat
      const action = djOutput.action || 'chat';
      console.log(`[Router] LLM 决策: action=${action}, play=${djOutput.play?.length || 0}首`);

      // 7. 根据 action 分支处理
      let playList = [];
      let finalSay = djOutput.say || '';

      switch (action) {
        case 'play': {
          // 播放新歌：搜索 + 可选 TTS + 播放
          if (djOutput.play?.length > 0) {
            this.broadcastState('choosing');
            const [resolved, songMetaList] = await Promise.all([
              this.music.resolvePlayList(djOutput.play),
              this.fetchSongMetadata(djOutput.play)
            ]);
            playList = resolved;

            // 用真实元数据重写 intro（带超时保护）
            this.broadcastState('writing');
            try {
              const introMessages = this.context.assembleIntroPrompt(
                djOutput, songMetaList, this.sessionState
              );
              let searchCount = 0;
              finalSay = await Promise.race([
                this.llm.chatWithTools(
                  introMessages, this.tools,
                  async (toolName, toolArgs) => {
                    if (toolName === 'web_search') {
                      searchCount++;
                      if (searchCount > 2) {
                        return '已获取足够信息，请直接撰写DJ台词，不要再搜索。';
                      }
                      const tool = this.tools.find(t => t.name === 'web_search');
                      return await tool.execute(toolArgs);
                    }
                    return '未知工具';
                  },
                  { maxTokens: 1024 }
                ),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('阶段二超时(60s)')), 60000)
                )
              ]);
            } catch (err) {
              console.error('[Router] Intro 撰写失败，使用阶段一结果:', err.message);
            }
          }

          // 合成 TTS
          let ttsResult = null;
          if (finalSay) {
            this.broadcastState('speaking');
            try { ttsResult = await this.tts.synthesize(finalSay); }
            catch (ttsErr) { console.error('[Router] TTS 合成失败:', ttsErr.message); }
          }

          this.broadcast({
            type: 'dj_response',
            say: finalSay,
            action: 'play',
            reason: djOutput.reason,
            songs: playList,
            ttsAudio: ttsResult?.base64 || null
          });
          this.broadcastState('idle');

          // 发送歌词
          if (playList.length > 0 && playList[0].id) {
            try {
              const lyricData = await this.music.getLyric(playList[0].id);
              if (lyricData.lrc) {
                this.broadcast({ type: 'lyrics', lyrics: lyricData.lrc });
              }
            } catch (e) {
              console.error('[Router] 获取歌词失败:', e.message);
            }
          }

          // 更新会话状态
          if (playList.length > 0) {
            this.sessionState.isFirstMessage = false;
            this.sessionState.lastPlayedSong = playList[0].name;
            this.sessionState.lastPlayedArtist = playList[0].artist;
          }
          break;
        }

        case 'queue': {
          // 追加队列：先确认加入，再异步生成衔接台词
          if (djOutput.play?.length > 0) {
            this.broadcastState('choosing');
            const [resolved, songMetaList] = await Promise.all([
              this.music.resolvePlayList(djOutput.play),
              this.fetchSongMetadata(djOutput.play)
            ]);
            playList = resolved;

            // 立即发送确认消息（不含 TTS，前端会快速显示）
            const confirmSay = `好的，已加入${playList.map(s => `《${s.name}》`).join('、')}到播放列表`;
            this.broadcast({
              type: 'dj_response',
              say: confirmSay,
              action: 'queue',
              songs: playList,
              ttsAudio: null
            });

            // 异步生成衔接台词 + TTS，完成后单独发送
            this.broadcastState('writing');
            try {
              const introMessages = this.context.assembleIntroPrompt(
                djOutput, songMetaList, this.sessionState
              );
              let searchCount = 0;
              finalSay = await Promise.race([
                this.llm.chatWithTools(
                  introMessages, this.tools,
                  async (toolName, toolArgs) => {
                    if (toolName === 'web_search') {
                      searchCount++;
                      if (searchCount > 2) {
                        return '已获取足够信息，请直接撰写DJ台词，不要再搜索。';
                      }
                      const tool = this.tools.find(t => t.name === 'web_search');
                      return await tool.execute(toolArgs);
                    }
                    return '未知工具';
                  },
                  { maxTokens: 1024 }
                ),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('queue 阶段二超时(60s)')), 60000)
                )
              ]);

              if (finalSay) {
                let queueTTS = null;
                this.broadcastState('speaking');
                try { queueTTS = await this.tts.synthesize(finalSay); }
                catch (ttsErr) { console.error('[Router] TTS 合成失败:', ttsErr.message); }

                this.broadcast({
                  type: 'dj_response',
                  say: finalSay,
                  action: 'queue_intro',
                  songs: playList,
                  ttsAudio: queueTTS?.base64 || null
                });
                this.broadcastState('idle');
              }
            } catch (err) {
              console.error('[Router] Queue intro 撰写失败:', err.message);
            }
          } else {
            // 没有歌曲，降级为 chat
            this.broadcast({
              type: 'dj_response',
              say: finalSay || '收到~',
              action: 'chat',
              songs: []
            });
          }
          break;
        }

        case 'intro': {
          // 歌曲过渡：TTS + 下一首
          if (djOutput.play?.length > 0) {
            this.broadcastState('choosing');
            const [resolved, songMetaList] = await Promise.all([
              this.music.resolvePlayList(djOutput.play),
              this.fetchSongMetadata(djOutput.play)
            ]);
            playList = resolved;

            this.broadcastState('writing');
            try {
              const introMessages = this.context.assembleIntroPrompt(
                djOutput, songMetaList, this.sessionState
              );
              let searchCount = 0;
              finalSay = await Promise.race([
                this.llm.chatWithTools(
                  introMessages, this.tools,
                  async (toolName, toolArgs) => {
                    if (toolName === 'web_search') {
                      searchCount++;
                      if (searchCount > 2) {
                        return '已获取足够信息，请直接撰写DJ台词，不要再搜索。';
                      }
                      const tool = this.tools.find(t => t.name === 'web_search');
                      return await tool.execute(toolArgs);
                    }
                    return '未知工具';
                  },
                  { maxTokens: 1024 }
                ),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('intro 阶段二超时(60s)')), 60000)
                )
              ]);
            } catch (err) {
              console.error('[Router] Intro 撰写失败:', err.message);
            }
          }

          let introTTS = null;
          if (finalSay) {
            this.broadcastState('speaking');
            try { introTTS = await this.tts.synthesize(finalSay); }
            catch (ttsErr) { console.error('[Router] TTS 合成失败:', ttsErr.message); }
          }

          this.broadcast({
            type: 'dj_response',
            say: finalSay,
            action: 'intro',
            songs: playList,
            ttsAudio: introTTS?.base64 || null
          });
          this.broadcastState('idle');

          // 发送歌词
          if (playList.length > 0 && playList[0].id) {
            try {
              const lyricData = await this.music.getLyric(playList[0].id);
              if (lyricData.lrc) {
                this.broadcast({ type: 'lyrics', lyrics: lyricData.lrc });
              }
            } catch (e) {
              console.error('[Router] 获取歌词失败:', e.message);
            }
          }

          if (playList.length > 0) {
            this.sessionState.lastPlayedSong = playList[0].name;
            this.sessionState.lastPlayedArtist = playList[0].artist;
          }
          break;
        }

        case 'chat':
        default: {
          // 纯聊天：只发文字，不 TTS，不影响播放
          this.broadcast({
            type: 'dj_response',
            say: finalSay,
            action: 'chat',
            songs: [],
            ttsAudio: null
          });
          this.broadcastState('idle');
          break;
        }
      }

      // 8. 保存聊天记录 + 播放记录
      this.db.saveChat('user', userInput);
      this.db.saveChat('dj', finalSay, djOutput);
      for (const song of playList) {
        this.db.savePlayRecord(song.name, song.artist, String(song.id));
      }
      if (playList.length > 0 && action === 'play') {
        this.currentSong = playList[0];
        this.isPlaying = true;
      }

    } catch (err) {
      console.error('[Router] 处理消息失败:', err);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'error',
          message: '抱歉，我刚才走神了，能再说一遍吗？'
        }));
      }
    }
  }

  /**
   * 搜索歌曲真实元数据（年份、专辑等）
   */
  async fetchSongMetadata(playList) {
    const results = [];
    for (const item of playList) {
      try {
        const searchResult = await this.music.search(`${item.name} ${item.artist}`, 3);
        if (searchResult.length > 0) {
          const song = searchResult[0];
          const year = song.publishTime
            ? new Date(song.publishTime).getFullYear()
            : null;
          results.push({
            name: song.name,
            artist: song.artist,
            album: song.album,
            year
          });
        }
      } catch (err) {
        console.error(`[Router] 搜索元数据失败 ${item.name}:`, err.message);
      }
    }
    return results;
  }

  /**
   * 处理自动消息（定时任务触发）
   * 在消息前附加最近播放记录，避免重复推荐
   */
  async handleAutoMessage(text) {
    console.log(`[Scheduler->Router] handleAutoMessage 被调用, clients: ${this.clients.size}`);

    // 没有客户端连接，跳过
    if (this.clients.size === 0) {
      console.log(`[Scheduler->Router] 警告: 没有连接的客户端，跳过自动消息`);
      return;
    }

    const recentPlays = this.db.getRecentPlays(10);
    const recentList = recentPlays.map(p => `${p.song_name} - ${p.artist}`).join('、');
    const enrichedText = recentList
      ? `${text}\n\n（最近已播放过这些歌，请不要重复推荐：${recentList}。请推荐全新的歌曲。）`
      : text;

    console.log(`[Scheduler->Router] enrichedText: "${enrichedText.slice(0, 100)}..."`);

    // 只调用一次 handleMessage，内部 broadcast 会自动发送给所有客户端
    const firstClient = [...this.clients].find(c => c.readyState === 1);
    if (!firstClient) {
      console.log(`[Scheduler->Router] 警告: 没有可用客户端，跳过`);
      return;
    }

    console.log(`[Scheduler->Router] 调用 handleMessage...`);
    try {
      await this.handleMessage(enrichedText, firstClient);
    } catch (err) {
      console.error(`[Scheduler->Router] 自动消息处理失败:`, err.message);
    }
    console.log(`[Scheduler->Router] handleAutoMessage 完成`);
  }
}

module.exports = Router;
