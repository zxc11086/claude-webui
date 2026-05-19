# Claude Code WebUI

基于 Claude Code CLI 的 Web 界面，提供浏览器端的 AI 编程助手体验。

通过 WebSocket 实时流式传输 Claude 的响应，支持 Markdown 渲染、语法高亮、Tool Call 可视化和 Shell 输出实时展示。

## 功能特性

- **实时流式输出** — 通过 WebSocket 实时接收 Claude 的响应，体验流畅
- **Markdown 渲染** — 使用 `react-markdown` 渲染富文本，代码块带语法高亮
- **Tool Call 可视化** — 实时展示 Claude 的每一步工具调用（Bash、Read、Edit、Write、Grep、Glob 等），可展开查看输入、输出和 Shell 流
- **审批对话框** — 对危险操作（如文件编辑、命令执行）弹出审批确认，支持批准/拒绝
- **会话管理** — 侧边栏展示会话历史，支持新建、切换、删除会话
- **SQLite 持久化** — 工作区、会话和消息自动持久化存储，刷新不丢失
- **工作区隔离** — 每个用户的工作区隔离存储，Claude 在独立目录中运行
- **健康检查** — 内置 `/api/health` 端点，监控服务器状态

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 6 |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand |
| 实时通信 | Socket.IO (WebSocket) |
| Markdown | react-markdown + react-syntax-highlighter |
| 图标 | Lucide React |
| 后端框架 | Express 5 + TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| AI 引擎 | Claude Code CLI (`@anthropic-ai/claude-code`) |

## 前置条件

- **Node.js** >= 18
- **npm** >= 9
- **Claude Code CLI** — 全局安装：

```bash
npm install -g @anthropic-ai/claude-code
```

安装后验证：

```bash
claude --version
```

## 快速开始

### 1. 安装依赖

```bash
npm run install:all
```

此命令会依次安装根目录、`server/` 和 `client/` 的所有依赖。

### 2. 初始化数据库

```bash
npm run db:init
```

### 3. 启动开发服务器

```bash
npm run dev
```

这会使用 `concurrently` 同时启动：

| 服务 | 端口 | URL |
|---|---|---|
| 前端 (Vite Dev Server) | 5173 | http://localhost:5173 |
| 后端 (Express + Socket.IO) | 3001 | http://localhost:3001 |

Vite 会自动将 `/api` 和 `/socket.io` 请求代理到后端。

### 4. 打开浏览器

访问 **http://localhost:5173**

点击「开始新会话」即可与 Claude 对话。

## 项目结构

```
claude-webui/
├── client/                     # React 前端
│   ├── src/
│   │   ├── App.tsx             # 根组件（会话创建、状态管理）
│   │   ├── main.tsx            # 入口
│   │   ├── index.css           # Tailwind + 全局样式
│   │   ├── stores/
│   │   │   └── chat-store.ts   # Zustand 状态管理
│   │   ├── hooks/
│   │   │   └── use-websocket.ts # Socket.IO 连接 + 事件处理
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatView.tsx    # 聊天主视图
│   │   │   │   ├── ChatInput.tsx   # 输入框（支持 Enter 发送、自动缩放）
│   │   │   │   ├── MessageList.tsx # 消息列表 + 自动滚动
│   │   │   │   └── MessageItem.tsx # 单条消息（Markdown 渲染 + 代码高亮）
│   │   │   ├── layout/
│   │   │   │   └── Sidebar.tsx     # 侧边栏（会话列表 + 状态）
│   │   │   └── tools/
│   │   │       ├── ToolCallCard.tsx    # 可折叠 Tool Call 卡片
│   │   │       └── ApprovalDialog.tsx  # 审批弹窗
│   │   ├── lib/
│   │   │   └── utils.ts        # 工具函数
│   │   └── types/
│   │       └── index.ts        # TypeScript 类型定义
│   ├── index.html
│   ├── vite.config.ts          # Vite 配置（含 API 代理）
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── server/                     # Express 后端
│   ├── src/
│   │   ├── index.ts            # 服务器入口（Express + Socket.IO）
│   │   ├── config.ts           # 配置（端口、路径、超时等）
│   │   ├── db/
│   │   │   ├── index.ts        # 数据库初始化 + CRUD 操作
│   │   │   └── init.ts         # 数据库初始化脚本
│   │   ├── routes/
│   │   │   ├── sessions.ts     # 会话 REST API
│   │   │   └── workspaces.ts   # 工作区 REST API
│   │   ├── services/
│   │   │   ├── runtime-manager.ts # Claude 子进程管理 + 流解析
│   │   │   ├── session-service.ts # 会话业务逻辑
│   │   │   └── stream-parser.ts   # stream-json 格式解析
│   │   ├── socket/
│   │   │   └── index.ts       # Socket.IO 事件处理
│   │   └── types/
│   │       └── index.ts       # 服务端类型定义
│   └── tsconfig.json
│
├── workspaces/                 # 工作区目录（每个用户/工作区独立）
├── data/                       # SQLite 数据库文件
│   └── claude-webui.db
├── package.json                # 根 package.json（npm run dev）
└── README.md
```

