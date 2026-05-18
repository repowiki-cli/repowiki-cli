# repowiki-cli

> 面向大型多仓库项目的 AI-Native 工程工具链。
> 解决上下文爆炸问题，构建项目级 AI 记忆，让 AI 辅助开发真正规模化。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Status: Alpha](https://img.shields.io/badge/Status-Alpha-orange.svg)]()

> **注意：** v0.1.1 已发布。`wiki:generate`、`wiki:validate` 和 `wiki:update` 已全面可用。第二层和第三层正在开发中。

---

## 安装

```bash
npm install -g repowiki-cli
```

**前置要求：**
- Node.js 20 或更高版本
- 以下任一：OpenAI API key / Anthropic API key / Azure OpenAI / DashScope API key / DeepSeek API key / 本地运行的 [Ollama](https://ollama.ai)

## 快速上手

```bash
# 生成 wiki（DashScope / 通义千问）
repowiki wiki:generate --provider=dashscope --harness=claude-code

# 生成 wiki（Anthropic）
repowiki wiki:generate --provider=anthropic --harness=claude-code

# 生成 wiki（Azure OpenAI，--model 指定部署名称）
repowiki wiki:generate --provider=azure --model=my-gpt4o-deployment

# 仅对已变更的文件做增量更新
repowiki wiki:update --provider=dashscope

# 验证 wiki 与代码库是否同步
repowiki wiki:validate

# 预览模式（不调用 LLM，不写入文件）
repowiki wiki:generate --provider=dashscope --dry-run
```

API Key 可通过环境变量或项目根目录的 `.env` 文件配置。详见 [docs/providers.zh.md](docs/providers.zh.md)。

---

## 问题：为什么大型项目会让 AI 失效

大多数 AI 编码工具在单个文件或小型代码库上表现出色。一旦你扩展到真实世界的产品——多个代码仓库、数以千计的文件、数十个领域边界——这种承诺就会破灭。

三种力量正在对抗你：

**上下文爆炸。** 没有任何 LLM 能将你的整个代码库装入上下文窗口。你最终只能不断复制粘贴代码片段，希望 AI 能猜出缺失的部分。它做不到。

**碎片化。** 你的 8 个代码仓库在 AI 的认知中彼此孤立。认证服务不知道计费模型是什么。前端团队的 AI 从未"见过" API 契约。每次会话都从零开始。

**团队不一致。** 当每个工程师以不同方式提示 AI 时，同一个架构问题会得到不同的答案。AI 产出变得不可预测，评审周期拉长，那个承诺中的 10× 效率提升变成了 1.5×，外加一堆混乱。

根本原因不在于 AI，而在于缺少一份结构化、机器可读的上下文，能够真实反映你的系统是如何运转的。

**Cursor 的代码库索引或 GitHub Copilot Workspace 不是已经解决了这个问题吗？**

现有工具为*搜索*而索引代码。`repowiki-cli` 构建的是*项目级记忆*：版本化、人可读的 wiki 文档，存活在你的代码仓库中，随代码一起流转，兼容任何 AI 工具，并捕捉你架构背后的*原因*——而不仅仅是结果。当你的 AI harness 被下一代工具取代时，你的 wiki 依然存在。当新工程师加入时，他们读的是和 AI 一样的 wiki。

---

## 方法论：AI-Native 工程的三层解法

我们开发了一套构建*项目级 AI 记忆*的方法论——一种结构化、版本化、可查询的代码库表示，任何 AI 工具都能高效消费。

### 第一层 — RepoWiki：分层上下文构建

对于每个代码仓库，`repowiki-cli` 通过分析代码结构、依赖关系和领域边界生成一套层级化的 wiki。它不是把原始代码塞进上下文窗口，而是构建一套分层的 Markdown 摘要文件——按代码库逻辑层级组织（项目概览 → 模块概览 → 组件详情）——让 AI 能够从高层架构按需导航到具体实现细节。

结果：AI 在读到第一行代码之前，就能理解你的系统在做什么。

### 第二层 — Context Router：快速定位 + 细粒度 RAG

wiki 只有能快速找到正确部分才有价值。第二层将生成的 wiki 拆分为可索引、可查询的块，并在其上构建检索层。当 AI 需要了解支付流程的上下文时，它精确检索*相关的* wiki 部分——而不是 20 万个 token 的全部内容。

这一层提供两种检索接口：**路径查询**（确定性——给定模块名或文件路径，返回对应的 wiki 章节）和 **RAG 接口**（语义化——给定自然语言查询，通过向量搜索返回最相关的 wiki 块）。

### 第三层 — SDD/ATDD 生成器：规模化一致性

前两层解决了上下文问题，第三层形成闭环。

`repowiki-cli` 利用已经对你的系统建立的 wiki，生成项目专属的软件设计文档（SDD）和验收测试规范（ATDD 模板）。因为 wiki 捕捉了你的架构和约定，生成的规范与你的实际代码库保持一致——而不是通用的 AI 样板文字。这些成为 AI 辅助特性开发的脚手架，让每个工程师（以及每次 AI 会话）都从同一个起点出发。

结果：AI 产出变得可预测，设计评审更高效，新工程师（或新 AI 会话）的上手时间从几天缩短到几分钟。第一层和第二层是第三层的前提——SDD/ATDD 生成器的质量取决于其所依赖的 wiki。

---

## repowiki-cli：方法论的工具化实现

```
repowiki-cli
├── wiki          # 第一层：RepoWiki 生成
│   ├── generate  # 分析仓库并生成层级化 wiki
│   ├── update    # 仅对变更文件做增量更新
│   └── validate  # 检查 wiki 与代码库的同步状态
├── context       # 第二层：上下文路由
│   ├── index     # 基于 wiki 构建检索索引
│   ├── query     # 通过自然语言或路径查询上下文
│   └── serve     # 将上下文暴露为 MCP 服务
└── spec          # 第三层：SDD/ATDD 生成
    ├── sdd       # 生成软件设计文档
    ├── atdd      # 生成验收测试脚手架
    └── review    # AI 辅助规范评审
```

**核心设计决策：**

- **架构优先。** CLI 围绕扩展点构建——新的 wiki 分析器、输出后端和 harness 适配器无需修改核心代码即可添加。
- **Provider 无关。** 自带 LLM：OpenAI、Anthropic、Google，或通过 Ollama 使用本地模型。一套配置，任意 provider。
- **输出可配置。** wiki 输出默认为随代码版本化的本地 Markdown 文件。通过插件可以切换到向量数据库、对象存储或自定义后端。
- **CI 友好。** 每条命令都支持在 pipeline 中无头运行。
- **规模感知。** 大型仓库的初始 wiki 生成是增量且可恢复的。在对大型代码库发起 LLM API 调用前，可以使用费用估算试运行（`--estimate`）预判成本。

---

## AI Harness 集成

*AI harness* 是指在开发过程中管理 AI 上下文和会话的任何工具——Claude Code、Cursor、Windsurf、Opencode、GitHub Copilot 等。这些工具功能强大，但上下文加载方式比较朴素：当前打开的文件，或者你手动粘贴的内容。

`repowiki-cli` 改变了 harness 所拥有的上下文基础。

wiki 输出被设计为可被任何 harness 的上下文加载机制消费：

- **扁平 Markdown 文件** — 将 `.repowiki/` 放入你的仓库，任何读取项目文件的 harness 都会自动拾取
- **Harness 配置生成** — `repowiki wiki generate --harness=claude-code` 生成针对该 harness 加载行为优化的上下文文件（如 `CLAUDE.md`、`.cursorrules`）。配置生成默认无损：以带标记的块追加到已有文件末尾（原有内容完整保留），并支持 `--dry-run` 在写入前预览输出
- **MCP 服务模式** — `repowiki context serve` 暴露一个 Model Context Protocol 服务，支持 MCP 的 harness 可以动态查询

针对各 harness 的优化预设（调整提示缓存、上下文窗口用量和检索深度）计划随 v0.3 规范生成层一同推出。

| Harness | 扁平文件 | 配置生成 | MCP |
|---|---|---|---|
| Claude Code | v0.1 | v0.1 | v0.2 |
| Cursor | v0.1 | v0.1 | v0.3 |
| Windsurf | v0.1 | v0.1 | v0.3 |
| Opencode | v0.1 | v0.3 | v0.3 |
| GitHub Copilot | v0.1 | v0.3 | N/A¹ |
| 其他 | v0.1 | — | — |

¹ GitHub Copilot 目前不支持 MCP，此项将随生态演进重新评估。

---

## 扩展性

`repowiki-cli` 围绕三个扩展点构建：

**LLM Providers** — 核心流水线与 LLM 无关。内置适配器支持：OpenAI、Anthropic、Azure OpenAI、DashScope（通义千问 / 阿里云百炼）、DeepSeek，以及通过 Ollama 使用本地模型。任何兼容 OpenAI 格式的 API 端点也可通过 `--provider=openai-compat:URL` 直接接入。**注意：** wiki 生成默认会将代码发送至所配置的 LLM provider。对于涉及敏感信息或 IP 受限的代码库，建议使用 Ollama 或私有 Azure 端点以确保代码不离开本地环境。详见 [docs/providers.zh.md](docs/providers.zh.md)。

**输出后端** — wiki 输出与生成流水线解耦。默认：本地 Markdown 文件。计划插件（v1.0）：[Qdrant](https://qdrant.tech)（生产级推荐）、[Weaviate](https://weaviate.io)（原生混合搜索）、Chroma（轻量原型）、FAISS（本地嵌入）、pgvector（Postgres 生态）。后端接口规范（读/写/查询契约）将在 v1.0 之前发布，以支持社区后端开发。

**分析器** — 语言特定的代码分析器决定仓库如何被解析为 wiki 结构。分析器基于 [Tree-sitter](https://tree-sitter.github.io) 构建，支持 165+ 语言的增量解析。v0.1 内置：TypeScript/JavaScript；v1.0 扩展：Python、Go、Java。社区分析器实现一套公开接口，将 Tree-sitter AST 节点映射为 wiki 概念——模块边界（包 / 编译单元）、领域边界（业务能力分组）和 API 契约（对外暴露的接口）——该接口规范将在 v1.0 之前发布。

---

## 单元测试

测试文件与源文件就近存放，不另建顶层 `tests/` 目录。每个源文件的测试放在同级 `__tests__/` 目录下，文件名加 `.test` 后缀：

```
repowiki-cli/
├── wiki/
│   ├── generate.ts
│   ├── update.ts
│   └── __tests__/
│       ├── generate.test.ts
│       └── update.test.ts
├── context/
│   ├── index.ts
│   ├── query.ts
│   └── __tests__/
│       ├── index.test.ts
│       └── query.test.ts
└── spec/
    ├── sdd.ts
    └── __tests__/
        └── sdd.test.ts
```

就近原则的好处：重构或删除模块时，测试文件随之移动或删除，不会出现孤立的测试文件；阅读源码时可以立即找到对应测试，降低上下文切换成本。

---

## GitHub Actions

### 每次推送自动更新 wiki

```yaml
# .github/workflows/repowiki-update.yml
name: Update RepoWiki

on:
  push:
    branches: [main]

jobs:
  wiki:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g repowiki-cli
      - run: repowiki wiki:update --provider=dashscope
        env:
          DASHSCOPE_API_KEY: ${{ secrets.DASHSCOPE_API_KEY }}
      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: update repowiki"
          file_pattern: ".repowiki/**"
```

将 `dashscope` / `DASHSCOPE_API_KEY` 替换为你首选的 provider，详见 [docs/providers.zh.md](docs/providers.zh.md)。

### PR 检查：阻止 wiki 过期的代码合入

```yaml
# .github/workflows/repowiki-validate.yml
name: Validate RepoWiki

on:
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install -g repowiki-cli
      - run: repowiki wiki:validate
```

`repowiki wiki:validate` 在 wiki 与当前代码库不同步时以非零状态码退出，导致 PR 检查失败，提示作者在合入前先在本地执行 `repowiki wiki:generate`。

---

## 路线图

### v0.1 ✅ — 基础架构（已发布：v0.1.1）
- [x] 核心 CLI 架构与扩展点
- [x] TypeScript/JavaScript 仓库的 wiki 生成
- [x] 本地 Markdown 输出后端
- [x] Wiki 同步状态验证（`repowiki wiki:validate`）
- [x] Claude Code 和 Cursor harness 配置生成
- [x] 增量 wiki 更新（`repowiki wiki:update`）

### v0.2 — 上下文路由
- [ ] Wiki 索引与 RAG 查询接口
- [ ] MCP 服务模式（`repowiki context serve`）——启用 Claude Code MCP 集成

### v0.3 — 规范生成
- [ ] 基于 wiki 的 SDD 模板生成
- [ ] 特性规范的 ATDD 脚手架
- [ ] AI 辅助规范评审循环
- [ ] 各 harness 优化预设（提示缓存、上下文窗口、检索深度）

### v1.0 — 生产就绪
- [ ] 多语言分析器支持（Python、Go、Java）
- [ ] 插件生态系统（输出后端、LLM providers）
- [ ] CI/CD 集成指南
- [ ] 10+ 仓库项目的性能基准测试

---

## 参与贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。当前影响力最大的贡献方向：

- **构建语言分析器** — 实现 `@repowiki/core` 中的 `Analyzer` 接口，发布为 `repowiki-plugin-analyzer-<lang>`，支持你的首选语言。
- **构建输出后端** — 实现 `OutputBackend` 接口，接入向量数据库（Qdrant、Weaviate、pgvector 等），发布为 `repowiki-plugin-backend-<name>`。
- **分享你的上下文问题** — 开一个 Issue，描述上下文爆炸是如何影响你的团队的。

---

## 许可证

MIT
