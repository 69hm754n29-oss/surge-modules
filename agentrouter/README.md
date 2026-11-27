# AgentRouter Codex HTTP 指纹（远程原地址）

## 安装／更新（2 分钟）

在 Surge 更新现有模块，或通过原地址安装：

https://raw.githubusercontent.com/69hm754n29-oss/surge-modules/main/agentrouter/AgentRouter-Codex-FP.sgmodule

无需下载本地包、无需填本地脚本路径。模块引用同仓库原脚本路径，新版本附 `?v=20261127-2`，避免旧脚本缓存；脚本检查更新间隔 300 秒。不要同时启用此前本地 v2 和远程版，Surge 对同 URL 只跑第一条匹配请求脚本。

默认 `full`，默认 UA：

```text
codex_cli_rs/0.172.0 (Mac OS 27.2.1; arm64) iTerm.app/3.6.6
```

这是配置的模拟标识，不是当前设备系统信息。2026-11-27 核对：Codex latest 正式版 0.172.0，Apple 最新稳定 macOS 27.2.1。已有模块实例可能保存着旧的参数覆盖值：更新后检查「系统描述」是否仍为 15.6.1，若是，改为 `Mac OS 27.2.1`；同时保留自己明确选择的版本／模式。修改 UA 的版本号不自动改变实现版本。

模块要求 MITM 开启并信任 Surge CA。面板计数只代表脚本执行，不保证服务器接受、账号分组、倍率、缓存命中或整段 SSE 成功结束。

## 做了什么

固定源码基线：[rust-v0.172.0 / 3d86e43b075adeba2193ec5c22ac92f55afd82e6](https://github.com/openai/codex/tree/3d86e43b075adeba2193ec5c22ac92f55afd82e6)。仅覆盖 `agentrouter.org` / `air-outer.com` 及其子域的 Responses 端点。

| 模式 | 行为 |
|---|---|
| `full`（默认）／`auto` | 补 HTTP 头和缺失 Responses 公共字段，按该版 serde 顺序序列化，保留显式原值 |
| `headers` | 正文字节不变；仅改头，Accept 按已知 stream 值调整，未知则保留 |
| `minimal` | 只补 UA/originator，不建回退会话或改正文 |

不转换 `/v1/chat/completions` 和 `/v1/messages`，不再给 Messages 拼 Claude 指纹。`/responses/compact` 不在该 tag 的专用实现中，只补 UA/originator/version，缺 Accept 时补 JSON，正文与会话头透传。WS 升级只补 UA/originator，不改帧或握手其他字段。GET/HEAD/其他方法、multipart、非 JSON、压缩正文和无关路径放行。

现代 HTTP 头为 `session-id`、`thread-id`、`x-client-request-id`；缺 x-client-request-id 时等于 thread-id，**不是每次请求生成独立 UUID**。真实现有 ID 优先，根线程的本地回退 session=thread，子线程已有不同身份保留。无会话上下文时回退 ID 按主机及认证 SHA-256 摘要隔离，TTL 默认 360 分钟，**不是完整 Codex 生命周期**。补内置 OpenAI provider 默认的 `version: 0.172.0`；不合成未知设备／身份头。

不再补历史 `responses=experimental` 或两个 exclude 头，仅清理识别出的旧模块默认值。保留原服务器 turn-state/routing-hint，不伪造或跨 turn 回放。原 API 密钥、账号头、提示词、system/developer 消息及工具 schema 不替换；不递归添加 `required: []`。

`full` 只对真正**缺失**的键补：`stream:true`、`store:false`、`include:["reasoning.encrypted_content"]`、`tools:[]`、`tool_choice:"auto"`、`parallel_tool_calls:true`、空 `reasoning:{}` 和缓存键。显式 null/false/空数组及未知字段保留。这些默认值有行为意义，不能声称是零语义变化的指纹复制；需要正文完全不动时使用 headers。不会编造模型 effort/summary/context、text/client_metadata 或 instructions。该版 struct 没有顶层 instructions，客户端已有值仍保留。

61 项合成 Node 断言、8 项 WebKit/JSC 检查与模块参数／正则／引用校验通过；不是 Surge 真机上游集成测试。脚本无联网重发、无日志输出，不存密钥／正文／服务端路由值，只存认证摘要、回退随机身份及本地计数。摘要应视为账号关联信息。Surge 需要读请求体，上限 32 MB，超限断连可能发生在脚本执行前。

## TLS／HTTP2：不是完全无解，但不是改头能解决

- **仅此模块：** TLS 已由 Surge 连接栈建立，http-request 无 ClientHello、扩展顺序、密码套件顺序或 HTTP2 SETTINGS/帧顺序参数。`$httpClient` 重发仍使用 Surge 连接栈，不能变成 Codex。
- **真实 Codex 不经 MITM：** 通过 CONNECT/SOCKS 的纯隧道通常保留客户端到目标站的 TLS 与 HTTP2 会话；目标站看到真实客户端握手，但出口 IP/路由仍变化，脚本也无法改加密头／正文。
- **外部协议桥：** 由真实 Codex 或可控 TLS/H2 的程序对目标站重新连接，Surge 只做转发。要匹配具体 Codex 版本／构建／平台，应采样真实请求后验证，不能拿 Chrome/Safari 预设当 Codex。已有非 Codex 应用的请求体、流式、工具协议转换也需单独实现。

Surge 新版 `client-fingerprint` 的 apple-26/chromium-155 是**至代理节点的 TLS-over-TCP 连接**预设，不是任意 Codex 指纹或目标站 MITM 出站指纹。`[MITM] h2=true` 只开启 HTTP2 解密，不等于复制 Codex SETTINGS/帧序列。

官方：[Surge TLS 参数](https://manual.nssurge.com/policies/tls.html) · [MITM](https://manual.nssurge.com/http/mitm.html) · [http-request](https://manual.nssurge.com/scripting/http-request.html) · [Codex 会话头](https://github.com/openai/codex/blob/3d86e43b075adeba2193ec5c22ac92f55afd82e6/codex-rs/codex-api/src/endpoint/responses.rs#L91-L110) · [请求体字段](https://github.com/openai/codex/blob/3d86e43b075adeba2193ec5c22ac92f55afd82e6/codex-rs/codex-api/src/common.rs#L407-L437)。
