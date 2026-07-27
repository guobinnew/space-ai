---
type: Architecture
title: Smart Space 架构概述
description: Smart Space 桌面应用的整体架构设计，包括前端、桌面壳、服务端和 AI 代理的详细设计
tags: [架构, 设计, 系统设计]
---

# Smart Space 架构概述

本文档详细描述 Smart Space 桌面 AI 助手的整体架构设计，包括各层组件、通信模式和数据流。

## 架构概览

Smart Space 采用分层架构，由四个主要层组成：

```mermaid
graph TB
    subgraph "表现层"
        A[React 前端] --> B[UI 组件]
        A --> C[状态管理]
        A --> D[API 客户端]
    end
    
    subgraph "桌面层"
        E[Tauri v2] --> F[窗口管理]
        E --> G[进程管理]
        E --> H[原生插件]
    end
    
    subgraph "服务层"
        I[Express HTTP] --> J[REST API]
        K[WebSocket] --> L[实时通信]
        I --> M[中间件]
    end
    
    subgraph "代理层"
        N[AI 代理服务] --> O[工具系统]
        N --> P[LLM 集成]
        N --> Q[会话管理]
    end
    
    A -->|REST API| I
    A -->|WebSocket| K
    G -->|启动子进程| I
    I --> N
    K --> N
    N --> R[本地存储]
    N --> S[外部 AI API]
```

## 前端架构

### 技术栈
- **React 18**: 用户界面库
- **TypeScript**: 类型安全开发
- **Vite**: 构建工具和开发服务器
- **Tailwind CSS**: 实用优先的 CSS 框架

### 组件组织

```
desktop/src/
├── api/                    # API 客户端模块
│   ├── client.ts          # 基础 HTTP 客户端
│   ├── sessions.ts        # 会话 API
│   ├── providers.ts       # 服务商 API
│   └── usage.ts           # 用量统计 API
├── components/            # UI 组件
│   ├── chat/             # 聊天相关组件
│   ├── editor/           # 编辑器组件
│   ├── layout/           # 布局组件
│   ├── settings/         # 设置组件
│   └── shared/           # 共享组件
├── pages/                # 页面组件
│   ├── HomePage.tsx      # 首页
│   ├── ActiveSession.tsx # 活跃会话
│   ├── SettingsPage.tsx  # 设置页
│   └── UsageStatsPage.tsx # 用量统计
├── stores/               # 状态管理
│   ├── uiStore.tsx       # UI 状态
│   ├── sessionStore.tsx  # 会话状态
│   └── chatStore.tsx     # 聊天状态
└── i18n/                 # 国际化
```

### 状态管理

使用 React Context + Hooks 模式，而非 Redux 或 Zustand：

```typescript
// 示例：UI 状态管理
const UIContext = createContext<UIState | null>(null)

export function UIProvider({ children }) {
  const [state, setState] = useState(initialState)
  // ... 状态逻辑
  return (
    <UIContext.Provider value={{ state, setState }}>
      {children}
    </UIContext.Provider>
  )
}
```

### 路由系统

采用自定义标签页导航，而非 React Router：

```mermaid
stateDiagram-v2
    [*] --> Home: 默认
    Home --> Session: 点击会话
    Session --> Session: 切换会话
    Session --> Settings: 点击设置
    Session --> Stats: 点击统计
    Settings --> Session: 返回
    Stats --> Session: 返回
```

## 桌面层架构

### Tauri v2 集成

Tauri 作为桌面应用壳，提供以下功能：

1. **窗口管理**
   - 无边框窗口设计
   - 自定义窗口控件（最小化、最大化、关闭）
   - 窗口状态持久化

2. **进程管理**
   - 启动和管理 Bun 服务端子进程
   - 进程生命周期管理
   - 优雅关闭处理

3. **原生插件**
   - `@tauri-apps/plugin-dialog`: 文件对话框
   - `@tauri-apps/plugin-notification`: 系统通知
   - `@tauri-apps/plugin-shell`: 命令执行
   - `@tauri-apps/plugin-opener`: 外部链接打开

### 启动流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant T as Tauri
    participant R as Rust
    participant B as Bun 服务
    participant F as React 前端
    
    U->>T: 启动应用
    T->>R: 初始化 Rust 后端
    R->>R: 检查端口可用性
    R->>B: 启动 Bun 子进程
    B->>B: 初始化 Express 服务
    B->>B: 写入端口文件 ~/.spaceai/server.port
    R->>F: 加载 React 应用
    F->>F: 读取端口文件
    F->>B: 建立 WebSocket 连接
    F->>U: 显示主界面
```

## 服务层架构

### Express HTTP 服务

服务端使用 Express 构建 REST API：

```typescript
// 服务入口
const app = express()
app.use(cors())
app.use(express.json())

// API 路由
app.use('/api/status', statusRouter)
app.use('/api/sessions', sessionRouter)
app.use('/api/providers', providerRouter)
// ... 更多路由
```

### WebSocket 服务

WebSocket 用于实时通信，支持多个通道：

```mermaid
graph LR
    A[前端] -->|连接| B[WebSocket 服务器]
    B --> C[UI 通道 /ws/{sessionId}]
    B --> D[SDK 通道 /sdk/{sessionId}]
    B --> E[语音通道 /ws/stt]
    
    C --> F[聊天消息]
    C --> G[工具执行]
    C --> H[状态更新]
    
    D --> I[外部 SDK]
    E --> J[语音输入]
