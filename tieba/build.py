#!/usr/bin/env python3
"""百度贴吧去广告：跟随 app2smile/rules 上游，RULE-SET 补 no-resolve。"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _common import get, sections, write_lock, version
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'tieba-noresolve.sgmodule'))
URL = 'https://raw.githubusercontent.com/app2smile/rules/master/module/tieba.sgmodule'

up = get(URL)
secs, order = sections(up)
rules, fixed = [], 0
for l in secs.get('Rule', []):
    if l.startswith(('RULE-SET', 'IP-CIDR', 'IP-CIDR6', 'IP-ASN', 'GEOIP')) and 'no-resolve' not in l:
        l += ',no-resolve'; fixed += 1
    rules.append(l)
# Keep app2smile's complete ad filter; compose local UI customization before
# its one completion call. Fail closed if upstream changes the entry shape.
SCRIPT_URL = 'https://raw.githubusercontent.com/app2smile/rules/master/js/tieba-json.js'
LOCAL_SCRIPT_URL = 'https://raw.githubusercontent.com/69hm754n29-oss/surge-modules/main/tieba/tieba-json.js'
up_js = get(SCRIPT_URL)
ui_js = open(os.path.join(HERE, 'template_ui.js')).read()
if len(re.findall(r'\$done\s*\(', up_js)) != 1 or up_js.count('$done({') != 1:
    raise SystemExit('Upstream completion changed; review UI integration')
if up_js.count('body = JSON.stringify(body);') != 1:
    raise SystemExit('Upstream serialization changed; review UI integration')
fallback = '} else {\n    $notification.post(notifyTitle, "路径/请求方法匹配错误:", method + "," + url);\n}'
if up_js.count(fallback) != 1:
    raise SystemExit('Upstream fallback changed; review UI integration')
combined_js = up_js.replace('body = JSON.stringify(body);',
    'body = tiebaCleanUI(body, url);\nbody = JSON.stringify(body);', 1)
combined_js = combined_js.replace(fallback,
    '} else if (!url.split("?")[0].endsWith("/c/u/user/profile")) {\n'
    '    $notification.post(notifyTitle, "路径/请求方法匹配错误:", method + "," + url);\n}', 1)
combined_js += '\n' + ui_js
scripts = []
matched = 0
for line in secs.get('Script', []):
    if SCRIPT_URL in line:
        if r'c\/(s\/sync|' not in line:
            raise SystemExit('Upstream JSON pattern changed; review profile routing')
        line = line.replace(r'c\/(s\/sync|', r'c\/(u\/user\/profile|s\/sync|', 1)
        line = line.replace(SCRIPT_URL, LOCAL_SCRIPT_URL)
        matched += 1
    scripts.append(line)
if matched != 1:
    raise SystemExit(f'Expected one upstream JSON script, got {matched}')
open(os.path.join(HERE, 'tieba-json.js'), 'w').write(combined_js)
out = [
    '#!name=百度贴吧去广告（no-resolve）',
    '#!desc=跟随 app2smile/rules 上游自动更新；规则集保留 no-resolve；隐藏首页直播、我的页四格、钱包、推广横幅、游戏专区及会员横幅。',
    '#!author=app2smile / Minis',
    '#!category=Minis',
    '#!system=ios',
    f'#!version={version()}',
]
arg = next((l for l in up.splitlines() if l.startswith('#!arguments=')), '')
argd = next((l for l in up.splitlines() if l.startswith('#!arguments-desc=')), '')
if arg: out.append(arg)
if argd: out.append(argd)
for sec in ('Rule', 'Body Rewrite', 'Map Local', 'Script', 'MITM'):
    body = rules if sec == 'Rule' else scripts if sec == 'Script' else secs.get(sec, [])
    if body:
        out += ['', f'[{sec}]'] + body
open(OUT, 'w').write('\n'.join(out) + '\n')
print('OK', OUT, 'no-resolve', fixed, write_lock(os.path.join(HERE, 'upstream.lock.json'), {'module': up, 'json': up_js, 'ui': ui_js}))
