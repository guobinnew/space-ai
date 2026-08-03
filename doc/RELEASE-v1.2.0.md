# Release v1.2.0

**发布日期**: 2026-07-30  
**版本**: v1.2.0  
**合并提交**: 6fb48bc  

---

## 新功能

### 模型服务商下拉选择
- ChatInput 底部工具栏新增模型服务商下拉选择组件
- 支持加载所有已配置的服务商，显示模型名称
- 正在生成时锁定切换（不影响当前运行的 query）
- 发送消息时携带选中的 providerId
- 排队中的 query 也保留当时的 providerId
- 设置页面的"激活"改为"设为默认"，会话优先使用默认服务商

### 会话消息查找
- 工具栏新增查找按钮（搜索图标）
- 点击进入查找模式，整个底部区域被查找页面覆盖
- 顶部关键词输入框 + 搜索选项切换（大小写 `Aa` / 全字 `ab` / 正则 `.*`）
- 下方实时显示匹配结果列表（角色标签 + 上下文摘要 + 序号）
- 点击结果项退出查找模式，平滑滚动到对应消息位置
- 退出查找模式时保存搜索状态（关键词和选项），重新进入时恢复

### 技能详情页
- 严格复刻 smart-code 的技能详情页
- 文件树（左侧 240px，目录展开/折叠，文件选中高亮）
- 文件预览（右侧，Markdown 用渲染器，代码用 CodeViewer）
- 新增 `CodeViewer` 组件（行号 + 复制按钮）
- 列表视图：统计卡片（总数/来源/token）+ 可点击技能列表

### 首页增强
- 首页定时任务状态实时刷新（10 秒轮询）
- 首页新增：定时任务摘要、今日用量统计、快捷操作
- 首页布局自适应，宽度铺满窗口

### 关于页面增强
- 根据 openwiki 文档，丰富关于页面内容
- 展示功能特性、架构分层、技术栈、服务商列表

### 其他功能
- 安装包打包功能（Windows NSIS / macOS DMG）
- 应用图标改为圆角样式
- 用户消息气泡改为类似微信的绿色
- 设置页面布局自适应，宽度铺满窗口
- 外观/语言切换按钮设置最大宽度

---

## 优化

### 滚动体验优化
- MessageList 用 `requestAnimationFrame` 调度所有 scrollTo
- 新消息使用 `behavior: 'smooth'` 平滑滚动
- 消息项添加 `contain: layout paint` 隔离布局
- 滚动容器添加 `will-change: transform` GPU 合成层
- React.memo 包裹 AssistantMessage / UserMessage / ToolCallBlock
- MarkdownRenderer 的 `enhanceHtml` 移到 `useMemo` 缓存
- MarkdownRenderer 样式改为模块级注入只执行一次

---

## Bug 修复

### 国际化
- 修复 `localeTag()` 运行时 TypeError（改从 DOM `data-locale` 读取）
- 修复首页/用量统计/定时任务/设置 tab 标题不随语言切换更新
- 修复定时任务频率标签文字不随语言切换
- 移除重复的 i18n 键 `session.messageCount` 和 `session.newTitle`
- 补全所有页面与组件缺失的国际化文案

### 服务商 / TTS
- 修复 TTS 检查仍使用旧的 `activeId` 字段（3 处改为 `defaultId`）
- 修复服务商下拉菜单被 `overflow-hidden` 裁剪显示不全（改用 Portal）
- 修复技能名称含冒号时 404（URL 解码 + `findSkillDir` 扫描匹配）

### 会话 / 任务
- 修复无未完成任务仍显示"继续执行"提示（`showContinuePrompt` 条件丢失）
- 修复 `hasPending` 误判（`in_progress` 任务重置为 `pending`）
- 移除会话页面顶部工具栏的关闭按钮

### 技能详情
- 修复技能详情页 `detail.meta` 为 undefined 崩溃
- 修复技能名称含冒号导致 404（`decodeURIComponent` + 目录名匹配）
- 修复技能文件清单始终为空（服务端未重启 + 编译二进制优先级问题）

### 其他修复
- 修复 NewTaskModal 标题随内容滚动（改为固定在顶部）
- 修复应用退出时 npm error Lifecycle script `dev` failed
- 移除 CodeViewer 未使用的导入

---

## 技术变更

### 服务端
- `providers.json` 字段 `activeId` → `defaultId`（兼容旧数据自动迁移）
- `providerService.activateProvider` → `setDefaultProvider`
- `streamChat` 接受可选 `providerId`，优先使用指定 provider
- `conversationService.sendMessage` 透传 `providerId`
- WebSocket `user_message` 消息支持 `providerId` 字段
- 新增 `resetStaleInProgressTasks` 重置会话重开时的 `in_progress` 任务
- 新增 `GET /api/providers/default` 和 `POST /api/providers/:id/set-default` 端点
- 新增 `GET /api/skills/:name/detail` 和 `GET /api/skills/:name/file` 端点
- 新增 `POST /api/tasks/:sessionId/reset-stale` 端点

### 前端
- `providersApi`: `activate` → `setDefault`，新增 `getDefault`
- `skillsApi`: 新增 `detail` / `file` API
- `tasksApi`: 新增 `resetStale` API
- `QueuedQuery` 类型新增 `providerId` 字段
- `MessageList` 每条消息添加 `data-msg-id` 属性用于查找定位

---

## 提交记录

共 40+ 次提交，主要提交：

| Commit | 描述 |
|--------|------|
| 6fb48bc | Merge dev: 模型服务商下拉 + 会话查找 + 滚动优化 + 图标圆角 + TTS修复 |
| cf4c36a | feat(provider): 模型服务商下拉选择 + 激活改为设置默认 |
| d0e9a31 | feat(session): 会话消息查找功能 |
| dceb73f | feat(search): 消息查找增加大小写/全字/正则切换 |
| 8b32c78 | feat(skills): 严格复刻 smart-code 技能详情页 |
| 6524f0d | style(icon): 应用图标改为圆角样式 |
| 012559b | perf(chat): 优化鼠标滚轮滚动卡顿 |
| 8b239b0 | perf(chat): 优化会话消息列表滚动体验 |
| 6ab0ec3 | fix(tts): 修复 TTS 检查仍使用旧的 activeId 字段 |
| fe8ee9c | fix(home): 定时任务状态实时刷新 |
| 6bed74e | fix(tauri): 应用退出时 npm error Lifecycle script dev failed |
