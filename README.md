# ✦ Lumi Radio

> Your mood is my prompt. I hate algorithm. I have taste.

Lumi 是一个基于 Mimo 大模型的 Windows 桌面私人 AI 电台 DJ。它不是普通的音乐播放器——它是一个有品味、有性格、懂你的 24/7 私人电台 DJ。它理解你的音乐品味、当前情绪、天气和作息，为你策划音乐，并用温暖的真人 DJ 语调播报选歌理由。

## ✨ 特性

### 🎙️ AI DJ 播报
- 像真人 DJ 一样介绍每一首歌，用 TTS 语音说出选歌理由
- **两阶段选歌**：第一阶段 LLM 决定播放什么并起草简短介绍；第二阶段搜索网易云获取真实元数据（年份、专辑），再用联网搜索验证事实，撰写精准的 DJ 脚本
- 语音播报时音乐自动降至 15% 音量，语音结束后渐强回 80%
- 文字逐字打出，与 TTS 语音时长同步

### 🧠 大模型驱动
- Mimo v2.5 理解你的音乐品味、当前情绪、天气和时间
- 支持 Agent 模式：LLM 自主判断是聊天、点歌、加队列还是切歌过渡
- 工具调用（Tool Calling）：LLM 可调用联网搜索验证歌曲信息

### 🎶 网易云音乐
- 海量曲库，自动搜索播放，支持二维码登录解锁 VIP 歌曲
- 智能匹配：精确匹配 → 名称包含 → 首条结果

### 🔊 TTS 语音合成
- Mimo v2.5 TTS，支持 Dean / Chloe 等多音色
- MD5 文件缓存，避免重复合成

### 🎤 语音输入 (STT)
- 麦克风录音，SiliconFlow SenseVoice 实时转文字
- 支持中文语音指令：下一首、暂停、继续、大声点、喜欢等

### 📝 歌词同步
- LRC 格式歌词实时滚动显示
- 歌曲介绍/过渡时展示元数据（艺人、专辑、制作信息）

### 💚 收藏系统
- 点击心心按钮收藏歌曲，AI 会从你的歌单里选歌
- 收藏列表持久化存储

### 🌙 定时广播
- 早/午/下午/晚/夜 5 个时段自动播报
- 深夜推荐 5-6 首歌的小歌单

### 🎨 视觉效果
- **极光丝带可视化** — 非频谱分析器，而是多层贝塞尔曲线构成的氛围光带（70% 环境 + 30% 音乐能量）
- **材质主题引擎** — 从专辑封面或背景渐变球提取主色调，动态更新玻璃面板、边框、高光和辉光的 CSS 变量
- **音频呼吸动效** — 弹簧物理驱动的边框辉光和 Now Bar 微呼吸，实时响应 RMS 音频能量
- **点阵渲染引擎** — 自定义 5×7 位图字体，CRT 辉光 + 扫描线噪点（灵感来自 Teenage Engineering / Nothing / Braun）
- **动态渐变背景** — 4 个独立运动的模糊色彩球体
- **Liquid Glass 设计** — backdrop-filter 模糊 + 色彩着色玻璃面板

### 👤 个人页
- 用户头像（点击上传，同步到聊天头像）
- 可编辑用户名
- 统计数据：收藏歌曲数、聊天消息数
- 主题切换（深色/浅色）
- 音乐品味编辑器（标签式编辑 taste.md）
- 网易云音乐连接状态

### 🖥️ 系统托盘 & 全局快捷键
- 关闭按钮最小化到托盘，不退出
- 托盘菜单：显示、下一首、暂停/继续、退出
- `Ctrl+Shift+L` 唤醒，`Ctrl+Shift+N` 下一首，`Ctrl+Shift+P` 暂停

### 🌐 深色/浅色主题
- 护眼模式随心切换，主题持久化存储

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 18 (Windows, 无边框窗口, 系统托盘, 全局快捷键) |
| 后端服务 | Node.js + Express 4.21 + WebSocket (ws 8.18) |
| 数据库 | SQLite (sql.js 纯 JS 实现，无原生依赖) |
| LLM | Mimo v2.5 (支持 Anthropic + OpenAI 格式，流式输出，工具调用) |
| TTS | Mimo v2.5 TTS (OpenAI 兼容格式，多音色) |
| STT | SiliconFlow SenseVoice (免费层，中文语音识别) |
| 音乐源 | NeteaseCloudMusicApi (本地端口 3000) |
| 前端 | 纯 HTML + CSS + 原生 JavaScript (无框架) |
| 字体 | Space Grotesk + Space Mono (Google Fonts) |
| 构建 | electron-builder (NSIS 安装包, Windows x64) |

