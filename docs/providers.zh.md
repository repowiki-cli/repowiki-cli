# LLM 提供商配置

通过 `--provider=<key>` 指定提供商。API Key 从环境变量或当前目录的 `.env` 文件读取。

## 支持的提供商

| 提供商 key | 默认模型 | API Key 环境变量 | 说明 |
|---|---|---|---|
| `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` | |
| `anthropic` | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` | |
| `azure` | `gpt-4o-mini` | `AZURE_OPENAI_API_KEY` | 还需设置 `AZURE_OPENAI_ENDPOINT` |
| `dashscope` | `qwen-turbo` | `DASHSCOPE_API_KEY` | 阿里云百炼 |
| `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` | |
| `ollama` | `llama3` | — | 本地部署，无需 API Key |
| `openai-compat:URL` | `gpt-4o-mini` | `OPENAI_API_KEY` | 任何 OpenAI 兼容接口 |

通过 `--model` 覆盖默认模型：

```bash
repowiki wiki:generate --provider=dashscope --model=qwen-max
repowiki wiki:generate --provider=openai --model=gpt-4o
```

---

## OpenAI

```bash
export OPENAI_API_KEY=sk-...
repowiki wiki:generate --provider=openai
```

---

## Anthropic

```bash
export ANTHROPIC_API_KEY=sk-ant-...
repowiki wiki:generate --provider=anthropic
```

---

## Azure OpenAI

Azure 需要在 API Key 之外额外提供 Endpoint URL。

```bash
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
# 可选：覆盖 API 版本（默认：2025-04-01-preview）
export AZURE_OPENAI_API_VERSION=2024-02-01

# --model 指定部署名称
repowiki wiki:generate --provider=azure --model=my-gpt4o-deployment
```

---

## DashScope（阿里云百炼 / 通义千问）

```bash
export DASHSCOPE_API_KEY=sk-...
repowiki wiki:generate --provider=dashscope
# 使用更强的模型：
repowiki wiki:generate --provider=dashscope --model=qwen-max
```

可用模型：`qwen-turbo`、`qwen-plus`、`qwen-max`、`qwen-long`。

---

## DeepSeek

```bash
export DEEPSEEK_API_KEY=...
repowiki wiki:generate --provider=deepseek
# DeepSeek Coder：
repowiki wiki:generate --provider=deepseek --model=deepseek-coder
```

---

## Ollama（本地）

无需 API Key，启动 Ollama 后直接使用：

```bash
repowiki wiki:generate --provider=ollama --model=qwen2.5-coder
```

默认 Base URL：`http://localhost:11434/v1`。

---

## OpenAI 兼容接口

```bash
export OPENAI_API_KEY=...
repowiki wiki:generate --provider=openai-compat:https://api.example.com/v1 --model=my-model
```

---

## 使用 .env 文件

在运行 `repowiki` 的目录创建 `.env` 文件：

```
DASHSCOPE_API_KEY=sk-...
```

显式设置的环境变量始终优先于 `.env` 中的值。
