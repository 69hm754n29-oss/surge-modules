/*
 * AnyRouter 鉴权头镜像（Surge http-request 脚本）
 * 只做请求头改写，不碰请求体、不碰响应。
 *
 *   messages : /v1/messages —— 追加 anthropic-beta: context-1m-2025-08-07，x-api-key 镜像到 Authorization
 *   models   : /v1/models   —— x-api-key 镜像到 Authorization（Anthropic provider 刷新模型列表用）
 *
 * 参数：mode / log
 */

(function () {
  "use strict";

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
  var MODE = args.mode || "messages";
  var DEBUG = /^(1|true|on|yes)$/i.test(args.log || "false");
  function log(msg) { if (DEBUG) console.log("[AnyRouter Auth] " + msg); }
  function finish(v) { $done(v || {}); }

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
    if (MODE === "models") return handleModels();
    return handleMessages();
  } catch (e) {
    console.log("[AnyRouter Auth] 出错，原样放行: " + String(e));
    finish();
  }
})();
