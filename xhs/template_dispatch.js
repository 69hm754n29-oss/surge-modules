// Local composition: preserve the user's feed filter and note-keyed live photos.
const req = $request;
const res = typeof $response === 'undefined' ? null : $response;
const path = req.url.split('?')[0];
const live = /\/note\/live_photo\/save$/.test(path);
const imagefeed = /\/note\/imagefeed$/.test(path);
const pending = req.id == null ? null : 'minis.xhs.live.request.' + req.id;
const cacheKey = 'xhs_save_lp';
function parse(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
function noteIdFrom(text) {
  const form = /(?:^|[?&])note_id=([^&#]+)/.exec(text || '');
  let id = parse(text, null)?.note_id;
  if (!id && form) { try { id = decodeURIComponent(form[1]); } catch (_) {} }
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(id) ? id : null;
}
function run() {
  if (!res) {
    const id = noteIdFrom(req.body) || noteIdFrom(req.url);
    if (pending && id) $persistentStore.write(JSON.stringify({id, at: Date.now()}), pending);
    return {};
  }
  if (live) {
    const seen = pending ? parse($persistentStore.read(pending), null) : null;
    if (pending && seen) $persistentStore.write(null, pending);
    const id = noteIdFrom(req.url) || (seen && Date.now() - seen.at < 120000 ? seen.id : null);
    const rows = id ? parse($persistentStore.read(cacheKey), {})?.[id] : null;
    if (!Array.isArray(rows) || !rows.length) return {};
    const original = parse(res.body, null);
    if (Array.isArray(original?.data?.datas) && original.data.datas.length) {
      let changed = false;
      original.data.datas = original.data.datas.map(item => {
        const match = rows.find(r => r.file_id && r.file_id === item?.file_id || r.video_id && r.video_id === String(item?.video_id));
        if (!match) return item;
        changed = true;
        return Object.assign({}, item, {url: match.url});
      });
      return changed ? {body: JSON.stringify(original)} : {};
    }
    return {body: JSON.stringify({code: 0, success: true, msg: '成功', data: {datas: rows}})};
  }
  if (typeof res.body !== 'string' || !res.body) return {};
  let transformed;
  // Cache original streams. The upstream image enhancer can replace media URLs.
  if (imagefeed) {
    const raw = parse(res.body, null);
    const cache = Object.assign(Object.create(null), parse($persistentStore.read(cacheKey), {}));
    for (const item of Array.isArray(raw?.data) ? raw.data : []) {
      for (const note of Array.isArray(item?.note_list) ? item.note_list : []) {
        if (!note?.id || !Array.isArray(note.images_list)) continue;
        const rows = [];
        for (const img of note.images_list) {
          const media = img?.live_photo?.media;
          if (!media?.video_id) continue;
          const streams = ['h264', 'h265', 'h266', 'av1'].flatMap(k => Array.isArray(media.stream?.[k]) ? media.stream[k] : [])
            .filter(s => typeof s?.master_url === 'string' && /^https?:\/\//i.test(s.master_url));
          const chosen = streams.find(s => Number(s.stream_type) === 66) || streams.find(s => Number(s.default_stream) === 1) || streams[0];
          if (chosen) rows.push({video_id: String(media.video_id), file_id: img.live_photo_file_id || '', url: chosen.master_url});
        }
        if (rows.length) { delete cache[note.id]; cache[note.id] = rows; }
      }
    }
    for (const id of Object.keys(cache).slice(0, -30)) delete cache[id];
    $persistentStore.write(JSON.stringify(cache), cacheKey);
  }
  if (!/\/localfeed$/.test(path)) {
    // Isolate the synchronous upstream callback and suppress raw-body logging.
    try {
      const normalized = req.url.includes('?') ? req.url : req.url + '?';
      minisUpstream({...req, url: normalized}, res, x => { if (transformed === undefined) transformed = x || {}; }, {log() {}, warn() {}, error() {}});
    } catch (_) { /* upstream mismatch: retain original body */ }
  }
  const text = typeof transformed?.body === 'string' ? transformed.body : res.body;
  const data = parse(text, null);
  let changed = false;
  if (/\/(homefeed|localfeed)$/.test(path) && Array.isArray(data?.data)) {
    // Don't erase the whole feed if the server changes the item schema.
    if (data.data.some(item => item?.type === 'normal')) {
      const next = data.data.filter(item => item?.type === 'normal');
      changed = next.length !== data.data.length;
      data.data = next;
    }
  }
  if (imagefeed && Array.isArray(data?.data)) {
    for (const entry of data.data) {
      for (const note of Array.isArray(entry?.note_list) ? entry.note_list : []) {
        if (!note || typeof note !== 'object') continue;
        for (const flag of Array.isArray(note.function_switch) ? note.function_switch : []) {
          if (flag && /download/.test(flag.type || '')) { flag.enable = true; delete flag.reason; }
        }
        note.media_save_config = {...note.media_save_config, disable_save: false, disable_watermark: true, disable_weibo_cover: true};
        changed = true;
      }
    }
  }
  return changed ? {body: JSON.stringify(data)} : text === res.body ? {} : {body: text};
}
let result;
try { result = run(); } catch (_) { result = {}; }
$done(result);
