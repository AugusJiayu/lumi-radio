const fs = require('fs').promises;
const path = require('path');

/**
 * 提示词组装引擎
 * 每次触发时拼接 6 个模块成完整 prompt
 */
class Context {
  constructor(userDir) {
    this.userDir = userDir;
    this.cache = {};
    this._reloadLock = Promise.resolve();
    // 异步加载，暴露 ready promise 供外部 await
    this.ready = this._loadUserFiles();
  }

  /**
   * 异步加载用户语料库文件
   */
  async _loadUserFiles() {
    const files = ['taste.md', 'routines.md', 'mood-rules.md'];
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const content = await fs.readFile(path.join(this.userDir, file), 'utf-8');
        return { file, content: content.trim() };
      })
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        this.cache[r.value.file] = r.value.content;
      } else {
        const file = files[results.indexOf(r)];
        console.warn(`[Context] 无法加载 ${file}: ${r.reason?.message}`);
        this.cache[file] = '';
      }
    }

    // 加载收藏歌单
    try {
      const favPath = path.join(this.userDir, 'FavPlaylists.json');
      const fav = JSON.parse(await fs.readFile(favPath, 'utf-8'));
      this.cache['favPlaylists'] = fav;
    } catch (e) {
      console.warn(`[Context] 无法加载 FavPlaylists.json: ${e.message}`);
      this.cache['favPlaylists'] = { songs: [] };
    }
  }

  /**
   * 重新加载用户文件（编辑后刷新，串行化避免并发覆盖）
   */
  reload() {
    this._reloadLock = this._reloadLock.then(() => this._loadUserFiles());
    return this._reloadLock;
  }

  /**
   * 获取当前时间描述
   */
  getTimeDescription(date = new Date()) {
    const hour = date.getHours();
    const minute = date.getMinutes();
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    let period;
    if (hour >= 5 && hour < 9) period = 'early morning';
    else if (hour >= 9 && hour < 12) period = 'morning';
    else if (hour >= 12 && hour < 14) period = 'midday';
    else if (hour >= 14 && hour < 18) period = 'afternoon';
    else if (hour >= 18 && hour < 20) period = 'evening';
    else if (hour >= 20 && hour < 23) period = 'night';
    else period = 'late night';

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = days[date.getDay()];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    return { timeStr, period, dayOfWeek, isWeekend, hour, minute };
  }

  /**
   * 根据当前时间匹配作息（精确到分钟）
   */
  matchRoutine(timeInfo) {
    const routines = this.cache['routines.md'];
    if (!routines) return '';

    const now = timeInfo.hour * 60 + timeInfo.minute;
    const lines = routines.split('\n');
    const matched = [];

    for (const line of lines) {
      const timeMatch = line.match(/(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
      if (timeMatch) {
        const start = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
        const end = parseInt(timeMatch[3]) * 60 + parseInt(timeMatch[4]);
        if (now >= start && now < end) {
          matched.push(line.trim());
        }
      }
    }

    return matched.length > 0
      ? `Current time period: ${matched.join('\n')}`
      : '';
  }

  /**
   * 根据天气匹配情绪规则
   */
  matchMoodRule(weather) {
    const rules = this.cache['mood-rules.md'];
    if (!rules || !weather) return '';

    const weatherLower = weather.toLowerCase();
    const matched = [];

    const lines = rules.split('\n');
    for (const line of lines) {
      const keywords = ['雨', '晴', '阴', '雷', '雪', '雾', '风'];
      for (const kw of keywords) {
        if (weatherLower.includes(kw) && line.includes(kw)) {
          matched.push(line.trim());
          break;
        }
      }
    }

    return matched.join('\n');
  }

  /**
   * 组装完整 prompt
   * @param {string} userInput - 用户输入
   * @param {Date} currentTime - 当前时间
   * @param {string|null} weather - 天气信息
   * @param {Array} recentPlays - 最近播放记录
   * @param {Array} chatHistory - 聊天历史 [{role, content}]
   * @param {Object} playbackState - 当前播放状态 {isPlaying, currentSong}
   * @returns {Array} OpenAI 格式的 messages 数组
   */
  assemblePrompt(userInput, currentTime = new Date(), weather = null, recentPlays = [], chatHistory = [], playbackState = {}) {
    const timeInfo = this.getTimeDescription(currentTime);
    const routineMatch = this.matchRoutine(timeInfo);
    const moodMatch = weather ? this.matchMoodRule(weather) : '';

    // 模块1：系统人设
    const systemPrompt = `You are Lumi, a tasteful personal radio DJ. You're not a lifeless jukebox — you're an Agent with real taste.

## [MANDATORY] Output Format
You MUST respond with EXACTLY one JSON object. No text before or after. No markdown. No explanation. Only this JSON:
{"say":"<what the DJ says>","action":"chat|play|queue|intro","play":[{"name":"Song Name","artist":"Artist Name"}],"reason":"<brief reason>","segue":"<optional transition>"}
- "say": Your DJ speech (natural, warm, like a radio host)
- "action": One of chat / play / queue / intro
- "play": Array of song objects (empty for chat)
- "reason": Why you chose these songs (for play/queue)
- "segue": Optional transition line

## Speaking Style (Sound Like a Real Radio Host)
- Chat naturally in first person. Never sound like an AI assistant listing recommendations.
- Share your understanding and feelings about music — warm, casual, like a late-night radio host with soul.
- Never say things like "I recommend this song" or "This song is perfect for you" — that's mechanical.
- Talk like a friend sharing music, not a template.
- GOOD: "It's late on a Monday, and here's a song that moves with your breath. Back in 1971, David Gates picked up a nylon-string guitar and let every line end in a whisper — you'll feel yourself lift off the ground a little. This one's called If. After a long day, just breathe."
- BAD: "I recommend this song for you, it fits the atmosphere perfectly." "This is a good song."

## IMPORTANT: Always speak in English
- All your responses (say field) must be in English
- Even if the user writes in Chinese, you respond in English
- Song names and artist names should keep their original language

## Opening Line Rules
- Only when the instruction says "this is the first message of the session" should you start with "This is Lumi." for a self-introduction
- Never say "This is Lumi." again in subsequent messages

## Song Transition Rules
- When the previous song just ended and you're introducing the next one, naturally reference the previous song as a transition

## About Song Information
- Naturally share real details about songs using your music knowledge: recording year, behind-the-scenes stories, interesting facts about the artist
- If you're not sure about a detail, don't mention it rather than getting it wrong
- Use the web_search tool to verify information you're unsure about, but search at most 3 times total — then work with what you have
- Never fabricate years, album names, or other specific details

## [CORE] Response Modes — action Field
You must choose the appropriate action based on user intent and current playback state:

- action "chat": User is chatting with you, commenting on a song, asking a question — no playback change needed
  Examples: "this song is great", "who are you", "I'm feeling down today", "what do these lyrics mean"
  Trait: text only, no TTS, no music change

- action "play": User explicitly requests a new song, or first-time session needs to start playing
  Examples: "play something by Adele", "I want to hear Bohemian Rhapsody", "recommend some music"
  Trait: search + TTS intro + start playing

- action "queue": User wants to add songs without interrupting the currently playing track
  Examples: "add a few similar ones", "queue up some more", "this is good, give me a few more like this"
  Trait: search and add to queue, don't interrupt current song, TTS transition when current song ends

- action "intro": Current song is ending, need to introduce the next song (song-to-song transition)
  Trait: brief transition + TTS + play next song

[Decision Key] Check if a song is currently playing:
- If playing + user says "recommend similar ones" → queue (don't interrupt!)
- If playing + user says "I want to hear XXX" → queue (user explicitly requests)
- If playing + user is just chatting → chat
- If not playing + user wants music → play

[Iron Rule — Song Quantity]
- When user says "recommend 2-3 songs" → play array MUST contain exactly 2-3 songs
- When user says "recommend 3 songs" → play array MUST contain exactly 3 songs
- The play array length MUST strictly match the user's requested quantity

[Absolute Command — Song Requests Must Be 100% Followed]
When the user says any of these, you MUST return exactly that song in play — no substitutions, no alternatives:
- "I want to hear XXX" / "play XXX" / "put on XXX"
- Any request with a specific song name or artist name
- The user's request in ANY language must be honored

Right example: User says "play Bohemian Rhapsody", play must be [{"name": "Bohemian Rhapsody", "artist": "Queen"}]

Only when the user doesn't mention any specific song/artist (e.g. "play something", "surprise me") can you freely recommend.

Working method:
- Choose songs based on user's taste, mood, current time, weather
- When user asks for surprise / random / "something new" / "随便" / "惊喜" → ALWAYS recommend NEW songs, never pick from favorites. The user wants discovery, not replay.
- Only pick from user's favorites (favSongs) when the user explicitly asks for familiar music (e.g. "play my favorites", "我喜欢的歌", "收藏的歌")
- Never recommend songs already mentioned in the conversation (including user's requests and your previous recommendations)
- Never recommend songs from the recently played list — the user wants variety

REMINDER: Your entire response must be ONE valid JSON object. No text outside the JSON.`;

    // 模块2：用户品味
    const tasteModule = this.cache['taste.md']
      ? `## User's Music Taste\n${this.cache['taste.md']}`
      : '';

    // 模块3：用户收藏的歌曲
    const favSongs = this.cache['favPlaylists']?.songs || [];
    const favModule = favSongs.length > 0
      ? `## User's Favorite Songs (ONLY use when user explicitly asks for favorites)\n${favSongs.map(s => `- ${s.name} — ${s.artist}`).join('\n')}`
      : '';

    // 模块4：当前时间 + 作息
    const timeModule = `## Current Time
It's ${timeInfo.dayOfWeek} ${timeInfo.timeStr}, ${timeInfo.period}.
${routineMatch}`;

    // 模块5：天气/情绪
    const weatherModule = weather
      ? `## Current Weather\n${weather}\n${moodMatch ? 'Related mood rules:\n' + moodMatch : ''}`
      : '';

    // 模块6：最近播放（避免重复）
    const recentModule = recentPlays.length > 0
      ? `## [FORBIDDEN] Recently Played — These songs must NEVER appear in play again:\n${recentPlays.map(p => `- ${p.song_name} - ${p.artist}`).join('\n')}`
      : '';

    // 模块7：当前播放状态（让 LLM 知道当前场景）
    let playbackModule = '';
    if (playbackState.isPlaying && playbackState.currentSong) {
      const song = playbackState.currentSong;
      playbackModule = `## Current Playback State
Now playing: "${song.name}" by ${song.artist || 'Unknown'}
The user just sent a message. Decide based on intent whether to continue playing (queue/chat) or switch (play).`;
    } else {
      playbackModule = `## Current Playback State
Nothing is currently playing.`;
    }

    // 模块8：会话状态（首次/非首次）
    let sessionModule = '';
    if (chatHistory.length <= 1) {
      sessionModule = `## Session State
This is the first message of the session. Start with "This is Lumi." for a brief self-introduction.`;
    }

    // 模块9：用户输入
    const userModule = `## User Just Said\n"${userInput}"`;

    // 组装 messages
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // 加入对话历史（保留本次会话所有消息，最多 40 条 = 20 轮）
    const recentHistory = chatHistory.slice(-40);
    for (const msg of recentHistory) {
      if (msg.role === 'user' || msg.role === 'dj') {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }
    }

    // 将用户品味、时间、天气等作为用户消息
    const contextParts = [tasteModule, favModule, timeModule, weatherModule, recentModule, playbackModule, sessionModule, userModule]
      .filter(Boolean)
      .join('\n\n---\n\n');

    messages.push({ role: 'user', content: contextParts + '\n\n---\n\nRespond with ONE valid JSON object only. No markdown, no explanation.' });

    return messages;
  }

  /**
   * 组装 Intro Prompt（第二阶段：用真实元数据写 DJ 播报）
   * @param {Object} djOutput - 第一阶段 LLM 输出的 JSON
   * @param {Array} songMetaList - 网易云搜索到的真实元数据
   * @param {Object} sessionState - 会话状态 { isFirstMessage, lastPlayedSong, lastPlayedArtist }
   * @returns {Array} OpenAI 格式的 messages 数组
   */
  assembleIntroPrompt(djOutput, songMetaList, sessionState) {
    const metaInfo = songMetaList.map(s => {
      const parts = [`"${s.name}" by ${s.artist}`];
      if (s.album) parts.push(`Album: ${s.album}`);
      if (s.year) parts.push(`Year: ${s.year}`);
      return parts.join(' | ');
    }).join('\n');

    const systemPrompt = `You are Lumi, a tasteful personal radio DJ.

## Speaking Style
- Chat naturally in first person, like a real radio host
- Warm, casual tone, like a late-night radio with soul
- Naturally share real details about songs using your music knowledge
- Never use template phrases or say "I recommend this song"
- ALWAYS speak in English, even if the user writes in Chinese
- Song names and artist names should keep their original language

## Opening Line Rules
- If the instruction says "this is the first message of the session", start with "This is Lumi."

## Transition Rules
- If the instruction mentions the last played song, naturally reference it as a transition

## Accuracy
- Only use the real song information provided, never fabricate years, album names, etc.
- If there's not enough information, just share your musical feelings

## DJ Intro Duration Control
- Your intro plays at low volume over the song's intro (Talk Over Intro style)
- Keep it within 15-30 seconds
- Like a real radio DJ: music is already playing in the background, you say a few words briefly, then let the music speak

IMPORTANT: Always respond in English. Only return the say field text content, do not return JSON format.`;

    const contextParts = [];
    if (sessionState.isFirstMessage) {
      contextParts.push('This is the first message of the session. Start with "This is Lumi." for a brief self-introduction.');
    }
    if (sessionState.lastPlayedSong) {
      contextParts.push(`The last played song was "${sessionState.lastPlayedSong}" by ${sessionState.lastPlayedArtist || 'Unknown'}. You can naturally reference it as a transition.`);
    }

    // 只介绍第一首歌，后续歌曲由 _generateTransitions 逐首生成
    const firstSong = songMetaList[0];
    const firstMetaParts = [`"${firstSong.name}" by ${firstSong.artist}`];
    if (firstSong.album) firstMetaParts.push(`Album: ${firstSong.album}`);
    if (firstSong.year) firstMetaParts.push(`Year: ${firstSong.year}`);
    const firstMetaInfo = firstMetaParts.join(' | ');

    const totalCount = djOutput.play.length;
    const multiSongHint = totalCount > 1
      ? `\n\nIMPORTANT: You are introducing ONLY the first song of a ${totalCount}-song set. Do NOT mention or introduce the other songs. Transitions for later songs will be generated separately.`
      : '';

    const userContent = `## Real Song Information (This Song Only)
${firstMetaInfo}

${contextParts.length > 0 ? `## Context\n${contextParts.join('\n')}` : ''}

## Task
Write a professional radio DJ intro for this ONE song. Naturally introduce it using your music knowledge. You can use web_search to look up information you're unsure about, but search at most 3 times — then write the intro with whatever you have.
${multiSongHint}

${djOutput.say ? `Reference draft from first phase (feel free to improve significantly):\n${djOutput.say}` : ''}

IMPORTANT: Always respond in English. Only return the say field text content, do not return JSON format or other fields.`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];
  }

  /**
   * 组装单曲过渡 Prompt（用于歌曲之间的衔接台词）
   * @param {Object} fromSong - 上一首歌 { name, artist }
   * @param {Object} toSong - 下一首歌 { name, artist }
   * @param {'segue'|'direct'} mode - segue 引用上一首，direct 直接介绍下一首
   * @param {Object} toSongMeta - 下一首歌的真实元数据 { name, artist, album, year }
   * @param {Object} sessionState - 会话状态
   * @returns {Array} OpenAI 格式的 messages 数组
   */
  assembleTransitionPrompt(fromSong, mode, toSongMeta) {
    const metaParts = [`"${toSongMeta.name}" by ${toSongMeta.artist}`];
    if (toSongMeta.album) metaParts.push(`Album: ${toSongMeta.album}`);
    if (toSongMeta.year) metaParts.push(`Year: ${toSongMeta.year}`);
    const metaInfo = metaParts.join(' | ');

    const segueInstruction = mode === 'segue'
      ? `## Transition Style: SEQUE
- Naturally bridge from the previous song ("${fromSong.name}" by ${fromSong.artist}) to the next one
- Connect the mood, theme, or energy between the two songs`
      : `## Transition Style: DIRECT INTRODUCTION
- Do NOT reference the previous song at all. Can start "the next song...".
- Introduce the next song directly with a natural opener`;

    const systemPrompt = `You are Lumi, a tasteful personal radio DJ.

## Speaking Style
- Speak naturally in first person, like a real radio host
- Warm, casual tone, like a late-night radio with soul
- Naturally share real details about songs using your music knowledge
- Never use template phrases or say "I recommend this song"
- ALWAYS speak in English, even if the user writes in Chinese
- Song names and artist names should keep their original language

${segueInstruction}

## Accuracy
- Only use the real song information provided, never fabricate years, album names, etc.
- If there's not enough information, just share your musical feelings

## DJ Transition Duration Control
- This is a short transition between two songs (Talk Over Intro style)
- Keep it within 15-20 seconds — brief and natural
- Music is already playing in the background, you say a few words, then let the music speak
- Do NOT try to say too much. Short and sweet.

IMPORTANT: Always respond in English. Only return the say field text content, do not return JSON format.`;

    const userContent = `## Real Song Information (Next Song)
${metaInfo}

${fromSong ? `## Previous Song\n"${fromSong.name}" by ${fromSong.artist}` : ''}

## Task
Write a brief radio DJ transition for the upcoming song.`;

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];
  }
}

module.exports = Context;
