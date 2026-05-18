# Claude Code 多用户 WebUI 系统设计文档

## 1. 项目目标

构建一个支持多用户的 WebUI 系统，通过本地安装的 Claude Code CLI 与 Claude Runtime 通信，实现：

* 多用户聊天问答
* Claude Code Session 管理
* 流式输出（stream-json）
* Tool Call 可视化
* Shell 输出实时展示
* 多项目 Workspace 支持
* 权限与隔离
* 会话恢复
* WebSocket 实时通信
* 可扩展 Agent 架构

系统目标类似：

* Claude Code Web
* Open WebUI
* Cursor Agent 面板
* Devin Session UI
* VSCode Copilot Chat

---

# 2. 总体架构

```text
┌────────────────────┐
│      Browser       │
│ React / Next.js UI │
└─────────┬──────────┘
          │ WebSocket
          ▼
┌────────────────────┐
│    API Gateway     │
│ FastAPI / NestJS   │
└─────────┬──────────┘
          │
 ┌────────┴─────────┐
 │                  │
 ▼                  ▼
Session Service   Auth Service
 │                  │
 ▼                  ▼
Claude Runtime    sqlite
Manager
 │
 ▼
Claude Code Worker
 │
 ▼
PTY / Subprocess
 │
 ▼
Claude Code CLI
 │
 ▼
stream-json stdout
```

---

# 3. 技术栈建议

## 前端

| 模块           | 技术             |
| ------------ | -------------- |
| UI Framework | Next.js 15     |
| 组件库          | shadcn/ui      |
| 状态管理         | Zustand        |
| Streaming    | WebSocket      |
| 编辑器          | Monaco Editor  |
| Terminal     | xterm.js       |
| Diff View    | Monaco Diff    |
| Markdown     | react-markdown |

---

## 后端

| 模块            | 技术                  |
| ------------- | ------------------- |
| API           | FastAPI / NestJS    |
| 实时通信          | WebSocket           |
| 任务队列          | Redis Streams       |
| 数据库           | sqlite          |
| ORM           | Prisma / SQLAlchemy |
| Session Cache | Redis               |
| Process 管理    | node-pty / pty      |

---

# 4. Claude Code 通信架构

Claude Code CLI：

```bash
claude --output stream-json
```

系统通过 PTY 或 subprocess 启动 Claude。

---

## 4.1 Runtime Manager

负责：

* 启动 Claude Session
* 管理 subprocess
* 解析 stream-json
* 转发事件
* Session 生命周期
* 多用户隔离

架构：

```text
User Session
     │
     ▼
Runtime Manager
     │
     ▼
Claude Process Pool
     │
     ▼
claude --output stream-json
```

---

## 4.2 为什么必须使用 PTY

Claude Code 是交互式 CLI。

普通 subprocess：

```python
subprocess.Popen()
```

会存在：

* ANSI 输出异常
* approval 无法处理
* tool call 卡死
* shell 行为异常

因此必须使用：

### Node

```ts
node-pty
```

### Python

```python
pty
pexpect
```

推荐：

Node Runtime Manager。

---

# 5. Stream-JSON 协议设计

## 5.1 Claude 原始输出

Claude stdout：

```json
{"type":"content.delta","delta":"hello"}
```

每行一个 JSON。

---

## 5.2 内部标准事件

建议统一成：

```ts
interface RuntimeEvent {
  id: string
  sessionId: string
  type: string
  payload: any
  createdAt: number
}
```

---

## 5.3 推荐事件类型

| type                | 含义         |
| ------------------- | ---------- |
| session.started     | session 创建 |
| user.message        | 用户输入       |
| assistant.delta     | token 输出   |
| assistant.completed | 输出完成       |
| tool.call           | 调工具        |
| tool.stdout         | shell 输出   |
| tool.result         | 工具结果       |
| approval.request    | 请求批准       |
| approval.response   | 用户批准       |
| file.updated        | 文件修改       |
| task.updated        | agent 状态   |
| error               | 错误         |
| session.closed      | session 结束 |

---

# 6. 多用户系统设计

## 6.1 用户模型

```text
User
 └── Workspace
      └── Project
           └── Session
                └── Messages
```

---

## 6.2 数据库设计

## users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at TIMESTAMP
);
```

---

## workspaces

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY,
  user_id UUID,
  name TEXT
);
```