```

### 中间件栈

```mermaid
graph TB
    A[请求] --> B[CORS 中间件]
    B --> C[JSON 解析]
    C --> D[认证中间件]
    D --> E[路由处理]
    E --> F[响应]
    
    D -->|非本地请求| G[Bearer Token 验证]
    D -->|本地请求| H[跳过验证]
```

## 代理层架构

### AI 代理服务

AI 代理是系统的核心，负责：

1. **LLM 集成**: 统一接口支持多种 AI 服务商
2. **工具执行**: 调用各种工具完成任务
3. **会话管理**: 维护对话状态和历史
4. **流式处理**: 实时处理 AI 响应

### 工具系统

```mermaid
graph TB
    A[AI 代理] --> B[工具注册表]
    B --> C[文件操作工具]
    B --> D[命令执行工具]
    B --> E[任务管理工具]
    B --> F[Web 工具]
    B --> G[用户交互工具]
    
    C --> C1[读取文件]
    C --> C2[写入文件]
    C --> C3[列出目录]
    
    D --> D1[Bash 命令]
    D --> D2[PowerShell]
    
    E --> E1[创建任务]
    E --> E2[更新任务]
    E --> E3[查询任务]
    
    F --> F1[Web 搜索]
    F --> F2[URL 抓取]
    
    G --> G1[询问用户]
    G --> G2[显示消息]
```

### LLM 集成

支持两种 API 格式：

```mermaid
graph LR
    A[AI 代理] --> B{API 格式}
    B -->|Anthropic| C[Claude API]
    B -->|OpenAI| D[OpenAI 兼容 API]
    
    C --> E[消息格式转换]
    D --> E
    E --> F[统一处理]
    F --> G[流式响应]
```

### 会话管理

会话数据以 JSONL 格式存储：

```mermaid
erDiagram
    SESSION ||--o{ MESSAGE : contains
    SESSION {
        string id
        string title
        datetime created_at
        string work_mode
    }
    MESSAGE {
        string id
        string role
        string content
        datetime timestamp
        json tool_calls
    }
    SESSION ||--o{ TOOL_RESULT : has
    TOOL_RESULT {
        string id
        string tool_name
        json input
        string output
        datetime timestamp
    }
```

## 数据流

### 用户输入到 AI 响应

```mermaid
sequenceDiagram
    participant U as 用户
    participant F as 前端
    participant W as WebSocket
    participant A as AI 代理
    participant L as LLM 服务
    participant T as 工具系统
    
    U->>F: 输入消息
    F->>W: 发送用户消息
    W->>A: 转发消息
    A->>L: 调用 LLM
    L-->>A: 流式响应
    A-->>W: 流式内容
    W-->>F: 实时更新
    F-->>U: 显示响应
    
    A->>A: 检测工具调用
    A->>T: 执行工具
    T-->>A: 工具结果
    A->>L: 继续对话
    L-->>A: 最终响应
    A-->>W: 完成信号
    W-->>F: 更新界面
```

## 安全考虑

### 认证机制

```mermaid
graph TB
    A[请求] --> B{来源检查}
    B -->|本地请求| C[允许访问]
    B -->|远程请求| D{Token 验证}
    D -->|有效 Token| E[允许访问]
    D -->|无效 Token| F[拒绝访问]
```

### 文件系统访问

- 限制在用户主目录和 `/tmp` 目录
- 路径遍历检查
- 敏感文件保护

### 命令执行安全

- 平台特定命令（Windows: PowerShell, Unix: bash）
- 命令白名单/黑名单
- 执行超时控制

## 性能优化

### 前端优化

1. **代码分割**: 按页面和组件分割代码
2. **懒加载**: 延迟加载非关键组件
3. **虚拟滚动**: 长列表优化
4. **缓存策略**: API 响应缓存

### 后端优化

1. **流式处理**: 减少内存占用
2. **连接池**: 数据库连接复用
3. **异步处理**: 非阻塞操作
4. **资源限制**: 防止资源耗尽

## 扩展性设计

### 插件系统

```mermaid
graph TB
    A[核心系统] --> B[插件接口]
    B --> C[技能插件]
    B --> D[工具插件]
    B --> E[服务商插件]
    
    C --> C1[Mermaid 图表]
    C --> C2[OpenWiki]
    
    D --> D1[文件操作]
    D --> D2[命令执行]
    
    E --> E1[DeepSeek]
    E --> E2[GLM]
```

### 配置扩展

- 环境变量配置
- 配置文件热重载
- 动态配置更新

## 监控和日志

### 日志系统

```mermaid
graph LR
    A[应用日志] --> B[控制台输出]
    A --> C[文件日志]
    A --> D[错误报告]
    
    B --> E[开发环境]
    C --> F[生产环境]
    D --> G[错误监控]
```

### 性能监控

- 请求响应时间
- 内存使用情况
- CPU 使用率
- 网络延迟

## 相关文档

- [前端架构](frontend.md) - 详细的前端设计
- [服务端架构](server.md) - 服务端详细设计
- [AI 代理架构](agent.md) - AI 代理系统设计
- [技术栈](../tech-stack/overview.md) - 完整技术栈列表

---

**下一步**: 了解 [前端架构](frontend.md) 的详细设计，或查看 [技术栈](../tech-stack/overview.md) 了解使用的技术。