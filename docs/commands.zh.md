# 命令手册

## wiki:generate

分析 TypeScript/JavaScript 仓库，生成分层 Markdown wiki。

```bash
repowiki wiki:generate --provider=<provider> [选项]
```

### 参数说明

| 参数 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `--provider` | ✅ | — | LLM 提供商（见 [提供商配置](providers.zh.md)） |
| `--harness` | — | — | 生成 AI 工具配置文件：`claude-code` \| `cursor` |
| `--model` | — | 提供商默认值 | 覆盖模型名称或 Azure 部署名称 |
| `--api-key` | — | 从环境变量 / `.env` 读取 | 覆盖 API Key |
| `--output` | — | `.repowiki` | wiki 输出目录 |
| `--concurrency` | — | `5` | 最大并发 LLM 请求数 |
| `--dry-run` | — | `false` | 仅打印将写入的文件列表，不调用 LLM |
| `--estimate` | — | `false` | 估算 Token 用量后退出 |

### 使用示例

```bash
# DashScope（通义千问）
repowiki wiki:generate --provider=dashscope --harness=claude-code

# Anthropic Claude
repowiki wiki:generate --provider=anthropic --harness=claude-code

# OpenAI
repowiki wiki:generate --provider=openai --harness=cursor

# Azure OpenAI（--model 指定部署名称）
repowiki wiki:generate --provider=azure --model=my-gpt4o-deployment --harness=claude-code

# Ollama（本地部署，无需 API Key）
repowiki wiki:generate --provider=ollama --model=qwen2.5-coder

# DeepSeek
repowiki wiki:generate --provider=deepseek

# 预览模式（不调用 LLM，不写入文件）
repowiki wiki:generate --provider=dashscope --dry-run

# 估算 Token 费用
repowiki wiki:generate --provider=dashscope --estimate
```

### .env 文件支持

`wiki:generate` 会在启动时自动读取当前目录的 `.env` 文件。将 API Key 写入 `.env`：

```
DASHSCOPE_API_KEY=sk-...
```

显式设置的环境变量（`export DASHSCOPE_API_KEY=...`）始终优先于 `.env` 文件中的值。

---

## wiki:validate

检查 wiki 是否与当前代码库同步。

```bash
repowiki wiki:validate [--output <目录>]
```

同步则退出码为 `0`；存在差异时退出码为 `1`，并按类别打印差异列表（stale 已变更 / new 新增 / deleted 已删除）。

### 参数说明

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--output` | `.repowiki` | 要校验的 wiki 目录 |

### 使用示例

```bash
# 默认
repowiki wiki:validate

# 自定义输出目录
repowiki wiki:validate --output=docs/wiki
```

在 CI 中阻止 wiki 过期的 PR 合入：

```yaml
- run: repowiki wiki:validate
```

---

## wiki:update

基于 git diff 的增量 wiki 更新（v0.2，开发中）。

---

## context:index / context:query / context:serve

第二层上下文路由——Phase 1C 提供。

---

## spec:sdd / spec:atdd / spec:review

第三层 SDD/ATDD 生成——Phase 1D 提供。
