# Release v1.3.0

**发布日期**: 2026-08-03  
**版本**: v1.3.0  
**合并提交**: 82ba275

---

## 新功能

### 会话存储重构（按天 JSONL + memory.md 压缩）
- 会话存储从单文件 `<id>.jsonl` 重构为目录结构 `~/.spaceai/sessions/<id>/`
- 每个会话目录包含：`manifest.json`（元信息）、`memory.md`（压缩摘要）、`<YYYY-MM-DD>.jsonl`（按天分文件）
- 会话消息按天分文件保存，原始数据保留可追溯
- 按天粒度自动压缩：触发条件不变（token 估算超阈值），把截止日之前的多天消息送 LLM 生成摘要写回 `memory.md`，更新 `manifest.compactedThroughDate`
- 上下文拼装：先读 `memory.md` 摘要作为开头，再读压缩截止日之后的 jsonl
- 旧 `<id>.jsonl` 单文件首次访问时自动懒迁移；提供批量迁移脚本 `scripts/migrate-sessions.ts`

### 会话按天分页加载
- 前端默认只加载最新一天的会话消息
- 向上滚动到接近顶部时自动加载前一天的消息并 prepend，保持视觉位置不跳动
- 已压缩到 memory.md 的日期不直接展示，其内容已合并到摘要

### 服务端单元测试套件
- 新增 `server/agent/__tests__/` 单元测试，覆盖 sessionService / compactService / settingService / compactPrompt
- 共 4 个测试文件、73 个用例全部通过
- 新增 `.git/hooks/pre-commit`：每次 commit 前自动运行单元测试，失败则阻止提交

### 文件引用 tag 存在性检查
- 会话历史消息中的文件引用 tag 异步检查源文件是否存在
- 文件已被删除/移动时：tag 变红 + 三角警告图标 + 禁用点击，tooltip 提示"路径不存在"
- 避免点击已失效的文件引用出现困惑

### 朗读模式增强
- 进入 MD 朗读模式后仍可打开/切换其他文件，朗读继续播放不受影响
- 同一时间仅一个 MD 进入朗读模式；打开新文档朗读时自动退出当前朗读

### 关于页面改版
- 页面下方区域改为 Tab 切换："功能介绍"（原核心功能/架构/技术栈/服务商）+ "说明文档"（左侧 doc 目录文件列表 + 右侧 Markdown 预览）
- 联系作者二维码移出到页面顶部右侧（float 布局，减少空白）
- 两个 Tab 高度一致，功能介绍页内增加滚动条
- 说明文档数据源支持 `~/.spaceai/doc/`（安装时同步）与项目 doc 目录（dev 模式 fallback）

### 文档打包
- Tauri 打包时把 `D:\Work\SpaceAI\doc` 目录打包进安装包
- 安装后启动时自动同步到 `~/.spaceai/doc/`（带版本标记避免重复拷贝）
- 新增 desktop 客户端使用手册 `MANUAL.MD`
- 新增 v1.2.0 / v1.3.0 版本发布说明

---

## 优化

### 关于页面布局
- App identity + Description 上移减少空白间距
- 联系作者二维码采用 float 布局，内容文字环绕排布

---

## Bug 修复

### 文件引用
- 修复 `RefTag` 组件 prop 名 `ref` 被 React 当 ref 转发消费导致 undefined 崩溃（改名 `refItem`）

### 关于页面
- 修复说明文档 tab 一直"加载中"+ 预览区闪烁（useEffect 依赖数组误放 i18n `t` 引用导致循环触发）
- 修复 `sync_bundled_docs` 版本参数类型不匹配（`semver::Version` → `String`）

### 构建
- 修复 `ActiveSession.tsx` 未使用变量 `ch` 导致 tsc 构建失败

### 服务端
- 修复 `addMessage` 首条消息标题自动设置 bug（先判断再追加，避免刚追加的被算入）
- 修复 `formatCompactSummary` 多个 `<analysis>` 块未全部剥离
- 修复 `compactService` 重写时 `GenericMessage` 自引用 + 常量丢失

---

## 技术变更

### 服务端
- `sessionService` 完全重写：目录结构 + manifest + 按天读写 + memory.md
- 新增 `GET /api/sessions/:id/messages?date=YYYY-MM-DD` 按天分页端点
- 新增 `sessionService.migrateAllLegacySessions()` 批量迁移接口
- `compactService` 新增 `compactByDays()` 按天持久化压缩
- `llmStreamService` 在 `streamChat` 入口触发按天压缩，压缩后重读上下文
- `/api/info` 响应新增 `docsDir` 字段（`~/.spaceai/doc/` 优先，dev fallback 到项目 doc）
- `SessionService` / `SettingService` configDir 改为动态读取 env，便于测试隔离

### 桌面端（Tauri + Rust）
- `tauri.conf.json` bundle.resources 追加 `doc/` 目录打包
- `lib.rs` 新增 `sync_bundled_docs()`，启动时同步 doc 到 `~/.spaceai/doc/`（版本标记去重 + 陈旧文件清理）

### 前端
- `sessionsApi` 新增 `getMessagesByDay()` 按天分页客户端
- `PerSessionChatState` 增加 `loadedDays` / `loadedDaySet` / `hasMoreHistory` / `loadingHistory`
- `chatStore` 新增 `loadOlderDay()`，`loadHistory` 改为加载最新一天
- `ActiveSession` 监听滚动到顶触发加载前一天，prepend 后保持视觉位置
- `filesystemApi` 新增 `exists()` 轻量存在性检查
- `CodeEditor` 朗读模式从 `readingMode: boolean` 改为 `readingFile: string | null`（绑定文件路径）

---

## 提交记录

共 20+ 次提交，主要提交：

| Commit | 描述 |
|--------|------|
| 82ba275 | chore: bump 版本号至 1.3.0 |
| 8a82325 | feat(session): 重构会话存储为按天 jsonl + manifest + memory.md 压缩 |
| 06a56b5 | test(server): 新增 server/agent 单元测试套件 + pre-commit hook |
| 4a4eaf1 | feat(session): 新增会话记录批量迁移脚本 |
| 2ab45dd | feat(chat): 文件引用tag源文件不存在时禁用点击并显示警告图标 |
| d723d7e | fix(chat): RefTag prop 名 ref 改为 refItem |
| 3ea4f28 | docs: 新增 desktop 客户端使用手册 MANUAL.MD |
| 15f8283 | feat(about): 关于页面下方区域改为 Tab 切换（功能介绍 + 说明文档） |
| 04514e4 | feat(bundle): Tauri 打包 doc 目录，安装时同步到 ~/.spaceai/doc/ |
| fbb2738 | fix(about): 说明文档 tab 一直加载中 + 预览区闪烁 |
| 89a1daa | fix(bundle): sync_bundled_docs 版本参数类型不匹配 |
| 62a73f4 | feat(about): 联系作者二维码移到页面顶部右侧 |
| 150abf2 | feat(about): 联系作者二维码 float 布局，App identity + Description 上移 |
| 03841f5 | feat(about): 功能介绍与说明文档 tab 高度一致 |
| 495f516 | feat(editor): 朗读模式支持切换文件继续播放，同一时间仅一个 MD 朗读 |
| c01e359 | fix(build): ActiveSession.tsx 移除未使用变量 ch 修复构建 |
