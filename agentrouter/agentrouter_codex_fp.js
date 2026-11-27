// AgentRouter 指纹补全：补 Codex CLI 的 UA / originator / 会话头
var ARG = typeof $argument !== "undefined" && $argument ? String($argument) : "";

function arg(name, def) {
  var parts = ARG.split("&");
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf("=");
    if (eq < 0) continue;
    if (parts[i].slice(0, eq).trim() !== name) continue;
    var v = parts[i].slice(eq + 1).trim();
    try { v = decodeURIComponent(v); } catch (e) {}
    if (v.length > 1 && ((v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') ||
        (v.charAt(0) === "'" && v.charAt(v.length - 1) === "'"))) v = v.slice(1, -1);
    return v;
  }
  return def;
}

var MODE = (arg("mode", "auto") || "auto").toLowerCase();
var VER = arg("ver", "0.172.0") || "0.172.0";
var OSSTR = arg("os", "Mac OS 15.6.1") || "Mac OS 15.6.1";
var ARCH = arg("arch", "arm64") || "arm64";
var TERM = arg("term", "iTerm.app/3.6.6") || "iTerm.app/3.6.6";
var TTL = Math.max(1, parseInt(arg("ttl", "360"), 10) || 360);
if (["auto", "full", "headers", "minimal", "panel"].indexOf(MODE) < 0) MODE = "auto";

var K_SESSION = "ar.codex.session";
var K_THREAD = "ar.codex.thread";
var K_COUNT = "ar.codex.count";

function randHex(n) {
  var s = "";
  for (var i = 0; i < n; i++) s += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
  return s;
}

function uuidV4() {
  var s = randHex(32);
  s = s.slice(0, 12) + "4" + s.slice(13);
  s = s.slice(0, 16) + "89ab".charAt(Math.floor(Math.random() * 4)) + s.slice(17);
  return s.slice(0, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16) + "-" +
         s.slice(16, 20) + "-" + s.slice(20);
}

function readJSON(key) {
  try { return JSON.parse($persistentStore.read(key) || "null"); } catch (e) { return null; }
}

function writeJSON(key, val) {
  try { $persistentStore.write(JSON.stringify(val), key); } catch (e) {}
}

function stickyId(key) {
  var o = readJSON(key);
  if (o && o.id && o.ts && Date.now() - o.ts < TTL * 60000) return o.id;
  var id = uuidV4();
  writeJSON(key, { id: id, ts: Date.now() });
  return id;
}

function todayKey() {
  var d = new Date();
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
}

function codexUA() { return "codex_cli_rs/" + VER + " (" + OSSTR + "; " + ARCH + ") " + TERM; }

if (MODE === "panel") {
  var sess = readJSON(K_SESSION);
  var thr = readJSON(K_THREAD);
  var cnt = readJSON(K_COUNT);
  var left = sess && sess.ts ? Math.max(0, TTL - Math.round((Date.now() - sess.ts) / 60000)) : 0;
  $done({
    title: "AgentRouter Codex 指纹",
    content: [
      "UA  " + codexUA(),
      "originator  codex_cli_rs",
      "会话  " + (sess && sess.id ? sess.id.slice(0, 8) + "…  剩 " + left + " 分钟" : "未生成"),
      "线程  " + (thr && thr.id ? thr.id.slice(0, 8) + "…" : "未生成"),
      "今日补全  " + (cnt && cnt.d === todayKey() && cnt.n ? cnt.n + " 次（改 body " + (cnt.body || 0) + " 次）" : "0 次")
    ].join("\n"),
    style: cnt && cnt.d === todayKey() && cnt.n ? "good" : "info"
  });
} else {
  run();
}

