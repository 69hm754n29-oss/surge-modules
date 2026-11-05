// Surge 重启/网络切换记录器：engine-started 与 network-changed 时写入 $persistentStore
(function () {
  var KEY = 'minis_restart_log';
  var n = (typeof $network !== 'undefined' && $network) ? $network : {};
  var v4 = n.v4 || {};
  var wifi = n.wifi || {};
  var ev = (typeof $event !== 'undefined' && $event && $event.name) ? $event.name : 'unknown';
  var rec = {
    t: new Date().toISOString(),
    ev: ev,
    if: v4.primaryInterface || '',
    ip: v4.primaryAddress || '',
    ssid: wifi.ssid || '',
    cell: n['cellular-data'] ? (n['cellular-data'].radio || '') : '',
    build: (typeof $environment !== 'undefined' && $environment) ? ($environment['surge-build'] || '') : ''
  };
  var arr = [];
  try { arr = JSON.parse($persistentStore.read(KEY) || '[]'); } catch (e) { arr = []; }
  arr.push(rec);
  if (arr.length > 300) arr = arr.slice(-300);
  $persistentStore.write(JSON.stringify(arr), KEY);
  $done();
})();
