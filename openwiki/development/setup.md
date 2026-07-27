---
type: Guide
title: 开发环境搭建
description: Smart Space 项目的开发环境搭建指南，包括依赖安装、配置和开发流程
tags: [开发, 环境, 搭建]
---

# 开发环境搭建

本文档指导您搭建 Smart Space 项目的开发环境，包括依赖安装、配置和开发流程。

## 系统要求

### 操作系统

| 平台 | 最低版本 | 推荐版本 |
|------|----------|----------|
| Windows | Windows 10 | Windows 11 |
| macOS | macOS 10.15 | macOS 12+ |
| Linux | Ubuntu 20.04 | Ubuntu 22.04 |

### 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | 18+ | JavaScript 运行时 |
| npm | 9+ | 包管理器 |
| Rust | 1.70+ | Tauri 编译 |
| Bun | 1.2+ | AI 代理运行时 |
| Git | 2.30+ | 版本控制 |

## 环境准备

### 1. 安装 Node.js

```bash
# Windows (使用 Chocolatey)
choco install nodejs

# macOS (使用 Homebrew)
brew install node

# Linux (使用 apt)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version
npm --version
```

### 2. 安装 Rust

```bash
# Windows
# 下载并安装 rustup-init.exe from https://rustup.rs

# macOS/Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 验证安装
rustc --version
cargo --version
```

### 3. 安装 Bun

```bash
# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# 验证安装
bun --version
```

### 4. 安装 Git

```bash
# Windows
choco install git

# macOS
brew install git

# Linux
sudo apt-get install git

# 验证安装
git --version
```

## 项目克隆

```bash
# 克隆项目
git clone <repository-url>
cd smart-space

# 查看项目结构
ls -la
```

## 依赖安装

### 1. 安装根目录依赖

```bash
# 在项目根目录
npm install
```

### 2. 安装各工作区依赖

```bash
# 安装桌面端依赖
cd desktop
npm install

# 安装服务端依赖
cd ../server
npm install

# 安装 AI 代理依赖
cd agent
bun install
```

### 3. 验证依赖安装

```bash
# 返回项目根目录
cd ../..

# 检查依赖树
npm ls --depth=0
```

## 开发配置

### 1. 环境变量配置

创建 `.env` 文件（可选）：

```bash
# 服务端配置
PORT=3721
HOST=127.0.0.1

# AI 服务商配置（在应用设置中配置）
# OPENAI_API_KEY=your_openai_key
# ANTHROPIC_API_KEY=your_anthropic_key
# DEEPSEEK_API_KEY=your_deepseek_key
```

### 2. 开发工具配置

#### VS Code 配置

创建 `.vscode/settings.json`：

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "files.associations": {
    "*.tsx": "typescriptreact",
    "*.ts": "typescript"
  }
}
```

#### VS Code 扩展推荐

创建 `.vscode/extensions.json`：

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "rust-lang.rust-analyzer",
    "tauri-apps.tauri-vscode"
  ]
}
```

## 开发流程

### 1. 启动开发服务器

#### 方式一：分别启动

```bash
# 终端1：启动服务端
npm run dev:server

# 终端2：启动桌面端
npm run dev
```

#### 方式二：一键启动

```bash
# 启动所有服务
npm run dev
```

### 2. 开发模式特性

- **热重载**: 前端代码修改后自动刷新
- **TypeScript**: 实时类型检查
- **错误提示**: 编译错误在浏览器中显示
- **源码映射**: 支持调试原始 TypeScript 代码

### 3. 开发端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Vite 开发服务器 | 1420 | 前端开发服务器 |
| Express 服务器 | 3721 | 后端 API 服务 |
| WebSocket | 3721 | 实时通信（与 Express 共享端口） |

## 项目结构

```
smart-space/
├── desktop/                    # 客户端
│   ├── src/                   # React 源码
│   │   ├── api/              # API 客户端
│   │   ├── components/       # UI 组件
│   │   ├── pages/            # 页面组件
│   │   ├── stores/           # 状态管理
│   │   └── i18n/             # 国际化
│   ├── src-tauri/            # Tauri Rust 代码
│   │   ├── src/              # Rust 源码
│   │   ├── icons/            # 应用图标
│   │   └── capabilities/     # 权限配置
│   ├── package.json
│   └── vite.config.ts
├── server/                     # 服务端
│   ├── src/                   # Express 服务器
│   └── agent/                 # AI 代理服务
│       ├── api/              # API 路由
│       ├── services/         # 业务逻辑
│       ├── tools/            # AI 工具
│       └── ws/               # WebSocket
├── skills/                     # 技能系统
├── package.json               # Monorepo 配置
└── README.md
```

