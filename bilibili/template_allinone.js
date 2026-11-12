/* 哔哩哔哩：增强(kokoryh) + 皮肤(ClydeTime) 单入口合并
 * 两个来源各自独立作用域、独立 $argument、独立 $done；只有这里调用一次原生 $done。
 * 不含 Biliverse Enhanced：首页标签固定为「推荐 + 热门」。
 */
const BILI_BUILD = '/*__BILI_BUILD__*/';
const BILI_SOURCES = /*__BILI_SOURCES__*/;
const GARB_DB = null;  // 只有皮肤脚本里有数据，主脚本为 null
const nativeReq = $request;
const nativeResp = $response;
const nativeDone = $done;
const nativeArgument = typeof $argument === 'string' ? $argument : '';
const log = console;

function parseArgs(s) {
  const out = {};
  (s || '').split('&').forEach(pair => {
    const i = pair.indexOf('='); if (i < 0) return;
    const k = pair.slice(0, i).trim(); let v = pair.slice(i + 1).trim();
    if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  });
  return out;
}
const opts = parseArgs(nativeArgument);

function stage(name, arg, input) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return; settled = true;
      if (!result || result.abort || result.response) return resolve(input);
      resolve(Object.assign({}, input, result));
    };
    try {
      const script = new Function('$request', '$response', '$argument', '$done', BILI_SOURCES[name]);
      script(Object.assign({}, nativeReq, { headers: Object.assign({}, nativeReq.headers) }),
        Object.assign({}, input, { headers: Object.assign({}, input.headers) }), arg, finish);
    } catch (e) {
      log.log('[Bili] ' + name + ' 跳过: ' + String(e)); finish({});
    }
  });
}

