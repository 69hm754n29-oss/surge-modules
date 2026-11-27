# AnyRouter

`anyrouter.sgmodule`

- `/v1/responses`：gpt-6.1-sol 补 `prompt_cache_key` + 归一 `input`；gpt-6-astra 补完整 codex 形态；其他放行
- `/v1/messages`、`/v1/models`：镜像 `x-api-key` 到 `Authorization`，messages 追加 `anthropic-beta`
