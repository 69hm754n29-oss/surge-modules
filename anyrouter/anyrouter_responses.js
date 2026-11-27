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

  var MODELS = String(args.model || args.models || "").split(/[,+|]/).map(function (s) {
    return s.trim();
  }).filter(function (s) { return s.length > 0; });

  function needFix(model) {
    if (/^gpt-6-astra/i.test(model)) return true;
    if (!MODELS.length) return true;
    for (var i = 0; i < MODELS.length; i++) {
      if (model === MODELS[i] || model.indexOf(MODELS[i]) === 0) return true;
    }
    return false;
  }

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

    if (!needFix(body.model)) {
      log("模型 " + body.model + " 不在白名单，放行");
      return finish();
    }

    var headers = copyHeaders($request.headers);
    var rebuilt;
    var full = useFullMode(body.model);
    if (full) {
      rebuilt = buildCodexBody(body);
      setHeader(headers, "User-Agent", "codex_cli_rs/" + CODEX_VERSION + " (iOS) Surge");
      setHeader(headers, "Originator", "codex_cli_rs");
    } else {
      rebuilt = body;
      if (typeof rebuilt.prompt_cache_key !== "string" || !rebuilt.prompt_cache_key) {
        rebuilt.prompt_cache_key = PCK_FALLBACK;
      }
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