## 使用指南

### 创建会话

1. 打开首页，点击「开始新会话」
2. 后端自动创建默认工作区，并启动 Claude Code CLI 子进程
3. 连接成功后，即可在输入框发送消息

### 发送消息

- 在底部输入框输入消息，按 **Enter** 发送
- 按 **Shift + Enter** 换行
- 输入框会自动缩放

### 查看 Tool Call

Claude 执行工具时，聊天区底部会实时显示 Tool Call 卡片：

- **折叠状态** — 显示工具名称和输入预览
- **展开状态** — 显示完整的输入 JSON、实时 Shell 输出（stdout/stderr 分色显示）和最终结果
- **状态指示** — 待处理（⚪）、运行中（🔄）、完成（✅）、错误（⚠️）

### 审批操作

当 Claude 需要执行文件编辑、命令执行等操作时，会弹出审批对话框：

- 显示调用的工具名称
- 显示操作说明和完整命令
- 点击「批准」允许执行
- 点击「拒绝」禁止执行

### 管理会话

- 侧边栏展示所有活跃会话
- 点击历史会话可重新加载聊天记录
- 点击删除按钮（🗑️）关闭会话

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3001` | 后端端口 |
| `HOST` | `0.0.0.0` | 后端监听地址 |
| `WORKSPACES_ROOT` | `./workspaces` | 工作区根目录 |
| `DB_PATH` | `./data/claude-webui.db` | SQLite 数据库路径 |
| `CLAUDE_PATH` | `claude` | Claude CLI 路径 |
| `SESSION_TIMEOUT` | `3600000` | 会话超时（毫秒，默认 1 小时） |
| `MAX_SESSIONS` | `5` | 每用户最大并发会话数 |

## API

### REST API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务器健康检查 |
| GET | `/api/workspaces?userId=default` | 获取工作区列表 |
| POST | `/api/workspaces` | 创建工作区 |
| GET | `/api/workspaces/:id` | 获取工作区详情 |
| GET | `/api/workspaces/:id/sessions` | 获取工作区下的会话 |
| GET | `/api/sessions/:id` | 获取会话详情 |
| GET | `/api/sessions/:id/messages` | 获取会话消息 |
| DELETE | `/api/sessions/:id` | 删除会话 |

### WebSocket 事件

**客户端 → 服务端：**

| 事件 | 说明 |
|---|---|
| `session.create` | 创建新会话 |
| `session.resume` | 恢复历史会话 |
| `session.close` | 关闭会话 |
| `chat.send` | 发送聊天消息 |
| `approval.submit` | 提交审批结果 |

**服务端 → 客户端：**

| 事件 | 说明 |
|---|---|
| `workspace.init` | 工作区初始化 |
| `session.created` | 会话创建成功 |
| `session.resumed` | 会话已恢复 |
| `session.closed` | 会话已关闭 |
| `user.message` | 用户消息回显 |
| `assistant.delta` | 助手流式内容 |
| `assistant.completed` | 助手回复完成 |
| `tool.call` | 工具调用开始 |
| `tool.stdout` | 工具标准输出来流 |
| `tool.stderr` | 工具错误输出来流 |
| `tool.result` | 工具调用结果 |
| `approval.request` | 审批请求 |
| `file.updated` | 文件更新通知 |
| `error` | 错误信息 |

## 开发

### 单独启动

```bash
# 仅启动后端
npm run dev:server

# 仅启动前端
npm run dev:client
```

### 构建

```bash
cd client && npm run build
```

构建产物在 `client/dist/`。

## 常见问题

**Q: 点击「开始新会话」后报错 "Claude CLI not found"**

A: 请确保已全局安装 Claude Code CLI：

```bash
npm install -g @anthropic-ai/claude-code
```

**Q: 端口被占用怎么办？**

A: 后端会自动尝试递增端口（3001 → 3002 → 3003 → 3004），或设置环境变量 `PORT=xxxx`。

**Q: 如何重置数据？**

A: 删除 `data/claude-webui.db` 文件并重启服务即可。

## 许可

MIT
