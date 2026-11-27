// AgentRouter Codex HTTP fingerprint v2. ES5/JSC; no network, no logging.
// Implements the verified HTTP profile only, not TLS/H2/device attestation.
(function () {
  var A = typeof $argument === 'string' ? $argument : '';
  function arg(name, fallback) {
    var pairs = A.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var n = pairs[i].indexOf('=');
      if (n < 0 || pairs[i].slice(0, n).trim() !== name) continue;
      var v = pairs[i].slice(n + 1).trim();
      try { v = decodeURIComponent(v); } catch (_) {}
      if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
      return v;
    }
    return fallback;
  }
  function safe(value, fallback) { return value && !/[\r\n\x00]/.test(value) && value.length < 180 ? value : fallback; }
  var mode = arg('mode', 'auto').toLowerCase();
  if (['auto', 'full', 'headers', 'minimal', 'panel'].indexOf(mode) < 0) mode = 'auto';
  var version = safe(arg('ver', '0.172.0'), '0.172.0');
  var os = safe(arg('os', 'Mac OS 27.2.1'), 'Mac OS 27.2.1');
  var arch = safe(arg('arch', 'arm64'), 'arm64');
  var terminal = safe(arg('term', 'iTerm.app/3.6.6'), 'iTerm.app/3.6.6');
  var ttl = Math.min(10080, Math.max(1, parseInt(arg('ttl', '360'), 10) || 360));
  var UA = 'codex_cli_rs/' + version + ' (' + os + '; ' + arch + ') ' + terminal;
  var COUNT = 'ar.codex.v2.count';
  var LAST = 'ar.codex.v2.last';
  var completed = false;
  function finish(result) { if (!completed) { completed = true; $done(result); } }
  function read(key) { try { return JSON.parse($persistentStore.read(key) || 'null'); } catch (_) { return null; } }
  function write(key, value) { try { $persistentStore.write(JSON.stringify(value), key); } catch (_) {} }
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
  }
  // SHA-256 for account isolation: only the digest, never the credential, is stored.
  function sha256(text) {
    var s = unescape(encodeURIComponent(text));
    var K = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,
      3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,
      3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,
      2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,
      666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,
      2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,
      430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,
      1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
    var H = [1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];
    var words = [], bits = s.length * 8;
    for (var i = 0; i < s.length; i++) words[i >> 2] = (words[i >> 2] || 0) | (s.charCodeAt(i) << (24 - (i % 4) * 8));
    words[bits >> 5] = (words[bits >> 5] || 0) | (0x80 << (24 - bits % 32));
    words[(((bits + 64) >> 9) << 4) + 15] = bits;
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (var block = 0; block < words.length; block += 16) {
      var W = [], a=H[0], b=H[1], c=H[2], d=H[3], e=H[4], f=H[5], g=H[6], h=H[7];
      for (var t = 0; t < 64; t++) {
        if (t < 16) W[t] = words[block+t] | 0;
        else {
          var x=W[t-15], y=W[t-2];
          W[t] = ((rotr(x,7)^rotr(x,18)^(x>>>3)) + W[t-16] + (rotr(y,17)^rotr(y,19)^(y>>>10)) + W[t-7]) | 0;
        }
        var p=(h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^((~e)&g))+K[t]+W[t]) | 0;
        var q=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c))) | 0;
        h=g; g=f; f=e; e=(d+p)|0; d=c; c=b; b=a; a=(p+q)|0;
      }
      var vals=[a,b,c,d,e,f,g,h]; for(var k=0;k<8;k++) H[k]=(H[k]+vals[k])|0;
    }
    var result=''; for(var j=0;j<8;j++) result+=('00000000'+(H[j]>>>0).toString(16)).slice(-8); return result;
  }
  function sticky(scope) {
    var key = 'ar.codex.v2.session.' + scope;
    var old = read(key), now = Date.now();
    if (old && typeof old.id === 'string' && typeof old.ts === 'number' && now >= old.ts && now-old.ts < ttl*60000) return old.id;
    var id = uuid(); write(key, {id:id,ts:now}); return id;
  }
  function day() { var d = new Date(); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
  function count(bodyChanged, endpoint, sid) {
    var c=read(COUNT); if(!c || c.day!==day()) c={day:day(),n:0,body:0};
    c.n++; if(bodyChanged) c.body++; write(COUNT,c);
    write(LAST,{endpoint:endpoint,sid:sid ? sid.slice(0,8) : '',ts:Date.now(),mode:mode});
  }
  function panel() {
    var c=read(COUNT), last=read(LAST);
    finish({title:'AgentRouter Codex HTTP 指纹',content:[
      'UA  '+UA,
      '范围  Responses HTTP；不模拟 TLS/HTTP2/设备证明',
      '今日  '+(c && c.day===day() ? c.n : 0)+' 次 / 正文 '+(c && c.day===day() ? c.body : 0)+' 次',
      '最后  '+(last ? last.endpoint+' / '+last.mode+' / 会话 '+last.sid : '尚未匹配请求'),
      '不记录令牌、正文或服务端路由值'
    ].join('\n'),style:c && c.day===day() && c.n ? 'good' : 'info'});
  }
  try { if (mode==='panel') panel(); else run(); } catch (_) { finish({}); }
  function run() {
    var req = typeof $request !== 'undefined' && $request ? $request : {};
    var url = String(req.url || '');
    var match = /^https?:\/\/((?:[A-Za-z0-9_-]+\.)*(?:agentrouter\.org|air-outer\.com))(?::\d+)?(\/v1\/responses(?:\/compact)?)(?:\/)?(?:\?[^#]*)?$/i.exec(url);
    if (!match) { finish({}); return; }
    var headers = {}, original = req.headers || {};
    for (var k in original) if (Object.prototype.hasOwnProperty.call(original,k)) headers[k]=original[k];
    function get(name) {
      for(var key in headers) if(key.toLowerCase()===name.toLowerCase()) return String(headers[key]); return '';
    }
    function del(name) { for(var key in headers) if(key.toLowerCase()===name.toLowerCase()) delete headers[key]; }
    function set(name,value) { del(name); headers[name]=value; }
    var method=String(req.method || 'GET').toUpperCase();
    var ws=get('upgrade').toLowerCase()==='websocket';
    if(ws) { set('user-agent',UA); set('originator','codex_cli_rs'); finish({headers:headers}); return; }
    if(method!=='POST') { finish({}); return; }
    var contentType=get('content-type').toLowerCase().split(';')[0].trim();
    var encoding=get('content-encoding').toLowerCase().trim();
    if ((contentType && contentType!=='application/json' && !/^application\/[a-z0-9.+-]+\+json$/.test(contentType)) ||
        (encoding && encoding!=='identity')) { finish({}); return; }
    var compact=match[2]==='/v1/responses/compact';
    var body=null;
    if(typeof req.body==='string' && req.body.length) {
      try { body=JSON.parse(req.body); } catch (_) {}
      if(!body || typeof body!=='object' || Array.isArray(body)) body=null;
    }
    var nativeClient=/^codex_cli_rs\//.test(get('user-agent'));
    set('user-agent',UA); set('originator','codex_cli_rs');
    if(mode==='minimal') { count(false,compact?'compact':'responses',''); finish({headers:headers}); return; }
    set('version',version);
    // /compact is not part of this tag's client: header compatibility only, never a fabricated body template.
    if(compact) { if(!get('accept')) set('accept','application/json'); count(false,'compact',''); finish({headers:headers}); return; }
    var scope=sha256(match[1].toLowerCase()+'\n'+get('authorization')+'\n'+get('x-api-key')+'\n'+get('api-key'));
    var sid=get('session-id') || get('thread-id') || get('session_id') || get('conversation_id');
    if(!sid && body && typeof body.prompt_cache_key==='string' && /^[a-f0-9-]{36}$/i.test(body.prompt_cache_key)) sid=body.prompt_cache_key;
    if(!sid || /[\r\n\x00]/.test(sid) || sid.length>180) sid=sticky(scope);
    if(!nativeClient) {
      del('session_id'); del('conversation_id');
      // Remove headers left over from another SDK; never remove credentials.
      for(var name in headers) {
        var lower=name.toLowerCase();
        if(/^x-stainless-/.test(lower) || /^sec-(fetch-|ch-ua)/.test(lower) ||
            ['x-app','x-title','http-referer','referer','origin','anthropic-version','anthropic-beta',
             'anthropic-dangerous-direct-browser-access'].indexOf(lower)>=0) delete headers[name];
      }
    }
    if(!get('session-id')) set('session-id',sid);
    if(!get('thread-id')) set('thread-id',sid);
    if(!get('x-client-request-id')) set('x-client-request-id',get('thread-id'));
    // Server-provided turn-state and routing-hint are opaque; preserve, never fake/replay globally.
    // Remove only the recognized stale values from the old module, not unknown provider extensions.
    if(get('openai-beta')==='responses=experimental') del('openai-beta');
    if(get('x-codex-exclude')==='tools,usage.attribution') del('x-codex-exclude');
    if(get('x-codex-exclude-stream-fields')==='delta.sequence_number,reasoning.added.encrypted_content') del('x-codex-exclude-stream-fields');
    var output={headers:headers};
    if(mode!=='headers' && body) {
      function absent(key) { return !Object.prototype.hasOwnProperty.call(body,key); }
      if(absent('prompt_cache_key')) body.prompt_cache_key=sid;
      if(!compact) {
        if(absent('stream')) body.stream=true;
        if(absent('store')) body.store=false;
        if(absent('include')) body.include=['reasoning.encrypted_content'];
        if(absent('tools')) body.tools=[];
        if(absent('tool_choice')) body.tool_choice='auto';
        if(absent('parallel_tool_calls')) body.parallel_tool_calls=true;
        if(absent('reasoning')) body.reasoning={};
      }
      var serialized=JSON.stringify(reorder(body,compact));
      if(serialized!==req.body) { output.body=serialized; del('content-length'); del('transfer-encoding'); }
    }
    if(body && !get('content-type')) set('content-type','application/json');
    if(body && typeof body.stream==='boolean') set('accept',body.stream ? 'text/event-stream' : 'application/json');
    count(output.body!==undefined,compact?'compact':'responses',sid);
    finish(output);
  }
  function reorder(obj, compact) {
    var order = compact ? ['model','input','instructions','previous_response_id','prompt_cache_key'] :
      ['model','stream','service_tier','input','tools','tool_choice','parallel_tool_calls','reasoning','store','stream_options','include','prompt_cache_key','prompt_cache_options','text','client_metadata','access_programs','request_country'];
    var output={}, used=Object.create(null);
    for(var i=0;i<order.length;i++) { var key=order[i]; if(Object.prototype.hasOwnProperty.call(obj,key)) { output[key]=obj[key]; used[key]=true; } }
    for(var key in obj) if(Object.prototype.hasOwnProperty.call(obj,key) && !used[key]) {
      Object.defineProperty(output,key,{value:obj[key],enumerable:true,writable:true,configurable:true});
    }
    return output;
  }
})();
