# LLM Provider Configuration

Pass `--provider=<key>` to `wiki:generate`. API keys are read from environment variables or a `.env` file in the current directory.

## Supported Providers

| Provider key | Default model | API key env var | Notes |
|---|---|---|---|
| `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` | |
| `anthropic` | `claude-haiku-4-5-20251001` | `ANTHROPIC_API_KEY` | |
| `azure` | `gpt-4o-mini` | `AZURE_OPENAI_API_KEY` | Also needs `AZURE_OPENAI_ENDPOINT` |
| `dashscope` | `qwen-turbo` | `DASHSCOPE_API_KEY` | Alibaba Cloud Bailian |
| `deepseek` | `deepseek-chat` | `DEEPSEEK_API_KEY` | |
| `ollama` | `llama3` | — | No key needed; runs locally |
| `openai-compat:URL` | `gpt-4o-mini` | `OPENAI_API_KEY` | Any OpenAI-compatible endpoint |

Override the default model with `--model`:

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

Azure requires an endpoint URL in addition to the API key.

```bash
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
# Optional: override API version (default: 2025-04-01-preview)
export AZURE_OPENAI_API_VERSION=2024-02-01

# --model sets the deployment name
repowiki wiki:generate --provider=azure --model=my-gpt4o-deployment
```

---

## DashScope (Alibaba Cloud Bailian / Qwen)

```bash
export DASHSCOPE_API_KEY=sk-...
repowiki wiki:generate --provider=dashscope
# Use a more capable model:
repowiki wiki:generate --provider=dashscope --model=qwen-max
```

Available models: `qwen-turbo`, `qwen-plus`, `qwen-max`, `qwen-long`.

---

## DeepSeek

```bash
export DEEPSEEK_API_KEY=...
repowiki wiki:generate --provider=deepseek
# DeepSeek Coder:
repowiki wiki:generate --provider=deepseek --model=deepseek-coder
```

---

## Ollama (local)

No API key required. Start Ollama, then:

```bash
repowiki wiki:generate --provider=ollama --model=qwen2.5-coder
```

Default base URL: `http://localhost:11434/v1`.

---

## Any OpenAI-compatible endpoint

```bash
export OPENAI_API_KEY=...
repowiki wiki:generate --provider=openai-compat:https://api.example.com/v1 --model=my-model
```

---

## Using .env

Place a `.env` file in the directory where you run `repowiki`:

```
DASHSCOPE_API_KEY=sk-...
```

Explicit environment variables always take precedence over `.env`.
