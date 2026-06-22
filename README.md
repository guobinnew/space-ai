# Smart Space

桌面应用，采用 Tauri + React + Vite 作为客户端，内嵌 Node.js 服务端。

## 项目结构

```
smart-space/
├── desktop/              # 客户端 (Vite + React + Tauri v2)
│   ├── src/              # React 前端源码
│   ├── src-tauri/        # Tauri Rust 后端
│   │   ├── src/          # Rust 源码 (lib.rs 负责启动服务子进程)
│   │   ├── icons/        # 应用图标
│   │   └── capabilities/ # Tauri 权限配置
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── server/               # 服务端 (TypeScript + Node.js + Express)
│   ├── src/
│   │   └── index.ts      # Express 服务入口
│   ├── dist/             # 构建产物 (esbuild 打包)
│   └── package.json
└── package.json          # Monorepo 根配置 (npm workspaces)
```

## 开发

```bash
# 安装依赖
npm install

# 启动服务端 (热重载)
npm run dev:server

# 启动桌面端 (Tauri dev 模式，自动启动前端 + 服务端子进程)
npm run dev
```

## 构建

```bash
# 构建服务端
npm run build:server

# 构建桌面端 (自动先构建服务端)
npm run build:desktop

# 一键构建
npm run build:all
```

## 打包

Tauri 打包时会将 `server/dist/server.js` 作为 resource 嵌入应用。
客户端启动时，Rust 后端自动以子进程方式启动内嵌的 Node.js 服务，
应用关闭时自动终止服务进程。

```bash
cd desktop
npx tauri build
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite |
| 桌面壳 | Tauri v2 (Rust) |
| 服务端 | Express + TypeScript + esbuild |
| 包管理 | npm workspaces |