### 核心依赖

| 包名 | 用途 |
|------|------|
| `dotenv` | 环境变量加载 |
| `express` | HTTP 服务器 |
| `ws` | WebSocket 服务器 |
| `sql.js` | SQLite (纯 JS，无原生依赖) |
| `node-fetch` v2 | HTTP 客户端 |
| `form-data` | STT 多部分表单数据 |
| `NeteaseCloudMusicApi` v4.32 | 网易云音乐 API 服务 |

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API Key

复制 `.env.example` 为 `.env`，填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# LLM 大模型
MIMO_API_KEY=your_api_key
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/anthropic
MIMO_MODEL=mimo-v2.5

# TTS 语音合成
TTS_API_KEY=your_api_key
TTS_BASE_URL=https://token-plan-cn.xiaomimimo.com
TTS_VOICE_ID=Dean
TTS_SPEED=0.9

# STT 语音识别（可选，需要语音输入功能）
STT_API_KEY=your_siliconflow_api_key
STT_BASE_URL=https://api.siliconflow.cn
STT_MODEL=FunAudioLLM/SenseVoiceSmall
STT_LANGUAGE=zh

# 服务端口
SERVER_PORT=3077
```

### 3. 启动

```bash
npm start
```

启动顺序：
1. 自动启动网易云音乐 API（端口 3000）
2. 等待 2 秒后启动后端服务（端口 3077）
3. 打开桌面窗口，前端通过 WebSocket 连接后端

### 其他命令

```bash
npm run dev      # 开发模式（服务器 + Electron 并行）
npm run server   # 仅启动后端服务（无 GUI）
npm run build    # 打包 Windows 安装程序
```

## ⌨️ 全局快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Shift+L` | 显示/隐藏 Lumi |
| `Ctrl+Shift+N` | 下一首 |
| `Ctrl+Shift+P` | 暂停/继续 |

## 🎙️ 语音指令

支持中文语音指令（需配置 STT）：

| 指令 | 功能 |
|------|------|
| 下一首 / 切歌 / 换一首 / 跳过 | 切换到下一首 |
| 暂停 / 停一下 | 暂停播放 |
| 继续 / 播放 | 继续播放 |
| 大声点 / 小声点 | 调节音量 |
| 喜欢 / 收藏 | 收藏当前歌曲 |
| 单曲循环 / 随机播放 | 切换播放模式 |

## 📂 项目结构