function run() {
  var req = $request || {};
  var headers = req.headers || {};
  var url = String(req.url || "");
  var method = String(req.method || "GET").toUpperCase();

  var isResponses = /\/v1\/responses(\/compact)?(\?|$)/.test(url);
  var isCompact = /\/v1\/responses\/compact(\?|$)/.test(url);
  var isChat = /\/v1\/chat\/completions(\?|$)/.test(url);
  var isMessages = /\/v1\/messages(\?|$)/.test(url);
  var isWs = get("upgrade").toLowerCase() === "websocket";

  function keyOf(name) {
    var t = name.toLowerCase();
    for (var k in headers) if (k.toLowerCase() === t) return k;
    return null;
  }
  function get(name) {
    var k = keyOf(name);
    return k === null ? "" : String(headers[k]);
  }
  function set(name, value) {
    var k = keyOf(name);
    if (k !== null && k !== name) delete headers[k];
    headers[name] = value;
  }
  function del(name) {
    var k = keyOf(name);
    if (k !== null) delete headers[k];
  }

  var family = MODE === "auto" && isMessages ? "claude" : "codex";

  set("User-Agent", family === "claude" ? "claude-cli/2.1.92 (external, sdk-cli)" : codexUA());
  if (family === "claude") {
    del("originator");
    del("OpenAI-Beta");
  } else {
    set("originator", "codex_cli_rs");
    if (isResponses && !isWs) set("OpenAI-Beta", "responses=experimental");
  }

  if (MODE === "minimal") { $done({ headers: headers }); return; }

  var sid = stickyId(K_SESSION);
  var tid = stickyId(K_THREAD);
  var cnt = readJSON(K_COUNT);
  if (!cnt || cnt.d !== todayKey()) cnt = { d: todayKey(), n: 0, body: 0 };
  cnt.n += 1;
  writeJSON(K_COUNT, cnt);

  if (!isWs && family === "codex") {
    set("session_id", sid);
    set("conversation_id", sid);
    set("session-id", sid);
    set("thread-id", tid);
    set("x-client-request-id", tid);
  }

  var ctype = get("Content-Type").toLowerCase();
  if (method !== "GET" && method !== "HEAD" && !isWs && ctype.indexOf("multipart/") !== 0) {
    set("Content-Type", "application/json");
  }
  if (isResponses && !isWs && family === "codex") {
    set("Accept", "text/event-stream");
    set("x-codex-exclude", "tools,usage.attribution");
    set("x-codex-exclude-stream-fields", "delta.sequence_number,reasoning.added.encrypted_content");
    del("x-codex-turn-state");
    del("x-codex-routing-hint");
  }

  var drop = [
    "x-stainless-lang", "x-stainless-package-version", "x-stainless-os",
    "x-stainless-arch", "x-stainless-runtime", "x-stainless-runtime-version",
    "x-stainless-retry-count", "x-stainless-timeout", "x-stainless-helper-method",
    "x-app", "x-title", "http-referer", "referer"
  ];
  if (family === "codex") {
    drop.push("anthropic-version", "anthropic-beta", "anthropic-dangerous-direct-browser-access");
  }
  for (var i = 0; i < drop.length; i++) del(drop[i]);

  if (family === "codex") {
    if (get("Authorization")) { del("x-api-key"); del("api-key"); }
  } else {
    set("x-app", "cli");
    if (!get("anthropic-version")) set("anthropic-version", "2023-06-01");
    if (!get("anthropic-beta")) {
      set("anthropic-beta", "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,prompt-caching-scope-2026-01-05");
    }
    set("anthropic-dangerous-direct-browser-access", "true");
    set("x-stainless-helper-method", "stream");
    set("x-stainless-retry-count", "0");
    set("x-stainless-runtime-version", "v24.14.0");
    set("x-stainless-package-version", "0.80.0");
    set("x-stainless-runtime", "node");
    set("x-stainless-lang", "js");
    set("x-stainless-arch", "arm64");
    set("x-stainless-os", "MacOS");
    set("x-stainless-timeout", "600");
  }

  var out = { headers: headers };

  var body = req.body;
  if (MODE !== "headers" && family === "codex" && !isWs &&
      typeof body === "string" && body.length && (isResponses || isChat)) {
    var obj = null;
    try { obj = JSON.parse(body); } catch (e) {}
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      var changed = false;
      if (isResponses) {
        if (isCompact) {
          if (obj.prompt_cache_key == null) { obj.prompt_cache_key = sid; changed = true; }
        } else {
          if (obj.stream == null) { obj.stream = true; changed = true; }
          if (obj.store == null) { obj.store = false; changed = true; }
          if (obj.include == null) { obj.include = ["reasoning.encrypted_content"]; changed = true; }
          if (obj.prompt_cache_key == null) { obj.prompt_cache_key = sid; changed = true; }
          if (obj.instructions == null) { obj.instructions = ""; changed = true; }
          if (Array.isArray(obj.tools) && obj.tools.length) {
            if (obj.tool_choice == null) { obj.tool_choice = "auto"; changed = true; }
            if (obj.parallel_tool_calls == null) { obj.parallel_tool_calls = true; changed = true; }
            if (fillRequired(obj.tools)) changed = true;
          }
        }
      } else if (isChat) {
        if (obj.stream == null) { obj.stream = true; changed = true; }
        if (obj.store == null) { obj.store = false; changed = true; }
      }
      if (changed) {
        out.body = JSON.stringify(reorder(obj));
        del("Content-Length");
        del("Transfer-Encoding");
        cnt.body = (cnt.body || 0) + 1;
        writeJSON(K_COUNT, cnt);
      }
    }
  }

  $done(out);
}

function fillRequired(tools) {
  var changed = false;
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i]);
      return;
    }
    if (node.type === "object" && node.required == null) { node.required = []; changed = true; }
    for (var k in node) walk(node[k]);
  }
  walk(tools);
  return changed;
}

function reorder(obj) {
  var order = ["model", "stream", "service_tier", "input", "tools", "tool_choice",
    "parallel_tool_calls", "reasoning", "store", "stream_options", "include",
    "prompt_cache_key", "prompt_cache_options", "text", "client_metadata",
    "access_programs", "request_country"];
  var out = {}, used = {};
  for (var i = 0; i < order.length; i++) {
    var k = order[i];
    if (obj[k] !== undefined) { out[k] = obj[k]; used[k] = true; }
  }
  for (var key in obj) if (!used[key]) out[key] = obj[key];
  return out;
}