---

## sessions

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  status TEXT,
  created_at TIMESTAMP
);
```

---

## messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  session_id UUID,
  role TEXT,
  content JSONB,
  created_at TIMESTAMP
);
```

---

# 7. Session 生命周期

## 创建

```text
POST /sessions
```

Runtime Manager：

```bash
claude --output stream-json
```

---

## 用户发送消息

WebSocket：

```json
{
  "type": "user.message",
  "content": "修复 TypeScript 错误"
}
```

---

## Claude Streaming

后端读取：

```json
{"type":"content.delta","delta":"正在分析"}
```

转发：

```json
{
  "type":"assistant.delta",
  "delta":"正在分析"
}
```

---

## Session Resume

保存：

* message history
* runtime state
* working directory
* branch
* pending tools

重新连接时恢复。

---

# 8. WebSocket 协议设计

## Client → Server

### 发送消息

```json
{
  "type":"chat.send",
  "sessionId":"xxx",
  "content":"解释这个项目"
}
```

---

### 批准 Tool Call

```json
{
  "type":"approval.submit",
  "requestId":"xxx",
  "approved":true
}
```

---

## Server → Client

### Token Streaming

```json
{
  "type":"assistant.delta",
  "delta":"hello"
}
```

---

### Tool Call

```json
{
  "type":"tool.call",
  "tool":"bash",
  "input":"npm test"
}
```

---

### Shell 输出

```json
{
  "type":"tool.stdout",
  "stream":"stdout",
  "delta":"running tests..."
}
```

---

# 9. Claude Process Pool

建议：

每个 Session 独立 Claude Process。

原因：

* context 独立
* cwd 独立
* git branch 独立
* approval 独立
* tool state 独立

---

## Process 管理

```text
Session A → Claude Process A
Session B → Claude Process B
Session C → Claude Process C
```

Runtime Manager：

* heartbeat
* timeout
* cleanup
* zombie process recycle

---

# 10. 多用户工作文件夹隔离

## 推荐方案

为每个用户创建独立的工作文件夹，依靠文件系统权限实现隔离。

```text
User
  ↓
/workspaces/{user_id}/
  ↓
Claude Code (cwd = user workspace)
```

## 目录结构

```text
/workspaces/
  ├── user_a/
  │   ├── project_1/
  │   ├── project_2/
  │   └── .claude/
  ├── user_b/
  │   ├── project_1/
  │   └── .claude/
  └── user_c/
      └── project_1/
```

每个用户拥有自己的根目录，Claude Code 以该目录为 cwd 启动：

```bash
claude --output stream-json --cwd /workspaces/{user_id}/{project_name}
```

## 隔离机制

| 维度       | 实现方式                   |
| ---------- | -------------------------- |
| 文件隔离   | 文件系统权限（uid/gid）    |
| 进程隔离   | 独立 subprocess，按 user 归属 |
| Session 隔离 | 每个 Session 独立 Claude Process |
| Git 隔离   | 各自的工作目录和 .git       |

好处：

* 实现简单，无需 Docker
* 资源开销小
* 文件直接可见，便于调试和管理
* 通过文件系统权限即可保障安全

---

# 11. Tool Call 可视化

Claude Code 会输出：

```json
{
  "type":"tool.call",
  "tool":"edit_file",
  "args":{
    "path":"src/a.ts"
  }
}
```

UI 可展示：

```text
Claude 正在编辑:
src/a.ts
```

---

## Diff 展示

推荐：

```text
Monaco Diff Editor
```

支持：

* before
* after
* patch
* approve/reject

---

# 12. Approval 系统

Claude 可能请求：

* shell 执行
* rm -rf
* git push

必须 approval。

---

## Approval Flow

```text
Claude
  ↓
approval.request
  ↓
Web UI
  ↓
User Approve
  ↓
approval.response
  ↓
Runtime Manager
```

---

# 13. 安全设计

## 必须实现

### 工作文件夹隔离

* 每个用户以独立系统账户（uid）运行 Claude Process
* 用户只能访问 `/workspaces/{user_id}/` 目录
* 通过文件系统权限（chmod 700）限制跨用户访问
* CPU/Mem 限制（cgroups / 进程级限制）

---

### 禁止危险命令

例如：

```text
rm -rf /
shutdown
reboot
curl | bash
```

---

# 14. 前端页面设计

