const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(process.argv[2], 'utf8');
const moduleText = fs.readFileSync(process.argv[3], 'utf8');
const rules = [...moduleText.matchAll(/^(XHS-[^ ]+) = .*?pattern=([^,]+),/gm)].map(m => [m[1], new RegExp(m[2])]);
assert.equal(rules.length, 3);
const cache = new Map();
const api = p => 'https://edith.xiaohongshu.com/api/sns/' + p;
function run(path, data, req = {}) {
  const results = [];
  const context = {$request: {url: api(path), ...req}, $done: result => results.push(result),
    $httpClient: {}, $persistentStore: {read: k => cache.get(k) ?? null, write: (v,k) => v === null ? cache.delete(k) : cache.set(k,v)}, console};
  if (data !== undefined) context.$response = {body: JSON.stringify(data)};
  vm.runInNewContext(code, context, {timeout: 1500});
  assert.equal(results.length, 1);
  return results[0].body ? JSON.parse(results[0].body) : data;
}
const fixtures = {data: [{type:'normal', id:1}, {type:'video'}, {type:'normal', ads_info: {}}, {type:'normal', model_type:'live_v2'}]};
assert.deepEqual(run('v6/homefeed?test=1',fixtures).data, [{type:'normal',id:1}]);
assert.deepEqual(run('v4/localfeed',fixtures).data.map(x=>x.type), ['normal','normal','normal']);
assert.deepEqual(run('v6/homefeed?test=1',{data:[{type:'unknown'}]}).data,[{type:'unknown'}]);
assert.deepEqual(run('v1/system_service/splash_config', {data:{ads_groups:[{ads:[{}]}]}}).data.ads_groups[0].ads[0].start_time, 3818332800);
assert.deepEqual(run('v2/search/notes?q=demo',{data:{items:[{model_type:'ad'},{model_type:'note'}]}}).data.items,[{model_type:'note'}]);
for (const id of ['A','B']) {
  const url = 'https://example.org/' + id;
  const note = {id, function_switch:[{type:'image_download',enable:false,reason:'disabled'}],
    images_list:[{live_photo_file_id:id, live_photo:{media:{video_id:id,stream:{h264:[{stream_type:66,master_url:url}]}}}}]};
  const out = run('v1/note/imagefeed', {data:[{note_list:[note]}]});
  assert.equal(out.data[0].note_list[0].media_save_config.disable_save,false);
  assert.deepEqual(out.data[0].note_list[0].function_switch[0],{type:'image_download',enable:true});
  run('v1/note/live_photo/save',undefined,{id,body:'note_id='+id});
}
for (const id of ['B','A']) {
  const out = run('v1/note/live_photo/save',{code:-1},{id});
  assert.equal(out.data.datas[0].url,'https://example.org/'+id);
  assert.equal(cache.has('minis.xhs.live.request.'+id),false);
}
assert.deepEqual(run('v1/note/live_photo/save',{code:-1},{id:'unpaired'}),{code:-1});
const matched = (p,type) => rules.filter(([name,re])=>name.endsWith(type)&&re.test(api(p))).map(([name])=>name);
for (const p of ['v6/homefeed?q=1','v4/localfeed','v1/note/imagefeed','v1/note/live_photo/save','v1/system_service/splash_config','v2/search/notes?q=x']) assert.deepEqual(matched(p,'Response'),['XHS-Combined-Response']);
for (const p of ['v1/note/tabfeed','v1/note/redtube?q=1','v6/homefeed/categories']) assert.deepEqual(matched(p,'Response'),['XHS-Extras-Response']);
assert.deepEqual(matched('v1/note/live_photo/save','Request'),['XHS-Live-Request']);
assert.deepEqual(matched('v1/note/imagefeed','Request'),[]);
for (const line of moduleText.split('\n').filter(x=>x.startsWith('^https') && x.includes('status-code='))) assert(!new RegExp(line.split(' ')[0]).test(api('v1/system_service/splash_config')));
console.log('PASS: feed, launch, search, imagefeed, concurrent Live Photo save, and non-overlapping Surge routes');