```
Lumi_Radio/
├── main.js                    # Electron 主进程（窗口、托盘、快捷键、进程管理）
├── preload.js                 # Electron preload（安全桥接 IPC）
├── start.js                   # 启动器（清理环境变量，启动 Electron）
├── start.bat                  # Windows 批处理启动脚本
│
├── server/                    # 后端服务
│   ├── server.js              # Express + WebSocket 服务器 (端口 3077)
│   ├── router.js              # 意图路由（命令匹配 + LLM Agent 模式）
│   ├── context.js             # 提示词组装引擎（7 模块拼装）
│   ├── llm-adapter.js         # LLM 适配器工厂（运行时切换）
│   ├── scheduler.js           # 定时广播调度器（5 个时段）
│   ├── db.js                  # SQLite 持久化（聊天历史、播放记录、用户偏好、TTS 缓存）
│   ├── llm/
│   │   ├── base-adapter.js    # LLM 抽象基类（chat / chatStream / chatWithTools）
│   │   └── mimo-adapter.js    # Mimo 适配器（支持 OpenAI + Anthropic 格式，流式，工具调用）
│   ├── music/
│   │   └── netease.js         # 网易云音乐 API 封装（搜索、播放链接、歌词、详情）
│   ├── tts/
│   │   └── mimo-tts.js        # TTS 合成 + MD5 文件缓存
│   ├── stt/
│   │   └── mimo-stt.js        # STT 语音识别（SiliconFlow SenseVoice）
│   ├── external/
│   │   └── weather.js         # 天气服务（wttr.in，30 分钟缓存）
│   └── tools/
│       └── web-search.js      # 联网搜索工具（搜狗 + 必应备用，供 LLM 工具调用）
│
├── renderer/                  # 前端界面（单页应用）
│   ├── index.html             # HTML 结构（7 个页面区域）
│   ├── js/
│   │   ├── app.js             # 主控制器（WebSocket、页面路由、事件系统、个人页）
│   │   ├── player.js          # 播放器（音乐/TTS 双音轨、音量淡入淡出、收藏、语音输入）
│   │   ├── chat.js            # 聊天历史面板
│   │   ├── visualizer.js      # 极光丝带可视化（Canvas，多层贝塞尔曲线）
│   │   ├── lyrics.js          # LRC 歌词解析、渲染、同步滚动
│   │   ├── glass.js           # 材质主题色彩提取引擎（从专辑封面或背景球提取主色调）
│   │   ├── dot-matrix.js      # 点阵渲染引擎（5×7 位图字体，CRT 辉光效果）
│   │   ├── dot-clock.js       # 点阵时钟组件
│   │   ├── spring.js          # 弹簧物理动画引擎（临界阻尼）
│   │   ├── audio-breath.js    # 音频呼吸动效（边框辉光 + Now Bar 微呼吸）
│   │   ├── settings.js        # 设置管理器
│   │   └── theme.js           # 深色/浅色主题切换
│   └── styles/
│       ├── main.css           # 全局样式、CSS 变量、Liquid Glass 设计系统、导航栏
│       ├── player.css         # 播放器、队列、Now Playing 页面样式
│       ├── chat.css           # 聊天面板样式
│       └── settings.css       # 设置页、个人页、品味编辑器样式
│
├── user/                      # 用户品味档案（可编辑，影响 AI 选歌）
│   ├── taste.md               # 音乐偏好（风格、艺人、不喜欢的类型）
│   ├── routines.md            # 日常作息（工作日 + 周末时间段）
│   ├── mood-rules.md          # 天气/情绪 → 音乐映射规则
│   └── FavPlaylists.json      # 收藏歌曲列表（界面心心按钮操作，AI 可读取选歌）
│
├── data/                      # 运行时数据（自动生成）
│   ├── lumi.db                # SQLite 数据库
│   ├── avatar.png             # 用户头像
│   └── tts-cache/             # TTS 语音缓存（WAV 文件，MD5 命名，7 天过期清理）
│
├── .env                       # API Key 配置（不提交到 git）
├── .env.example               # 配置模板
├── .gitignore
├── .npmrc                     # npm 镜像配置（Electron 使用 npmmirror）
└── package.json
```

## 🧩 工作原理

```
用户输入 → WebSocket → Router
  ├── 简单命令（下一首/暂停/音量）→ 直接执行
  └── 自然语言 → LLM Agent 管线：
       1. Context.assemblePrompt() 拼装 7 模块提示词
          ├─ 系统人格（深夜 DJ，反算法，有品味）
          ├─ 用户品味（taste.md）
          ├─ 收藏歌单（FavPlaylists.json）
          ├─ 时间 + 作息（routines.md）
          ├─ 天气/情绪规则（mood-rules.md）
          ├─ 最近播放记录（避免重复）
          └─ 当前播放状态 + 对话历史
       2. LLM 流式输出 JSON → 实时推送到前端
          { say, play[], action, reason, segue }
       3. Router 根据 action 执行：
          ├─ chat  → 纯文字对话，不切歌
          ├─ play  → 搜索新歌 + TTS 介绍
          ├─ queue → 加入队列，不打断当前播放
          └─ intro → 歌曲过渡 + TTS 串词
       4. NeteaseMusic 搜索歌曲 → 获取播放链接 + 元数据
       5. 第二次 LLM 调用（带联网搜索工具）撰写精准 DJ 脚本
       6. MimoTTS 合成语音 → base64 通过 WebSocket 传输
       7. 前端播放：音乐 15% + TTS 叠加 → 语音结束渐强到 80%
```

### 意图路由

Router 支持两种模式：
- **直接匹配**：简单指令（下一首、暂停、音量等）正则匹配后直接执行
- **LLM Agent**：自然语言交给 LLM 判断意图，输出结构化 JSON，支持工具调用（联网搜索）

消息队列保证顺序处理，防止并发状态竞争。

### LLM 适配器

