# TestPilot — AI 测试用例生成器

> 粘贴需求文档，30 秒生成覆盖功能、边界、异常的完整测试用例

![TestPilot 效果演示](public/demo.png)

## 为什么需要它

一个中等复杂度的功能，QA 通常要花**一整天**手写 50–100 条测试用例，质量高度依赖个人经验。TestPilot 把「从 0 到草稿」压缩到秒级——AI 负责覆盖广度，你负责评审和精调。

## ✨ 核心功能

| # | 能力 | 说明 |
|---|---|---|
| 1 | **需求秒变用例** | 粘贴 PRD 或需求描述（最多 10,000 字），AI 自动生成结构化测试用例（编号、标题、前置条件、步骤、预期结果、优先级、类型） |
| 2 | **模糊点检测** | AI 自动标注需求中的歧义或矛盾，并给出建议向产品经理提问的问题 |
| 3 | **行内编辑** | 生成后可在表格中直接修改标题、步骤、预期结果、优先级、类型 |
| 4 | **Excel 导出** | 一键复制格式化文本，或下载带粗体表头的 `.xlsx` 文件 |
| 5 | **优先级自检** | 后端校验 P0–P4 分布是否符合预期比例，偏差时自动重新生成 |
| 6 | **模型无关** | 基于 OpenAI SDK 标准协议，改一行环境变量即可在 DeepSeek、GPT、Claude、Qwen 间切换 |

## 快速开始

```bash
git clone https://github.com/huangdashuo99-dev/caseforge.git
cd caseforge
npm install
```

创建 `.env.local`：

```env
# 必填 — AI 提供商配置（文本模型）
AI_API_KEY=your-api-key
AI_BASE_URL=https://api.deepseek.com/v1
AI_MODEL=deepseek-chat

# 可选 — 主模型失败时自动切换备用模型
AI_FALLBACK_API_KEY=your-fallback-key
AI_FALLBACK_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_FALLBACK_MODEL=qwen-plus
```

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，粘贴需求，点击「生成用例」。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `AI_API_KEY` | 是 | AI 服务商的 API Key |
| `AI_BASE_URL` | 否 | API 地址（默认 DeepSeek） |
| `AI_MODEL` | 否 | 模型名称（默认 `deepseek-chat`） |
| `AI_FALLBACK_API_KEY` | 否 | 备用模型 API Key（主模型失败时自动切换） |
| `AI_FALLBACK_BASE_URL` | 否 | 备用模型 API 地址 |
| `AI_FALLBACK_MODEL` | 否 | 备用模型名称 |

主模型失败时，系统会自动尝试备用模型（如果已配置），无需用户感知。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| 语言 | TypeScript |
| AI SDK | OpenAI SDK v6（兼容所有 OpenAI 格式 API） |
| 导出 | exceljs |
| 单元测试 | Vitest + Testing Library |
| E2E 测试 | Playwright |
| 部署 | Vercel |

## 项目结构

```
├── app/
│   ├── page.tsx                  # 主页面（输入、生成、编辑、导出）
│   ├── layout.tsx                # 根布局
│   ├── globals.css               # 全局样式
│   └── api/generate/route.ts     # POST /api/generate
├── lib/
│   ├── ai-provider.ts            # AI 调用层（重试 + 备用链 + 优先级校验）
│   ├── json-parser.ts            # JSON 解析（容错 + 校验 + 规范化）
│   └── rate-limit.ts             # 频率限制（MVP 桩，可替换为 Vercel KV）
├── prompts/
│   └── test-case-generator.md    # 系统提示词
├── eval/
│   └── requirements.json         # 5 个标准评估需求样例
├── test/                         # 单元测试
├── e2e/                          # E2E 测试
└── public/                       # 静态资源
```

## 脚本

```bash
npm run dev        # 启动开发服务器
npm run build      # 生产构建
npm run start      # 启动生产服务
npm test           # 运行单元测试
npm run test:e2e   # 运行 E2E 测试
npm run lint       # 代码检查
```

## 工作原理

1. 用户在页面输入需求文本
2. 前端 POST 到 `/api/generate`，附带文本
3. 服务端调用 AI 模型，使用精心调校的系统提示词生成结构化 JSON
4. JSON 经容错解析器处理（去除 markdown 标记、修复尾部逗号、校验 schema）
5. 校验优先级分布（P0~P4 符合预设比例），不达标自动重试
6. 返回结果在前端渲染为可编辑表格，支持复制和 Excel 导出

## License

MIT