## 开发脚本

### 根目录脚本

```bash
# 开发
npm run dev              # 启动桌面端开发
npm run dev:server       # 启动服务端开发
npm run dev:agent        # 启动 AI 代理开发

# 构建
npm run build:server     # 构建服务端
npm run build:agent      # 构建 AI 代理
npm run build:desktop    # 构建桌面端
npm run build:all        # 构建所有
```

### 桌面端脚本

```bash
cd desktop

# 开发
npm run dev              # 启动 Vite 开发服务器
npm run tauri:dev        # 启动 Tauri 开发模式

# 构建
npm run build            # 构建前端
npm run build:full       # 构建完整应用（包含服务端）
npm run tauri            # Tauri CLI 命令
```

### 服务端脚本

```bash
cd server

# 开发
npm run dev              # 启动开发服务器（热重载）

# 构建
npm run build            # 构建生产版本
npm run start            # 启动生产服务器
```

### AI 代理脚本

```bash
cd server/agent

# 开发
bun run dev              # 启动开发服务器

# 构建
bun run build            # 构建可执行文件
bun run build:windows    # 构建 Windows 版本
```

## 调试技巧

### 1. 前端调试

```bash
# 启动开发服务器
npm run dev

# 在浏览器中打开开发者工具
# - Elements: 检查 HTML/CSS
# - Console: 查看日志
# - Sources: 调试 TypeScript
# - Network: 监控 API 请求
```

### 2. 后端调试

```bash
# 启动服务端（带调试信息）
DEBUG=* npm run dev:server

# 或者使用 Node.js 调试器
node --inspect dist/server.js
```

### 3. Tauri 调试

```bash
# 启动 Tauri 开发模式
cd desktop
npm run tauri:dev

# 查看 Rust 日志
RUST_LOG=debug npm run tauri:dev
```

### 4. WebSocket 调试

```bash
# 使用 wscat 测试 WebSocket
npm install -g wscat
wscat -c ws://localhost:3721/ws/test-session

# 发送消息
> {"type":"user_message","content":"Hello"}
```

## 常见问题

### Q: npm install 失败

```bash
# 清除缓存
npm cache clean --force

# 删除 node_modules 重新安装
rm -rf node_modules
rm package-lock.json
npm install
```

### Q: Rust 编译失败

```bash
# 更新 Rust
rustup update

# 清除构建缓存
cargo clean

# 重新编译
cargo build
```

### Q: Bun 安装失败

```bash
# 使用 npm 安装 Bun
npm install -g bun

# 或者使用官方安装脚本
curl -fsSL https://bun.sh/install | bash
```

### Q: 端口被占用

```bash
# Windows
netstat -ano | findstr :3721
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :3721
kill -9 <PID>
```

### Q: TypeScript 类型错误

```bash
# 检查 TypeScript 配置
npx tsc --noEmit

# 重新生成类型
npm run build
```

## 开发规范

### 代码风格

- 使用 TypeScript 进行类型安全开发
- 遵循 ESLint 规则
- 使用 Prettier 格式化代码
- 中文注释和用户界面文本

### Git 提交规范

```bash
# 提交格式
<type>(<scope>): <subject>

# 示例
feat(chat): 添加消息撤回功能
fix(api): 修复会话创建错误
docs(readme): 更新项目说明
```

### 分支管理

```bash
# 主分支
main                    # 生产分支
develop                 # 开发分支

# 功能分支
feature/chat-undo       # 功能分支
bugfix/api-error        # 修复分支
hotfix/critical-fix     # 紧急修复
```

## 测试

### 单元测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- --grep "Chat"

# 生成覆盖率报告
npm run test:coverage
```

### 集成测试

```bash
# 启动测试环境
npm run test:setup

# 运行集成测试
npm run test:integration
```

### 端到端测试

```bash
# 启动应用
npm run dev

# 运行 E2E 测试
npm run test:e2e
```

## 部署测试

### 本地构建测试

```bash
# 构建生产版本
npm run build:all

# 测试生产版本
cd desktop
npx tauri build
```

### 打包测试

```bash
# Windows
cd desktop
npx tauri build --target nsis

# macOS
npx tauri build --target dmg

# Linux
npx tauri build --target appimage
```

## 相关文档

- [快速入门](../quickstart.md) - 项目概述
- [架构概述](../architecture/overview.md) - 系统架构
- [技术栈](../tech-stack/overview.md) - 技术栈列表
- [API 文档](../api/overview.md) - API 接口说明

---

**下一步**: 了解 [API 文档](../api/overview.md) 的详细接口，或查看 [架构概述](../architecture/overview.md) 了解系统设计。