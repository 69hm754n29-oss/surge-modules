#!/usr/bin/env python3
"""Build a single Surge module, keeping deterministic script precedence."""
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from _common import get, sections, write_lock

FMZ = 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/'
MIRROR = 'https://raw.githubusercontent.com/Polly-ai/Wynston/main/'
BASE = 'https://raw.githubusercontent.com/69hm754n29-oss/surge-modules/main/xhs/'
fmz_mod = get(FMZ + 'Surge/module/split/partX/Xiaohongshu.sgmodule')
fmz_js = get(FMZ + 'Scripts/xiaohongshu/xiaohongshu.js')
mirror_sha = json.loads(get('https://api.github.com/repos/Polly-ai/Wynston/commits/main'))['sha']
if not re.fullmatch(r'[0-9a-f]{40}', mirror_sha):
    raise SystemExit('Unexpected mirror revision')
mirror_snapshot = MIRROR.replace('/main/', f'/{mirror_sha}/')
ddg_mod = get(mirror_snapshot + 'Surge/Module/XiaoHongShuAds.sgmodule')
ddg_asset = 'Surge/JavaScript/XiaoHongShu/redbook.ads.js'
ddg_js = get(mirror_snapshot + ddg_asset)
# Pin the script's own revision, not the mirror repo's unrelated daily commits.
script_sha = json.loads(get('https://api.github.com/repos/Polly-ai/Wynston/commits?per_page=1&sha=' + mirror_sha + '&path=' + ddg_asset))[0]['sha']
if not re.fullmatch(r'[0-9a-f]{40}', script_sha):
    raise SystemExit('Unexpected mirror script revision')
ddg_path = MIRROR.replace('/main/', f'/{script_sha}/') + ddg_asset
if get(ddg_path) != ddg_js:
    raise SystemExit('Mirror module/script snapshot mismatch')
template = (HERE / 'template_dispatch.js').read_text()

def active(text, section):
    return [s.strip() for s in sections(text)[0].get(section, []) if not s.lstrip().startswith((';', '#'))]

def scripts(src, kind):
    out = []
    for line in active(src, 'Script'):
        match = re.search(r'\bpattern=([^,]+)', line)
        url = re.search(r'\bscript-path=([^, ]+)', line)
        if not match or not url or 'type=http-response' not in line or 'binary-body-mode' in line:
            raise SystemExit(f'{kind} script declaration changed; review required')
        path = url[1]
        if kind == 'fmz' and not re.fullmatch(r'https://(?:github\.com/fmz200/wool_scripts/raw|raw\.githubusercontent\.com/fmz200/wool_scripts)/main/Scripts/xiaohongshu/xiaohongshu\.js', path):
            raise SystemExit('FMZ script path changed')
        if kind == 'ddg' and path != MIRROR + ddg_asset:
            raise SystemExit('Mirror script path changed')
        p = match[1].strip()
        if not p.startswith('^https'):
            raise SystemExit('Unexpected pattern grammar')
        re.compile(p)
        out.append(p)
    if not out:
        raise SystemExit(f'{kind} has no usable scripts')
    return list(dict.fromkeys(out))

def reject_html(source):
    if source.lstrip('\ufeff \n\r\t').startswith('<'):
        raise SystemExit('Upstream returned HTML, not JavaScript')

reject_html(fmz_js)
reject_html(ddg_js)
if fmz_js.count('$done({body: JSON.stringify(obj)});') != 1:
    raise SystemExit('FMZ callback shape changed; review required')
combined = '// SPDX-License-Identifier: GPL-3.0-only\n// Upstream: fmz200/wool_scripts; see SOURCE.md and COPYING.\n' + \
    'function minisUpstream($request, $response, $done, console) {\n' + fmz_js + '\n}\n' + \
    '(function () {\n' + template + '\n})();\n'
fmz = scripts(fmz_mod, 'fmz')
ddg = scripts(ddg_mod, 'ddg')
feed = r'^https?:\/\/[a-z]+\.xiaohongshu\.com\/api\/sns\/v\d+\/(?:homefeed|localfeed)(?:\?|$)'
live = r'^https?:\/\/(?:edith|rec|www)\.(?:xiaohongshu|rnote)\.com\/api\/sns\/v\d+\/note\/live_photo\/save(?:\?|$)'
primary = '(?:' + '|'.join(dict.fromkeys([*fmz, feed, live])) + ')'
secondary = '^(?!' + primary + ')(?:' + '|'.join(ddg) + ')'
for pat in [primary, secondary, live]:
    re.compile(pat)

maps = []
for line in [*active(fmz_mod, 'Map Local'), *active(ddg_mod, 'Map Local')]:
    # The legacy prefix also swallowed splash_config before the ad script ran.
    line = line.replace(r'\/system_service\/splash ', r'\/system_service\/splash(?:\?|$) ')
    if line not in maps:
        maps.append(line)
mitm = []
for line in [*active(fmz_mod, 'MITM'), *active(ddg_mod, 'MITM')]:
    if not line.startswith('hostname = %APPEND% '):
        raise SystemExit('MITM grammar changed; review required')
    mitm += list(map(str.strip, line.split('%APPEND%', 1)[1].split(',')))
rules = list(dict.fromkeys([*active(fmz_mod, 'Rule'), *active(ddg_mod, 'Rule')]))
rev = hashlib.sha256((fmz_mod + ddg_mod + fmz_js + ddg_js + template).encode()).hexdigest()[:12]
module = '\n'.join([
    '#!name=小红书合并版（自动跟随上游）',
    '#!desc=奶思上游 + 墨鱼镜像 + 图文信息流过滤 + 笔记实况保存。无需同时开启旧模块。',
    '#!author=fmz200 / ddgksf2013 / Polly-ai / Minis',
    '#!system=ios', '#!version=' + rev,
    '', '[Rule]', *rules, '', '[Map Local]', *maps, '', '[Script]',
    f'XHS-Combined-Response = type=http-response,pattern={primary},script-path={BASE}xhs-combined.js,requires-body=true,max-size=4194304,timeout=30,script-update-interval=21600',
    f'XHS-Extras-Response = type=http-response,pattern={secondary},script-path={ddg_path},requires-body=true,max-size=1048576,timeout=10,script-update-interval=21600',
    f'XHS-Live-Request = type=http-request,pattern={live},script-path={BASE}xhs-combined.js,requires-body=true,max-size=262144,timeout=5',
    '', '[MITM]', 'hostname = %APPEND% ' + ', '.join(dict.fromkeys(mitm)), ''
])
# Test candidate artifacts before replacing the last known good build.
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    (tmp / 'fmz.js').write_text(combined)
    (tmp / 'ddg.js').write_text(ddg_js)
    (tmp / 'module').write_text(module)
    for path in [tmp / 'fmz.js', tmp / 'ddg.js']:
        subprocess.run(['node', '--check', str(path)], check=True)
    subprocess.run(['node', str(HERE / 'test.js'), str(tmp / 'fmz.js'), str(tmp / 'module')], check=True)
(HERE / 'xhs-combined.js').write_text(combined)
(ROOT / 'xiaohongshu-merged.sgmodule').write_text(module)
write_lock(HERE / 'upstream.lock.json', {'fmz-module': fmz_mod, 'fmz-script': fmz_js, 'ddg-mirror-module': ddg_mod, 'ddg-mirror-script': ddg_js})
print('OK xiaohongshu-merged.sgmodule', rev)
