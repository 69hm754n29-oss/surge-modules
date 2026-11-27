# AnyRouter 模块

anyrouter.top 的 Surge 模块。只做请求改写，不碰响应，流式保留。

| 模块 | 安装链接 |
|---|---|
| 请求体兼容（sol / astra） | `anyrouter-responses.sgmodule` |
| 鉴权头镜像（Anthropic / 模型列表） | `anyrouter-authheaders.sgmodule` |
| 保活 · 挤 | `anyrouter-keepalive.sgmodule` |

## 用途

- **请求体兼容**：`POST /v1/responses`。`gpt-6.1-sol` 补 `prompt_cache_key` 并把 `input` 归一成数组（站点强制，缺了回 400）；`gpt-6-astra*` 补成完整 codex 形态（`input` 数组 / `include:["reasoning.encrypted_content"]` / `tools` / `store` / `tool_choice` / UA）。其他模型原样放行。
- **鉴权头镜像**：`/v1/messages` 追加 `anthropic-beta: context-1m-2025-08-07`、`x-api-key` 镜像到 `Authorization`；`/v1/models` 同样镜像，供 Anthropic 格式 provider 刷新模型列表。
- **保活 · 挤**：面板下拉向站点发一次请求，显示上次成功时间与累计统计；定时保活默认关闭（cron 行被注释，不耗电）。

## 参数

请求体兼容模块：

- `处理模型`：前缀匹配，默认 `gpt-6.1-sol`。`gpt-6-astra` 系列无需填写，脚本总是处理。
- `缓存键`：填进 `prompt_cache_key` 的固定值。
- `全部补成完整体`：默认 false。
- `调试日志`：默认 false。

## 备注

`gpt-6-astra` 目前常回 `get_channel_failed`（站点上游渠道满），与本模块无关；模块只负责让请求格式合规。