## 页面结构

```text
Sidebar
 ├── Workspace
 ├── Sessions
 ├── Files
 └── Settings

Main Area
 ├── Chat
 ├── Tool Activity
 ├── Terminal
 └── Diff Viewer
```

---

## Chat UI

支持：

* markdown
* code highlight
* streaming token
* collapsible tool calls
* retry
* continue

---

# 15. Runtime Manager 示例（Node）

```ts
import pty from 'node-pty'

const proc = pty.spawn('claude', ['--output', 'stream-json'], {
  name: 'xterm-color',
  cols: 120,
  rows: 40,
  cwd: workspacePath,
  env: process.env
})

proc.onData((data) => {
  parseStreamJson(data)
})
```

---

# 16. Stream Parser

由于 stdout 可能 chunk 化：

```text
{"type":"conte
nt.delta"}
```

必须 Buffer。

---

## Parser 示例

```ts
let buffer = ''

proc.onData((chunk) => {
  buffer += chunk

  const lines = buffer.split('\n')
  buffer = lines.pop() || ''

  for (const line of lines) {
    if (!line.trim()) continue

    try {
      const event = JSON.parse(line)
      handleEvent(event)
    } catch {}
  }
})
```

---

# 17. Session 持久化

建议：

## Redis

保存：

* 在线 session
* process mapping
* websocket mapping

---

## sqlite

保存：

* message history
* tool logs
* file patches
* audit logs

---

# 18. 扩展能力

未来可以增加：

## MCP

支持：

* GitHub MCP
* Notion MCP
* Jira MCP
* Database MCP

---

## 多 Agent

例如：

```text
Planner Agent
Coder Agent
Reviewer Agent
Test Agent
```

---

## Agent DAG

```text
Task
 ├── Analyze
 ├── Code
 ├── Test
 └── Review
```

---

# 19. 部署架构

## 推荐生产结构

```text
Nginx
  ↓
API Gateway
  ↓
Runtime Cluster
  ↓
Claude Code
```

---

## 水平扩展

Runtime 节点：

```text
runtime-1
runtime-2
runtime-3
```

通过 Redis 分布式协调。

---

# 20. MVP 最小实现

第一阶段建议：

## Phase 1

实现：

* 单用户
* 单 Session
* WebSocket streaming
* Claude CLI 通信
* Chat UI

---

## Phase 2

增加：

* 多用户
* Session 管理
* sqlite

---

## Phase 3

增加：

* MCP
* 多 Agent
* Approval System
* Diff Viewer
* Team Workspace

---

# 21. 推荐目录结构

```text
apps/
 ├── web/
 ├── api/
 └── runtime/

packages/
 ├── protocol/
 ├── ui/
 ├── shared/
 └── sdk/
```

---

# 22. 推荐开源组件

| 功能         | 推荐        |
| ---------- | --------- |
| Terminal   | xterm.js  |
| Diff       | Monaco    |
| Queue      | BullMQ    |
| Realtime   | Socket.IO |
| Auth       | Auth.js   |
| PTY        | node-pty  |

---

# 23. 核心风险

## Claude CLI 不稳定

stream-json 可能升级。

建议：

实现：

```text
Protocol Adapter Layer
```

不要直接耦合 UI。

---

## Process 泄漏

Claude Session 可能残留。

必须：

* timeout
* heartbeat
* cleanup daemon

---

## Shell 安全

必须通过工作文件夹 + 文件系统权限隔离。

每个用户只能访问自己的 `/workspaces/{user_id}/` 目录，不要共享工作目录。

---

# 24. 推荐最终架构

## 技术推荐

### 前端

* Next.js
* shadcn/ui
* xterm.js
* Monaco

### 后端

* NestJS
* Redis
* sqlite
* Socket.IO

### Runtime

* Node.js
* node-pty

### 通信

* WebSocket
* stream-json

---

# 25. 最终结论

这个系统本质上是：

```text
Claude Runtime Orchestrator
```

核心难点不是聊天 UI。

真正难点是：

* Runtime 生命周期
* Process 管理
* Stream Protocol
* Workspace 隔离
* Approval Flow
* 多用户并发
* Session Resume
* 安全控制

推荐架构：

```text
Next.js + NestJS + node-pty + sqlite + Redis
```

这是目前最接近 Claude Code 官方 Web 的实现路线。
