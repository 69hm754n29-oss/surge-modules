/*
 * AnyRouter GPT 6 Astra 保活 / 挤（Surge 脚本）
 *
 * 按需保活：面板下拉刷新立即向 anyrouter.top 挤一次。
 * 定时保活默认关闭 —— 模块里「定时保活」参数填 # 时，整条 cron 脚本行变成注释，
 * Surge 根本不加载它，一点电都不耗。想连续保活时把它改成任务名即可。
 *
 * 通知：
 *   面板触发  → 成功不弹（结果就在面板上），失败弹一条
 *   定时触发  → 只在「成功」时弹通知；失败静默（默认），把「失败也通知」打开则失败也弹
 *   手动触发  → 按两个通知开关弹
 *
 * 参数：WINDOW / API_KEY / CONCURRENCY / MODEL / RETRY / LOG / NOTIFY_OK / NOTIFY_FAIL
 */

(function () {
  "use strict";

  var UPSTREAM = "https://anyrouter.top/v1/responses";
  var STORE_KEY = "anyrouter.keepalive.stat";

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
  var MODE = args["mode"] || "run";
  var WINDOW = (args["WINDOW"] || "全天").trim();
  var API_KEY = (args["API_KEY"] || "").trim();
  var MODEL = (args["MODEL"] || "gpt-6-astra").trim();
  var CONCURRENCY = Math.max(1, Math.min(20, parseInt(args["CONCURRENCY"] || "3", 10) || 3));
  var RETRY = Math.max(0, parseInt(args["RETRY"] || "0", 10) || 0);
  var DEBUG = /^(1|true|on|yes)$/i.test(args["LOG"] || "0");
  var NOTIFY_OK = !/^(0|false|off|no)$/i.test((args["NOTIFY_OK"] || "true").trim());
  var NOTIFY_FAIL = /^(1|true|on|yes)$/i.test(args["NOTIFY_FAIL"] || "false");

  function log(msg) {
    if (DEBUG) console.log("[AnyRouter Keepalive] " + msg);
  }

  /* ---------- 生效时段 ---------- */

  function parseWindow(text) {
    var t = String(text).trim();
    if (!t || /^(全天|全部|all|any|0-24|0-23)$/i.test(t)) return null;
    var m = t.match(/^(\d{1,2})(?::\d{2})?\s*[-~到至]\s*(\d{1,2})(?::\d{2})?$/);
    if (!m) return null;
    var start = parseInt(m[1], 10);
    var end = parseInt(m[2], 10);
    if (isNaN(start) || isNaN(end) || start > 24 || end > 24) return null;
    return { start: start, end: end };
  }

  function inWindow(w) {
    if (!w) return true;
    var h = new Date().getHours();
    if (w.start === w.end) return true;
    if (w.start < w.end) return h >= w.start && h < w.end;
    return h >= w.start || h < w.end;   // 跨零点
  }

  /* ---------- 请求体 ---------- */

  var NAMES = [
    "gin-gonic/gin", "facebook/react", "redis/redis", "fastapi/fastapi",
    "expressjs/express", "torvalds/linux", "vuejs/core", "golang/go"
  ];
  var SNIPPETS = [
    'package gin\n\nconst Version = "v1.10.0"',
    "export default '19.1.0';\nexport const version = '19.1.0';",
    '#define REDIS_VERSION "7.4.0"\n#define REDIS_VERSION_NUM 0x00070400',
    "from .applications import FastAPI\nfrom .routing import APIRouter\n__version__ = '0.115.0'",
    "exports = module.exports = createApplication;\nexports.version = '4.21.0';",
    "#define LINUX_VERSION_CODE 400128\n#define KERNEL_VERSION(a,b,c) (((a) << 16) + ((b) << 8) + (c))",
    "export const VERSION = '3.5.13';\nexport const BUILD = 'release';",
    "const VERSION = '1.22.0';\nmodule.exports = { VERSION };"
  ];

  function buildBody() {
    var i = Math.floor(Date.now() / 60000) % SNIPPETS.length;
    var prompt = "开源项目 " + NAMES[i] + " 代码片段：\n```" + SNIPPETS[i] +
      "```\n请用5个字以内确认已读取。";
    return {
      model: MODEL,
      instructions: "You are a helpful assistant.",
      input: [{
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: prompt }]
      }],
      tools: [],
      tool_choice: "auto",
      parallel_tool_calls: false,
      reasoning: { effort: "low", summary: "auto" },
      store: false,
      stream: true,
      include: ["reasoning.encrypted_content"],
      prompt_cache_key: "surge-keepalive"
    };
  }

  /* ---------- 时间与统计 ---------- */

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function fullStamp(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function ago(epochMs) {
    if (!epochMs) return "";
    var diff = Date.now() - epochMs;
    if (diff < 0) diff = 0;
    var min = Math.floor(diff / 60000);
    if (min < 1) return "刚刚";
    if (min < 60) return min + " 分钟前";
    var h = Math.floor(min / 60);
    if (h < 24) return h + " 小时前";
    return Math.floor(h / 24) + " 天前";
  }

  function readStat() {
    try {
      var s = JSON.parse($persistentStore.read(STORE_KEY) || "{}");
      if (typeof s.ok !== "number") s.ok = 0;
      if (typeof s.fail !== "number") s.fail = 0;
      if (typeof s.skip !== "number") s.skip = 0;
      return s;
    } catch (e) {
      return { ok: 0, fail: 0, skip: 0 };
    }
  }

  function writeStat(stat) {
    try {
      $persistentStore.write(JSON.stringify(stat), STORE_KEY);
    } catch (e) {}
  }

  /* ---------- 主流程 ---------- */

  function runKeepalive(onResult) {
    if (!API_KEY) return onResult(false, "未填接口令牌", "nokey");
    if (API_KEY.indexOf("sk-") !== 0) return onResult(false, "接口令牌看起来不是 sk- 开头", "nokey");

    var body = JSON.stringify(buildBody());
    var finished = false;
    var inflight = 0;
    var okCount = 0;
    var lastDetail = "";
    var detailSeen = 0;

    function finish(ok, detail) {
      if (finished) return;
      finished = true;
      var now = new Date();
      var stat = readStat();
      stat.last = fullStamp(now);
      stat.lastDetail = String(detail || "").slice(0, 60);
      if (ok) {
        stat.ok += 1;
        stat.lastOk = stat.last;
        stat.lastOkTs = now.getTime();
      } else {
        stat.fail += 1;
        stat.lastFail = stat.last;
        stat.lastFailTs = now.getTime();
      }
      writeStat(stat);
      log((ok ? "成功" : "失败") + "：" + detail);
      onResult(ok, detail, "done");
    }

    function attempt(round) {
      inflight += 1;
      $httpClient.post({
        url: UPSTREAM,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + API_KEY,
          "Accept": "text/event-stream",
          "User-Agent": "OpenAI-Codex/0.157.1 (Keepalive Bot)"
        },
        body: body,
        timeout: 60
      }, function (err, resp, data) {
        inflight -= 1;
        var status = resp ? resp.status : 0;
        var text = typeof data === "string" ? data : "";
        var channelFail = text.indexOf("get_channel_failed") !== -1 ||
          text.indexOf("负载已经达到上限") !== -1;
        var streamFail = text.indexOf('"status":"failed"') !== -1 ||
          text.indexOf('"type":"response.failed"') !== -1;
        var rateLimited = text.indexOf("rate_limit_exceeded") !== -1;
        var ok = !err && status === 200 && !channelFail && !streamFail;

        if (ok) {
          okCount += 1;
          return finish(true, "HTTP 200（并发 " + CONCURRENCY + "）");
        }

        detailSeen += 1;
        lastDetail = err ? String(err) :
          (status + (channelFail ? " 渠道满" : "") +
           (rateLimited ? " 限流" : "") +
           (streamFail ? " 流内失败" : ""));
        log("第 " + round + " 份失败：" + lastDetail);

        if (round < RETRY + 1) {
          setTimeout(function () { attempt(round + 1); }, 500);
          return;
        }
        if (inflight === 0 && okCount === 0 && detailSeen >= CONCURRENCY) {
          finish(false, lastDetail);
        }
      });
    }

    for (var i = 0; i < CONCURRENCY; i += 1) attempt(1);
  }

  /* ---------- 面板 ---------- */

  function panelContent(ok, detail, reason) {
    var s = readStat();
    var total = s.ok + s.fail;
    var rate = total ? Math.round(s.ok * 100 / total) : 0;
    var lines = [];

    if (reason === "outside") {
      lines.push("🕐 不在生效时段（" + WINDOW + "），本次定时已跳过");
    } else {
      lines.push((ok ? "✅ 刚刚成功" : "❌ 刚刚失败") + "：" + detail);
    }

    lines.push("");
    if (s.lastOk) {
      lines.push("🕘 上次保活成功：" + s.lastOk +
        (s.lastOkTs ? "（" + ago(s.lastOkTs) + "）" : ""));
    } else {
      lines.push("🕘 上次保活成功：还没有记录");
    }
    if (s.lastFail) {
      lines.push("⚠️ 上次失败：" + s.lastFail +
        (s.lastFailTs ? "（" + ago(s.lastFailTs) + "）" : ""));
    }

    lines.push("");
    lines.push("累计成功 " + s.ok + " / 失败 " + s.fail + "（成功率 " + rate + "%）");
    if (s.skip) lines.push("跳过 " + s.skip + " 次（不在时段）");
    lines.push("");
    lines.push("模型 " + MODEL + "｜并发 " + CONCURRENCY + "｜时段 " + WINDOW);
    lines.push("定时保活：模块参数「定时保活」填 # 即完全关闭");
    return {
      title: "AnyRouter 保活 · 挤",
      content: lines.join("\n"),
      style: (reason === "done" && !ok) ? "alert" : (reason === "done" ? "good" : "info")
    };
  }

  /* ---------- 通知 ---------- */

  function notify(ok, detail) {
    var body = String(detail).slice(0, 80);
    if (MODE === "panel") {
      // 面板结果就在面板上，只有失败才额外弹一条
      if (!ok && NOTIFY_FAIL) $notification.post("AnyRouter 保活 · 失败", "面板刷新未成功", body);
      return;
    }
    if (MODE === "run") {
      // 定时任务：默认只在成功时通知，失败静默（避免常驻时被刷屏）
      if (ok) {
        if (NOTIFY_OK) $notification.post("AnyRouter 保活 · 成功", "已挤上", body);
      } else if (NOTIFY_FAIL) {
        $notification.post("AnyRouter 保活 · 失败", "本次未成功", body);
      }
      return;
    }
    // 其它（手动触发等）：按开关通知
    if (ok && NOTIFY_OK) {
      $notification.post("AnyRouter 保活 · 成功", "已挤上", body);
    } else if (!ok && NOTIFY_FAIL) {
      $notification.post("AnyRouter 保活 · 失败", "未成功", body);
    }
  }

  /* ---------- 入口 ---------- */

  function skip(detail) {
    var s = readStat();
    s.skip = (s.skip || 0) + 1;
    s.last = fullStamp(new Date());
    writeStat(s);
    log("跳过：" + detail);
    if (MODE === "panel") $done(panelContent(false, detail, "outside"));
    else $done({});
  }

  try {
    // 面板下拉 = 用户主动要跑，忽略时段；定时任务才看时段
    if (MODE !== "panel" && !inWindow(parseWindow(WINDOW))) {
      return skip("当前 " + new Date().getHours() + " 点，不在 " + WINDOW + " 时段内");
    }

    runKeepalive(function (ok, detail, reason) {
      if (MODE === "panel") {
        $done(panelContent(ok, detail, reason));
      } else {
        notify(ok, detail);
        $done({});
      }
    });
  } catch (e) {
    console.log("[AnyRouter Keepalive] 出错：" + String(e));
    $done(MODE === "panel"
      ? { title: "AnyRouter 保活 · 挤", content: "脚本出错：" + String(e), style: "error" }
      : {});
  }
})();

