#!/usr/bin/env python3
"""百度贴吧去广告：跟随 app2smile/rules 上游，RULE-SET 补 no-resolve。"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _common import get, sections, write_lock, version

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
out = [
    '#!name=百度贴吧去广告（no-resolve）',
    '#!desc=跟随 app2smile/rules 上游自动更新；规则集加 no-resolve，避免未命中域名被迫本地 DNS 解析。',
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
    body = rules if sec == 'Rule' else secs.get(sec, [])
    if body:
        out += ['', f'[{sec}]'] + body
open(OUT, 'w').write('\n'.join(out) + '\n')
print('OK', OUT, 'no-resolve', fixed, write_lock(os.path.join(HERE, 'upstream.lock.json'), {'module': up}))
