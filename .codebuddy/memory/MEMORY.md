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
- 入口: `sidecar.ts server --app-root <path> --host --port`（参照 smart-code smart-sidecar.ts）
- desktop lib.rs: dev 用 `bun run sidecar.ts`，生产用 `bun build --compile` 编译的二进制
- tauri.conf.json resources: `../../server/dist/agent/` → `agent/`
- 端口 3721；API: /api/health、/api/info、/api/status、/api/sessions(桩)、/ws/* WebSocket
- bun 通过 npm 全局安装(shim: bun.cmd)，Start-Process 需用 bun.cmd 全路径
