/*
 * AnyRouter 统一请求改写（Surge http-request 脚本）
 * 仓库：Minis Surge 模块仓库（统一托管，不再分散在多个账号）
 *
 * 一个脚本管三件事，由 argument 的 mode= 选择：
 *   responses : /v1/responses —— 补请求体
 *                 · gpt-6.1-sol  ：补 prompt_cache_key，并把 input 归一成数组（站点强制）
 *                 · gpt-6-astra*  ：补成完整 codex 形态（input/include/tools/store/UA）
 *                 · 其他模型      ：原样放行
 *   messages  : /v1/messages  —— 追加 anthropic-beta: context-1m-2025-08-07，x-api-key 镜像到 Authorization
 *   models    : /v1/models    —— x-api-key 镜像到 Authorization（刷新模型列表用）
 *
 * 只改请求、不碰响应，流式保留。
 * 参数：mode / models / full / pck / log
 */

(function () {
  "use strict";

  var CODEX_VERSION = "0.45.0";
  var PCK_FALLBACK = "surge-gpt6";

  function parseArguments(raw) {
    var out = {};
    String(raw || "").split("&").forEach(function (part) {
      if (!part) return;
      var i = part.indexOf("=");
      var k = i >= 0 ? part.slice(0, i) : part;
      var v = i >= 0 ? part.slice(i + 1) : "";
      try {
        out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " "));
      } catch (e) {
        out[k] = v;
      }
    });
    return out;
  }

  var args = parseArguments(typeof $argument !== "undefined" ? $argument : "");
  var MODE = args.mode || "responses";
  var DEBUG = /^(1|true|on|yes)$/i.test(args.log || "false");
  var PCK_OVERRIDE = String(args.pck || "");
  if (PCK_OVERRIDE) PCK_FALLBACK = PCK_OVERRIDE;

  // 白名单：+ 或逗号或竖线分隔；空 = 所有模型都处理
  var MODELS = String(args.model || args.models || "").split(/[,+|]/).map(function (s) {
    return s.trim();
  }).filter(function (s) { return s.length > 0; });

  // 前缀命中即算在名单里；asterisk 结尾视为前缀匹配
  function needFix(model) {
    if (/^gpt-6-astra/i.test(model)) return true;   // astra 永远处理
    if (!MODELS.length) return true;
    for (var i = 0; i < MODELS.length; i++) {
      if (model === MODELS[i] || model.indexOf(MODELS[i]) === 0) return true;
    }
    return false;
  }

  // full 模式：全局开关（true 时所有白名单模型都补成完整 codex 形态）；
  // 另外 gpt-6-astra* 永远走完整体，因为它只有完整体才认
  var FORCE_FULL = /^(1|true|on|yes)$/i.test(args.full || "false");
  function useFullMode(model) {
    if (FORCE_FULL) return true;
    return /^gpt-6-astra/i.test(model);
  }

  function log(msg) {
    if (DEBUG) console.log("[AnyRouter GPT6] " + msg);
  }

  function finish(v) { $done(v || {}); }

  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }

  /* ---------- header 工具（大小写不敏感） ---------- */

  function getHeader(headers, name) {
    var want = String(name).toLowerCase();
    var found = "";
    Object.keys(headers || {}).forEach(function (k) {
      if (k.toLowerCase() === want) found = headers[k];
    });
    return found;
  }

  function setHeader(headers, name, value) {
    var want = String(name).toLowerCase();
    var hit = null;
    Object.keys(headers).forEach(function (k) {
      if (k.toLowerCase() === want) hit = k;
    });
    headers[hit || name] = value;
  }

  function delHeader(headers, name) {
    var want = String(name).toLowerCase();
    Object.keys(headers).forEach(function (k) {
      if (k.toLowerCase() === want) delete headers[k];
    });
  }

  function copyHeaders(source) {
    var out = {};
    Object.keys(source || {}).forEach(function (k) { out[k] = source[k]; });
    return out;
  }

  /* ---------- 文本提取：兼容 anthropic / openai 各种 content 形态 ---------- */

  function textOf(content) {
    if (typeof content === "string") return content;
    if (isArray(content)) {
      var parts = [];
      content.forEach(function (p) {
        if (typeof p === "string") { parts.push(p); return; }
        if (p && typeof p === "object") {
          var t = p.type || "";
          if (t === "text" || t === "input_text" || t === "output_text") {
            if (p.text) parts.push(p.text);
          } else if (t === "tool_result") {
            var inner = textOf(p.content);
            if (inner) parts.push(inner);
          }
        }
      });
      return parts.join("\n");
    }
    return "";
  }

  function toCodexInput(body) {
    var input = body.input;
    if (isArray(input)) return input;

    var src;
    if (typeof input === "string" && input) {
      src = [{ role: "user", content: input }];
    } else {
      src = body.messages || [];
    }
    if (!isArray(src)) src = [];

    var items = [];
    src.forEach(function (m) {
      if (!m || typeof m !== "object") return;
      var text = textOf(m.content);
      if (!text) return;
      var role = m.role === "assistant" ? "assistant" : (m.role === "system" ? "system" : "user");
      items.push({
        type: "message",
        role: role,
        content: [{ type: "input_text", text: text }]
      });
    });
    if (!items.length) {
      items = [{
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hi" }]
      }];
    }
    return items;
  }

  /* ---------- 核心：把任意形态补成完整 codex 请求体 ---------- */

  function buildCodexBody(body) {
    return {
      model: body.model,
      instructions: (typeof body.instructions === "string" && body.instructions) ||
        (typeof body.system === "string" && body.system) ||
        "You are a helpful assistant.",
      input: toCodexInput(body),
      tools: isArray(body.tools) ? body.tools : [],
      tool_choice: body.tool_choice == null ? "auto" : body.tool_choice,
      parallel_tool_calls: typeof body.parallel_tool_calls === "boolean" ? body.parallel_tool_calls : false,
      store: body.store === true,
      stream: body.stream !== false,
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: (typeof body.prompt_cache_key === "string" && body.prompt_cache_key) || PCK_FALLBACK,
      reasoning: (body.reasoning && typeof body.reasoning === "object") ? body.reasoning : { effort: "low", summary: "auto" }
    };
  }

  /* ---------- 模式一：/v1/responses 补全请求体 ---------- */

  function handleResponses() {
    if (!$request || $request.method !== "POST" || !$request.body) return finish();

    var body;
    try {
      body = JSON.parse($request.body);
    } catch (e) {
      log("body 不是 JSON，原样放行");
      return finish();
    }
    if (!body || typeof body.model !== "string" || !body.model) return finish();

    // 白名单：命中才补全，其他模型原样放行
    if (!needFix(body.model)) {
      log("模型 " + body.model + " 不在白名单，放行");
      return finish();
    }

    var headers = copyHeaders($request.headers);
    var rebuilt;
    var full = useFullMode(body.model);
    if (full) {
      // 完整体：补成完整 codex 形态（gpt-6-astra* 必需）
      rebuilt = buildCodexBody(body);
      setHeader(headers, "User-Agent", "codex_cli_rs/" + CODEX_VERSION + " (iOS) Surge");
      setHeader(headers, "Originator", "codex_cli_rs");
    } else {
      // 轻量体：只补最小必需字段（gpt-6.1-sol 只要这些）
      rebuilt = body;
      if (typeof rebuilt.prompt_cache_key !== "string" || !rebuilt.prompt_cache_key) {
        rebuilt.prompt_cache_key = PCK_FALLBACK;
      }
      // sol 不认字符串形态的 input，也不认只有 messages，统一成数组
      if (!isArray(rebuilt.input)) {
        rebuilt.input = toCodexInput(rebuilt);
      }
    }

    delHeader(headers, "Content-Length");   // body 变了，让 Surge 重算 framing
    setHeader(headers, "Content-Type", "application/json");
    setHeader(headers, "Accept", rebuilt.stream ? "text/event-stream" : "application/json");

    log("已改写 model=" + rebuilt.model + " full=" + full +
        " pck=" + rebuilt.prompt_cache_key);
    finish({ body: JSON.stringify(rebuilt), headers: headers });
  }

  /* ---------- 模式二：/v1/messages 追加 1m beta ---------- */

  function handleMessages() {
    var headers = copyHeaders($request.headers);
    var BETA = "context-1m-2025-08-07";
    var current = getHeader(headers, "anthropic-beta");
    if (current.indexOf(BETA) === -1) {
      setHeader(headers, "anthropic-beta", current ? current + "," + BETA : BETA);
      log("已追加 anthropic-beta: " + BETA);
    }
    var key = getHeader(headers, "x-api-key");
    if (key && !getHeader(headers, "Authorization")) {
      setHeader(headers, "Authorization", "Bearer " + key);
    }
    finish({ headers: headers });
  }

  /* ---------- 模式三：/v1/models 镜像鉴权头 ---------- */

  function handleModels() {
    var headers = copyHeaders($request.headers);
    var key = getHeader(headers, "x-api-key");
    if (key && !getHeader(headers, "Authorization")) {
      setHeader(headers, "Authorization", "Bearer " + key);
      log("已把 x-api-key 镜像到 Authorization");
    }
    finish({ headers: headers });
  }

  try {
    if (MODE === "messages") return handleMessages();
    if (MODE === "models") return handleModels();
    return handleResponses();
  } catch (e) {
    console.log("[AnyRouter GPT6] 出错，原样放行: " + String(e));
    finish();
  }
})();
