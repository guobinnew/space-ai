# Smart Space 项目

## 项目结构
- Monorepo (npm workspaces): `desktop/` + `server/`
- desktop: Vite + React 18 + Tauri v2 (Rust)
- server: Express + TypeScript + esbuild → `dist/server.js`
- Tauri bundle.resources 使用 map 格式: `{ "../../server/dist/server.js": "server/" }`
- 服务端端口: 3721

## 环境配置
- Cargo 镜像源: rsproxy (`sparse+https://rsproxy.cn/index/`)
- Rust: 1.94.0, Node: 已安装
- Git 主分支: master

## Desktop 前端架构 (2026-06-22 更新)
- 参考项目: `D:\Work\CodePlan\smart-code`（其 desktop/src 是布局/组件参考来源）
- 样式: Tailwind CSS v4 + CSS 变量设计令牌（`src/theme/globals.css`），light/dark 双主题 via `data-theme` 属性
- 布局: `src/components/layout/` AppShell(根) → Sidebar(可折叠) + main(TabBar + ContentRouter)；图标全用内联 SVG
- 状态: `src/stores/uiStore.tsx` React Context（未用 zustand），管理 sidebarOpen/theme/tabs/activeTabId
- 主窗口 `decorations:false`，自定义 WindowControls(Windows) + `data-tauri-drag-region` 拖动；capabilities 需窗口权限
- 主题持久化: localStorage('smartspace-theme')，默认 dark，main.tsx 渲染前初始化 data-theme 防闪烁
- tsconfig.node.json 必须 `composite:true` 且不能 noEmit（被 tsconfig.json 作为 references）

