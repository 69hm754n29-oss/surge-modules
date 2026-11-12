#!/usr/bin/env python3
"""滴滴出行：跟随 ifflagged/Romeo 上游，IP-CIDR 补 no-resolve。"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _common import get, sections, write_lock, version

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'didi-noresolve.sgmodule'))
URL = 'https://raw.githubusercontent.com/ifflagged/Romeo/main/Modules/Surge/ishowshu/didi.sgmodule'

up = get(URL)
secs, order = sections(up)
fixed = 0
rules = []
for l in secs.get('Rule', []):
    if l.startswith('IP-CIDR') and 'no-resolve' not in l:
        l += ',no-resolve'; fixed += 1
    rules.append(l)
out = [
    '#!name=滴滴出行（no-resolve）',
    '#!desc=跟随 ifflagged/Romeo 上游自动更新；仅给 IP-CIDR 规则加 no-resolve，避免未命中域名被迫本地 DNS 解析。',
    '#!author=树先生 / Minis',
    '#!category=Minis',
    '#!system=ios',
    f'#!version={version()}',
]
for sec in ('Rule', 'Body Rewrite', 'Map Local', 'MITM'):
    body = rules if sec == 'Rule' else secs.get(sec, [])
    if body:
        out += ['', f'[{sec}]'] + body
open(OUT, 'w').write('\n'.join(out) + '\n')
print('OK', OUT, 'no-resolve', fixed, write_lock(os.path.join(HERE, 'upstream.lock.json'), {'module': up}))
