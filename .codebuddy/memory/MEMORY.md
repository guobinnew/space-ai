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
