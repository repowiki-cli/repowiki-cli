# AI 工具集成

*AI 工具（harness）* 是指管理 AI 上下文和编码会话的工具——Claude Code、Cursor、Windsurf、Opencode、GitHub Copilot 等。

在 `wiki:generate` 中使用 `--harness=<name>`，可在 wiki 输出的同时生成对应工具的配置文件。

## 支持的工具

| Key | 输出文件 | 说明 |
|---|---|---|
| `claude-code` | `CLAUDE.md` | 以标签块形式追加 |
| `cursor` | `.cursorrules` | 以标签块形式追加 |

---

## Claude Code

```bash
repowiki wiki:generate --provider=dashscope --harness=claude-code
```

在 `CLAUDE.md` 中追加一段 `<!-- repowiki:start --> ... <!-- repowiki:end -->` 标签块，内容包括：
- 项目概览摘要
- 关键模块表格（路径 → 一行描述）

重复运行**幂等**：标签块内容原地替换，`CLAUDE.md` 中的其他内容保持不变。

---

## Cursor

```bash
repowiki wiki:generate --provider=dashscope --harness=cursor
```

将相同内容写入项目根目录的 `.cursorrules` 文件。

---

## 通用 Markdown 文件（适用所有工具）

无论是否指定 `--harness`，`wiki:generate` 始终生成 `.repowiki/` 目录——一组与代码结构对应的 Markdown 文件。任何能读取项目文件的 AI 工具都能自动使用这些文件。

```
.repowiki/
├── _index.md           ← 项目概览
├── core/
│   ├── _index.md       ← 包概览
│   └── src/
│       └── index.md    ← 模块详情
└── plugin-wiki/
    ├── _index.md
    └── src/
        └── ...
```

---

## CI：在每次 PR 时校验 wiki

```yaml
# .github/workflows/repowiki-validate.yml
- run: repowiki wiki:validate
```

wiki 过期时退出码为 `1`，阻止 PR 合入，直到作者在本地运行 `wiki:generate` 更新 wiki。