- 抽象 `BaseAdapter` 定义 `chat()` / `chatStream()` / `chatWithTools()` 接口
- `MimoAdapter` 同时支持 Anthropic（`/v1/messages`）和 OpenAI（`/chat/completions`）格式，根据 base URL 自动检测
- 工具调用遵循 Anthropic `tool_use` / `tool_result` 模式，Agent 循环最多 5 轮
- JSON 输出使用低温度（0.4）保证稳定性，普通对话用 0.8

## 🎛️ 定时广播

| 时间 | 时段 | 内容 |
|------|------|------|
| 08:00 | 早间 | 早安问候 + 推荐歌曲 |
| 12:30 | 午间 | 午间放松 + 推荐歌曲 |
| 15:00 | 下午 | 下午茶 + 推荐歌曲 |
| 18:30 | 晚间 | 晚间陪伴 + 推荐歌曲 |
| 23:00 | 深夜 | 舒缓入睡 + 5-6 首歌单 |

## 🎵 自定义你的品味

编辑 `user/` 目录下的文件来让 Lumi 更懂你：

- **`taste.md`** — 你喜欢的音乐风格和艺术家，以及你讨厌的类型（也可在个人页的「我的音乐品味」中可视化编辑）
- **`routines.md`** — 你的日常作息（工作日和周末）
- **`mood-rules.md`** — 情绪/天气与音乐的映射规则
- **`FavPlaylists.json`** — 你的收藏歌曲（通过界面心心按钮操作）

## 🎨 设计系统

Lumi 采用 **Liquid Glass** 设计语言：

- **玻璃面板**：`backdrop-filter: blur(40px) saturate(1.8)` + 多层 box-shadow
- **色彩动态**：材质主题引擎从专辑封面提取主色调，实时更新 CSS 变量
- **导航胶囊**：底部悬浮胶囊导航栏，圆角 24px，iOS 26 风格
- **SVG 图标**：统一的 24×24 描边图标（stroke-width 1.8）
- **点阵字体**：5×7 位图渲染，CRT 辉光 + 扫描线效果
- **弹簧动画**：临界阻尼弹簧物理，无超调无振荡

## 📡 API 接口

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查（状态、版本、运行时间） |
| GET | `/api/history?limit=N` | 聊天历史 |
| GET | `/api/plays?limit=N` | 播放历史 |
| GET | `/api/config` | 获取配置（LLM、TTS、STT、自动播报、用户名） |
| POST | `/api/config` | 更新配置（键值对或分组） |
| GET | `/api/user-files/:filename` | 读取用户文件（taste / routines / mood-rules） |
| PUT | `/api/user-files/:filename` | 更新用户文件 |
| GET | `/api/avatar` | 检查头像是否存在 |
| POST | `/api/avatar` | 上传头像（base64，最大 5MB） |
| GET | `/api/liked-songs` | 获取收藏歌曲列表 |
| POST | `/api/liked-songs` | 收藏/取消收藏歌曲 |
| GET | `/api/scheduler` | 获取定时广播任务 |
| GET | `/api/netease/qr-key` | 网易云登录：获取二维码 key |
| GET | `/api/netease/qr-create?key=` | 网易云登录：生成二维码图片 |
| GET | `/api/netease/qr-check?key=` | 网易云登录：轮询扫码状态 |
| GET | `/api/netease/status` | 网易云登录状态 |
| POST | `/api/netease/logout` | 网易云退出登录 |

### WebSocket 消息

**前端 → 后端：**
- `user_message` — 用户文字消息
- `command` — 播放控制指令
- `ping` — 心跳保活
- `stt_start` / `stt_stop` — 语音识别开始/结束
- 二进制帧 — STT 音频数据块

**后端 → 前端：**
- `dj_response` — DJ 完整回复
- `dj_streaming` — DJ 流式文字片段
- `dj_stream_end` — 流式输出结束
- `dj_thinking` — AI 思考中状态
- `dj_state` — DJ 状态更新
- `lyrics` — 歌词数据
- `playback_state` — 播放状态同步
- `stt_result` — 语音识别结果
- `error` — 错误信息

## ⚙️ 运行时配置

所有设置均可在界面的设置页中修改，持久化到 SQLite `user_prefs` 表，优先级高于 `.env`：

- LLM：Provider、API Key、Base URL、Model、Temperature
- TTS：音色、语速、API Key、Base URL
- STT：模型、语言、API Key、Base URL、认证模式
- 自动播报开关
- 用户名
- 网易云音乐 Cookie（二维码登录后自动保存）

## 📜 License

MIT