const parseIds = s => String(s || '')
  .replace(/["'\s]/g, '')
  .replace(/，/g, ',')
  .split(',').map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0);
// 参数既可以是 id，也可以是名字（推荐/热门/首页/我的），名字对中英文都做包含匹配。
// 分隔符用 |：Surge 的模块参数本身用逗号分隔，值里再写逗号会被截断。
const parseTokens = s => String(s || '')
  .replace(/["'\s]/g, '')
  .split(/[|,，、]/).filter(Boolean);
function matchToken(pool, token) {
  const id = Number(token);
  if (Number.isFinite(id) && id > 0) return pool.find(x => Number(x.id) === id);
  const t = token.toLowerCase();
  return pool.find(x => String(x.name || '').toLowerCase() === t)
    || pool.find(x => String(x.tab_id || '').toLowerCase() === t)
    || pool.find(x => String(x.name || '').toLowerCase().includes(t));
}
// 候选池 = 服务器原始列表 ∪ 增强模板；服务器 id 才是当前 App 版本认的。
function fixNav(response, rawTab, rawBottom) {
  try {
    const root = JSON.parse(response.body); const d = root.data;
    if (!d) return response;
    const build = (tokens, serverList, currentList, isTab) => {
      const server = Array.isArray(serverList) ? serverList : [];
      const current = Array.isArray(currentList) ? currentList : [];
      const pool = server.slice();
      current.forEach(x => { if (!pool.some(y => Number(y.id) === Number(x.id))) pool.push(x); });
      let kept = tokens.map(tk => matchToken(pool, tk)).filter(Boolean);
      if (!kept.length) {
        // 一个都没对上：优先回落到服务器真实列表（一定能渲染），而不是保留可能失效的旧模板
        if (server.length) return server.map((x, i) => Object.assign({}, x, { pos: i + 1 }));
        return null;
      }
      const out = kept.map((x, i) => Object.assign({}, x, { pos: i + 1 }));
      if (isTab) out.forEach((t, i) => { if (i === 0) t.default_selected = 1; else delete t.default_selected; });
      return out;
    };
    const tokensTab = parseTokens(opts['首页标签']);
    if (tokensTab.length) { const out = build(tokensTab, rawTab, d.tab, true); if (out) d.tab = out; }
    const tokensBottom = parseTokens(opts['底部导航']);
    if (tokensBottom.length) { const out = build(tokensBottom, rawBottom, d.bottom, false); if (out) d.bottom = out; }
    return Object.assign({}, response, { body: JSON.stringify(root) });
  } catch (e) { log.log('[Bili] 导航处理跳过: ' + String(e)); return response; }
}
function listChoices(pool, list, label) {
  const seen = new Set(); const out = [];
  [...(list || []), ...(pool || [])].forEach(x => {
    const id = Number(x.id); if (!id || seen.has(id)) return;
    seen.add(id); out.push(id + ' ' + (x.name || x.tab_id || ''));
  });
  if (out.length) log.log('[Bili] ' + label + '可选: ' + out.join(' | '));
}

const CREATOR = { title: '创作中心', style: 1, type: 1, up_title: '创作中心',
  button: { text: '投稿', url: 'bilibili://uper/user_center/archive_selection', icon: 'http://i0.hdslb.com/bfs/archive/205f47675eaaca7912111e0e9b1ac94cb985901f.png', style: 1 },
  items: [
    { id: 171, title: '创作中心', uri: 'bilibili://uper/homevc', icon: 'http://i0.hdslb.com/bfs/archive/d3aad2d07538d2d43805f1fa14a412d7a45cc861.png', need_login: 1, global_red_dot: 0, display: 1, is_up_anchor: true },
    { id: 533, title: '数据中心', uri: 'https://member.bilibili.com/york/data-center?navhide=1&from=profile', icon: 'http://i0.hdslb.com/bfs/feed-admin/367204ba56004b1a78211ba27eefbf5b4cc53a35.png', need_login: 1, global_red_dot: 0, display: 1 },
    { id: 707, title: '主播中心', uri: 'https://live.bilibili.com/p/html/live-app-anchor-center/index.html?is_live_webview=1#/', icon: 'http://i0.hdslb.com/bfs/feed-admin/48e17ccd0ce0cfc9c7826422d5e47ce98f064c2a.png', need_login: 1, display: 1 },
    { id: 2647, title: '直播数据', uri: 'https://live.bilibili.com/p/html/live-app-data/index.html?source_tag=0&foreground=pink&is_live_webview=1&hybrid_set_header=2#/', icon: 'https://i0.hdslb.com/bfs/legacy/0566b128c51d85b7ec545f318e1fd437d172dfea.png', display: 1 }] };

// 我的页只留：离线缓存 / 历史记录 / 我的收藏 / 稍后再看 / 设置（+ 可选创作中心）
function trimMine(response, ipad) {
  try {
    const root = JSON.parse(response.body); const d = root.data;
    if (root.code !== 0 || !d) return response;
    const keep = i => /user_center\/(download|history|favourite|watch_later|setting)/.test(i.uri || '');
    if (!ipad && Array.isArray(d.sections_v2)) {
      d.sections_v2 = d.sections_v2.map(s => {
        const c = Object.assign({}, s);
        c.items = (s.items || []).filter(keep);
        delete c.button; delete c.up_title;
        return c;
      }).filter(s => s.items.length);
      if (opts['创作中心'] === '1' && !d.sections_v2.some(s => s.title === CREATOR.title)) {
        d.sections_v2.splice(Math.min(1, d.sections_v2.length), 0, JSON.parse(JSON.stringify(CREATOR)));
      }
    }
    if (ipad) {
      ['ipad_upper_sections', 'ipad_recommend_sections', 'ipad_more_sections'].forEach(k => {
        if (Array.isArray(d[k])) d[k] = d[k].filter(keep);
      });
    }
    ['vip_section', 'vip_section_v2', 'modular_vip_section', 'live_tip', 'answer'].forEach(k => delete d[k]);
    return Object.assign({}, response, { body: JSON.stringify(root) });
  } catch (e) { log.log('[Bili] 我的页精简跳过: ' + String(e)); return response; }
}

function doneResponse(output) {
  const result = { body: output.body };
  if (output.body !== nativeResp.body) {
    const headers = Object.assign({}, output.headers || nativeResp.headers);
    Object.keys(headers).forEach(k => {
      if (/^(content-length|content-encoding)$/i.test(k)) delete headers[k];
    });
    result.headers = headers;
  }
  nativeDone(result);
}

// ===== 自定义装扮：只作用于 /x/resource/show/skin，留空则完全不介入 =====
const GARB_API = 'https://api.bilibili.com/x/garb/v2/mall/';
const GARB_CACHE = 'bili_custom_garb_v4';  // v2 起缓存含空间头图
const SKIN_KEYS = ['color_mode','color','color_second_page','side_bg_color','tail_color','tail_color_selected',
  'tail_icon_ani','tail_icon_ani_mode','head_myself_mp4_play','pub_btn_shade_color_top',
  'pub_btn_shade_color_bottom','pub_btn_plus_color','tail_icon_mode'];
function httpJSON(url) {
  return new Promise(resolve => {
    try {
      $httpClient.get({ url, timeout: 5, headers: { 'User-Agent': 'Mozilla/5.0' } }, (err, resp, body) => {
        if (err) return resolve(null);
        try { resolve(JSON.parse(body)); } catch (_) { resolve(null); }
      });
    } catch (_) { resolve(null); }
  });
}
async function garbDetail(id) {
  const j = await httpJSON(GARB_API + 'suit/detail?item_id=' + encodeURIComponent(id));
  return j && j.code === 0 && j.data && j.data.item_id ? j.data : null;
}
function lookupLocal(token) {
  if (!GARB_DB) return null;
  let key = GARB_DB.I[token] ? token : null;
  if (!key && !/^\d+$/.test(token)) {
    const ks = Object.keys(GARB_DB.I);
    key = ks.find(k => GARB_DB.I[k][2] === token) || ks.find(k => (GARB_DB.I[k][2] || '').includes(token)) || null;
  }
  if (!key) return null;
  const [sid, lid, name] = GARB_DB.I[key];
  const skin = sid && GARB_DB.S[sid] ? Object.assign({ preview: '' }, GARB_DB.S[sid]) : null;
  if (skin && skin.data && !skin.data.tail_icon_mode) skin.data.tail_icon_mode = 'img';
  const load = lid && GARB_DB.L[lid] ? GARB_DB.L[lid] : null;
  const space = GARB_DB.B && GARB_DB.B[key] ? GARB_DB.B[key] : null;
  return (skin || load) ? { name: name || (skin && skin.name) || token, suit: key, skin, load, space, from: '本地库' } : null;
}
async function resolveGarb(token) {
  token = String(token || '').replace(/["'\s]/g, '');
  if (!token) return null;
  let cache = {};
  try { cache = JSON.parse($persistentStore.read(GARB_CACHE) || '{}') || {}; } catch (_) {}
  if (cache[token]) return cache[token];
  const local = lookupLocal(token);
  if (local) return local;
  let d = /^\d+$/.test(token) ? await garbDetail(token) : null;
  if (!d && !/^\d+$/.test(token)) {            // 按名字搜套装
    const j = await httpJSON(GARB_API + 'home/search?pn=1&ps=20&key_word=' + encodeURIComponent(token));
    const hit = j && j.data && (j.data.list || []).find(x => x.part_id === 6);
    if (hit) d = await garbDetail(hit.item_id);
  }
  if (!d) return null;
  const out = { name: d.name, suit: String(d.item_id || '') };
  const pick = (part, fn) => {
    if (d.part_id === part) return fn(d);
    const arr = d.suit_items && d.suit_items[part === 9 ? 'skin' : 'loading'];
    return arr && arr[0] ? fn(arr[0]) : null;
  };
  out.skin = pick(9, it => {
    const pr = it.properties || {}; if (!pr.package_url) return null;
    const data = {};
    SKIN_KEYS.forEach(k => { if (pr[k] !== undefined) data[k] = pr[k] === 'true' ? true : pr[k] === 'false' ? false : pr[k]; });
    return { id: it.item_id, name: it.name, preview: pr.image_preview || pr.image_cover || '',
      ver: Number(pr.ver) || pr.ver, package_url: pr.package_url, package_md5: pr.package_md5 || '', data };
  });
  out.load = pick(10, it => {
    const pr = it.properties || {}; if (!pr.loading_url) return null;
    return { id: it.item_id, name: it.name, ver: pr.ver, loading_url: pr.loading_url };
  });
  const sb = d.part_id === 6 && d.suit_items && d.suit_items.space_bg && d.suit_items.space_bg[0];
  if (sb && sb.properties) out.space = spaceImg(sb.properties, sb.item_id);
  if (!out.skin && !out.load) return null;
  cache[token] = out;
  try { $persistentStore.write(JSON.stringify(cache), GARB_CACHE); } catch (_) {}
  return out;
}
const SPACE_STORE = 'bili_custom_space_v1';
function spaceImg(pr, sid) {
  const def = pr.image1_landscape || pr.image1_portrait || '';
  const lng = pr.image1_portrait || pr.image1_landscape || '';
  return def ? { def, long: lng, sid: String(sid || '') } : null;
}
function hdr(name) {
  const h = nativeReq.headers || {}; const k = Object.keys(h).find(x => x.toLowerCase() === name);
  return k ? String(h[k]) : '';
}
function applySpace(r) {
  try {
    const root = JSON.parse(r.body); const d = root.data || {};
    const myMid = hdr('x-bili-mid') || $persistentStore.read('bili_my_mid') || '';
    const cardMid = String((d.card && d.card.mid) || '');
    if (!myMid || cardMid !== String(myMid)) return r;            // 只改自己的空间
    let sp = null; try { sp = JSON.parse($persistentStore.read(SPACE_STORE) || 'null'); } catch (_) {}
    if (!sp || !sp.def) { log.log('[Bili] 空间背景: 当前装扮没有空间背景，保持原样'); return r; }
    const img = d.images = Object.assign({}, d.images);
    img.imgUrl = sp.def; img.night_imgurl = sp.def; img.has_garb = true;
    const sid = sp.sid || '0';
    const entry = {
      biz_type: 1, biz_id: Number(sp.suit || sid) || 0, item_id: sid + '-0',
      item: {
        item_type: 1, item_id: sid + '-0',
        image: { default_image: sp.def, long_image: sp.long || sp.def, shape_type: 1, gyroscope: null,
          width: 1242, height: 1988, scaling_factor: 0, location: '' },
        animation: null, music_album: null,
        extra: { show_in_collection: true, show_in_space: true, unusable_reason: '', space_expire_time: 0 },
        garb_extra: { space_item_id: Number(sid) || 0, space_item_index: 0 },
        card_extra: null, additional_animation: null, cover: sp.long || sp.def, item_sub_type: 0, render_type: 0
      },
      title: { title: sp.name || '', title_color: '', title_background_url: '', title_icon: '', sub_title: '',
        sub_title_background_color: '', sub_title_color_format: null },
      extra: { owned: 1, total: 1, detail_jump_url: '', duration: 5000, sort: 0, collection_completed: false,
        fetch_time: 0, benefit_jump_url: '', hidden: false, item_count: 1, click_guide: true },
      cover: sp.long || sp.def,
      digital_extra: { region_type: 0, region_icon: '', region_title: sp.name || '', entrance_jump_url: '', region_subtitle: '' },
      scaling_factor: 0
    };
    const cts = img.collection_top_simple = Object.assign({ max: 15 }, img.collection_top_simple);
    cts.top = Object.assign({}, cts.top, { result: [entry], click_guide: true, empty_guide: null });
    root.data = d;
    log.log('[Bili] 空间背景已替换: ' + (sp.name || '') + ' 部件=' + sid);
    return Object.assign({}, r, { body: JSON.stringify(root) });
  } catch (e) { log.log('[Bili] 空间背景跳过: ' + String(e)); return r; }
}

async function applyCustomGarb(r) {
  const token = opts['自定义装扮'];
  if (!token || !String(token).replace(/["'\s]/g, '')) { try { $persistentStore.write('null', SPACE_STORE); } catch (_) {} log.log('[Bili] 自定义装扮: 未填写，用模块自带皮肤'); return r; }
  const g = await resolveGarb(token);
  if (!g) { log.log('[Bili] 自定义装扮未找到: ' + token + '，沿用模块自带皮肤'); return r; }
  try {
    const root = JSON.parse(r.body); root.data = root.data || {};
    if (g.skin) root.data.user_equip = g.skin;
    if (g.load) root.data.load_equip = g.load;
    try { $persistentStore.write(JSON.stringify(g.space ? Object.assign({ name: g.name, suit: g.suit || '' }, g.space) : null), SPACE_STORE); } catch (_) {}
    log.log('[Bili] 自定义装扮(' + (g.from || '官方接口') + '): ' + g.name + (g.skin ? ' 皮肤=' + g.skin.id : '') + (g.load ? ' 加载动画=' + g.load.id : ''));
    return Object.assign({}, r, { body: JSON.stringify(root) });
  } catch (_) { return r; }
}

(async () => {
  const p = new URL(nativeReq.url).pathname;
  let r = Object.assign({}, nativeResp, { headers: Object.assign({}, nativeResp.headers) });
  let parsed;
  try { parsed = JSON.parse(r.body); } catch (_) { return nativeDone({}); }
  if (parsed && typeof parsed.code === 'number' && parsed.code !== 0) return nativeDone({});
  const mimeKey = Object.keys(r.headers).find(k => k.toLowerCase() === 'content-type');
  r.headers['content-type'] = 'application/json';
  if (mimeKey && mimeKey !== 'content-type') delete r.headers[mimeKey];
  const statusKey = Object.keys(r.headers).find(k => k.toLowerCase() === 'bili-status-code');
  if (statusKey) r.headers['bili-status-code'] = String(r.headers[statusKey]);
  else if (parsed && parsed.code === 0) r.headers['bili-status-code'] = '0';

  const kkArg = JSON.stringify({ showCreatorHub: opts['创作中心'] === '1', logLevel: opts['日志等级'] || '4' });
  const runKK = /^\/x\/(resource\/show\/tab\/v2|v2\/account\/(?:mine(?:\/ipad)?|myinfo))$/.test(p);
  const runSkin = /^\/x\/resource\/show\/skin$/.test(p)
    || /^\/x\/v2\/(account\/(myinfo|mine)|space)(\/|$)/.test(p)
    || /^\/x\/vip\/(web\/vip_center\/combine|price\/panel\/lexi|top_panel_info)/.test(p);

  if (!runKK && !runSkin) return nativeDone({});   // 不归本脚本管，零改动
  const rawTab = parsed && parsed.data ? parsed.data.tab : null;      // 服务器原始 tab
  const rawBottom = parsed && parsed.data ? parsed.data.bottom : null;
  if (runKK) r = await stage('kk', kkArg, r);
  if (runSkin) r = await stage('clyde', '', r);
  if (/^\/x\/resource\/show\/skin$/.test(p)) r = await applyCustomGarb(r);
  if (/^\/x\/resource\/show\/tab\/v2$/.test(p)) {
    r = fixNav(r, rawTab, rawBottom);
    try {
      const d = JSON.parse(r.body).data || {};
      log.log('[Bili] 服务器 tab=' + ((rawTab || []).length) + ' 项, 模板 tab=' + ((d.tab || []).length)
        + ' 项, 最终=' + ((d.tab || []).map(t => t.id + (t.name ? '(' + t.name + ')' : '')).join(',')));
      listChoices(rawTab, d.tab, '首页标签');
      listChoices(rawBottom, d.bottom, '底部导航');
    } catch (_) {}
  }
  if (/^\/x\/v2\/account\/mine(\/ipad)?$/.test(p)) r = trimMine(r, /\/ipad$/.test(p));
  if (/^\/x\/v2\/account\/mine(\/ipad)?$/.test(p)) { try { const m = (JSON.parse(r.body).data || {}).mid; if (m) $persistentStore.write(String(m), 'bili_my_mid'); } catch (_) {} }
  if (/^\/x\/v2\/space$/.test(p)) r = applySpace(r);

  log.log('[Bili ' + BILI_BUILD + '] ' + p + ' ' + [runKK && '净化', runSkin && '皮肤'].filter(Boolean).join(' → '));
  doneResponse(r);
})().catch(e => { log.log('[Bili] 原样放行: ' + String(e)); nativeDone({}); });