## Server/Agent 架构 (2026-06-22)
- `server/agent/`: 基于 Bun.serve 的 agent server，参照 smart-code `src/server` 复刻
- **v1.2.0 (2026-07-30)**: 模型服务商下拉选择、会话消息查找、滚动优化、图标圆角、TTS修复、首页定时任务实时刷新
- 入口: `sidecar.ts server --app-root <path> --host --port`（参照 smart-code smart-sidecar.ts）
- desktop lib.rs: dev 用 `bun run sidecar.ts`，生产用 `bun build --compile` 编译的二进制
- tauri.conf.json resources: `../../server/dist/agent/` → `agent/`
- 端口 3721；API: /api/health、/api/info、/api/status、/api/sessions(桩)、/ws/* WebSocket
- bun 通过 npm 全局安装(shim: bun.cmd)，Start-Process 需用 bun.cmd 全路径
- **关键约定（用户规则）**：每次修改 `server/agent/` 下任何源码后，必须执行 `bun run build:windows`（在 `server/agent` 目录）重新编译，并复制 `server/dist/agent/smart-sidecar.exe` 到三处：`desktop/src-tauri/target/debug/agent/`、`desktop/src-tauri/target/release/agent/`、`server/dist/agent/`（编译输出本身）。否则正在运行的 desktop 应用仍加载旧二进制，新 API/逻辑不会生效（dev 模式下 bun --hot 不可靠，生产二进制更是完全静态）。复制前若 target 目录下旧 .exe 被进程占用，需先关闭应用再复制。
- **关键约定（用户规则，2026-08-03 起）**：每次 `git commit` 之前必须通过 server/agent 单元测试。`.git/hooks/pre-commit` 已配置自动运行 `cd server/agent && bun test`，失败则阻止提交。紧急情况可用 `git commit --no-verify` 跳过（不推荐）。新增/修改 server/agent 源码时必须同步更新或新增对应 `__tests__/*.test.ts`。
- **测试位置**：`server/agent/__tests__/`，使用 `bun:test` 框架（describe/test/expect/beforeEach/afterEach）。运行：`cd server/agent && bun test`（或 `npm test`）。共 4 个测试文件 73 个用例：sessionService（基础CRUD/按天分页/memory.md摘要前置/旧jsonl迁移/clearMessages）、compactService（shouldAutoCompact/isPromptTooLongError/pickCompactThroughDate/splitForPartialCompact/microcompactInPlace/compactByDays端到端）、settingService（默认值/部分更新/类型校验/不覆盖env字段）、compactPrompt（getCompactPrompt/formatCompactSummary/getCompactUserSummaryMessage）。
- **测试隔离**：`testHelpers.ts` 的 `setupTempConfig/teardownTempConfig` 通过 `SPACEAI_CONFIG_DIR` 环境变量隔离每个测试到独立临时目录。`sessionService`/`settingService` 的 configDir 改为 getter/方法动态读取 env（之前是构造时固定），便于测试隔离。

## Agent Loop 架构 (2026-07-21)
- 核心: `server/agent/services/llmStreamService.ts` — `runAnthropicLoop`/`runOpenAILoop`，参考 smart-code `query.ts`。
- **循环退出**: 只看 `toolUseBlocks.length === 0`，**不**依赖 `stop_reason`（smart-code 注释明确 stop_reason 不可靠，代理常不回传标准值）。
- **max_tokens 恢复**: 输出截断时发 nudge 续写，最多 3 次（`MAX_OUTPUT_TOKENS_RECOVERY_LIMIT`）。
- **MAX_TOOL_ROUNDS=50**（smart-code 用无限循环+auto-compact；本项目暂无压缩前用上限防溢出，达上限输出提示而非静默中断）。
- **thinking_delta 去重**（双端 `chatStore.tsx`+`llmStreamService.ts`）：处理代理重发累积/停滞/旧前缀三种模式 + 200000 字符安全阀。
- **扩展思考**: Anthropic `thinking: { enabled, budget_tokens: 32000 }`，`max_tokens: 128000`；OpenAI `max_tokens: 16000`。
- **StreamChunk 类型**: status 仅 `thinking|streaming|idle`。

## 上下文压缩 auto-compact (2026-07-21, 增强于 07-22)
- `server/agent/constants/compactPrompt.ts`: 压缩提示词（`getCompactPrompt`/`formatCompactSummary`/`getCompactUserSummaryMessage`），参考 smart-code `compact/prompt.ts` 简化版。摘要结构 9 段（Primary Request/Files/Errors/Current Work/Next Step 等），`<analysis>` 草稿区被剥离。
- `server/agent/services/compactService.ts`: token 估算 chars/4；阈值 = contextWindow - 20000(预留摘要) - 13000(缓冲)。Anthropic 默认 200K，OpenAI 128K。`shouldAutoCompact` 要求 messages.length>=4。
- 三种压缩模式（07-22 补齐）：
  - **proactive（主动）**: 每轮 loop 开始 `runAutoCompact` 检测，先 microcompact 再 partial LLM 压缩。
  - **partial**: `splitForPartialCompact` 保留近期 6 条消息原样，仅摘要旧消息（跳过孤立 tool_result）。
  - **microcompact**: `microcompactInPlace` 无 LLM，把旧工具结果(保留近 3 条)替换为占位符。兼容 Anthropic(tool_result block)/OpenAI(role 'tool')。
  - **reactive（被动）**: `callAnthropic`/`callOpenAI` 包裹重试，捕获 prompt-too-long(`isPromptTooLongError`) → `forceReactiveCompact` → 重试，最多 2 次。
- 编排函数在 `llmStreamService.ts`：`llmPartialCompact`/`runAutoCompact`/`forceReactiveCompact`。OpenAI 压缩时保留 systemPrompt（system 在 messages 内），Anthropic 不需要（systemPrompt 单独传）。
- 常量: KEEP_RECENT_MESSAGES=6, KEEP_RECENT_TOOL_RESULTS=3, MAX_REACTIVE_COMPACT_RETRIES=2, DEFAULT_CONTEXT_WINDOW_ANTHROPIC=200_000, DEFAULT_CONTEXT_WINDOW_OPENAI=128_000。

## Session 存储重构（2026-08-03，commit 8a82325）
- 存储目录：`~/.spaceai/sessions/<id>/`（之前是 `<id>.jsonl` 单文件）
  - `manifest.json`: 元信息含 `compactedThroughDate`（YYYY-MM-DD 或 null）
  - `memory.md`: 压缩摘要（触发压缩后生成/更新）
  - `<YYYY-MM-DD>.jsonl`: 按天分文件保存原始消息
- `sessionService.ts` 新 API：
  - `getMessages(id)`: LLM 上下文用，先读 memory.md 作为开头 user summary，再读 compactedThroughDate 之后所有 jsonl
  - `getMessagesByDay(id, date?)`: 前端分页用，不传 date 返回最新一天；返回 `{messages, days, requestedDay, hasMore}`
  - `readMemory/writeMemory`、`getManifest/updateManifest`、`listDays`
  - `migrateLegacyIfNeeded`: 旧 `<id>.jsonl` 在首次访问时切分到对应日期 jsonl + 写 manifest + 删除原文件
- `compactService.ts` 新增 `compactByDays(sessionId, callCompact)`:
  - 在 `shouldAutoCompact` 触发时调用
  - 把 compactedThroughDate 之后除最新一天外的所有天送 LLM 压缩
  - 旧 memory.md + 新增内容 → 重新总结 → 写回 memory.md
  - **原始 jsonl 保留不删除**
  - 更新 manifest.compactedThroughDate
- `llmStreamService.ts` `streamChat` 入口触发 compactByDays，压缩后重读 history
- API: `GET /api/sessions/:id/messages?date=YYYY-MM-DD` 按天分页
- 前端 chatStore: `loadHistory` 加载最新一天；`loadOlderDay` 向上滚动到顶加载前一天并 prepend；`PerSessionChatState` 新增 `loadedDays/loadedDaySet/hasMoreHistory/loadingHistory`；ActiveSession 监听 scrollTop<50 触发，prepend 后保持视觉位置
- 兼容旧 index.json 全局索引，SessionListItem 不变

## 任务清单 TaskList (2026-07-21)
- `desktop/src/stores/cliTaskStore.tsx`: TaskProvider 按会话隔离（ContentRouter 每 tab 包裹）。3s 轮询，JSON 快照防重渲染，按 id 升序稳定排序。`clearTasks(sessionId)` 删除服务端+前端。`fetchSessionTasks` 返回 `{tasks, hasPending, nextPending}`。
- `desktop/src/pages/ActiveSession.tsx`: 打开有未完成任务会话时主动询问是否继续；agent idle 且有 pending/in_progress 时自动续跑（nudge 明确要求调用 TaskUpdate）；全部完成且 idle 时自动清空。
- hasPending = 存在 pending 或 in_progress；nextPending = 仅 pending。

