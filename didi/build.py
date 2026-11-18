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
# Keep this local customization in the builder so scheduled upstream syncs do
# not restore the Message/Itinerary tabs. Extend the existing core rewrite
# rather than adding a competing rule for the same response.
bottom_nav_filter = ('if (.data.disorder_cards.bottom_nav_list.data | type) == "array" '
                     'then .data.disorder_cards.bottom_nav_list.data |= '
                     'map(select(.id != "message_center" and .id != "itinerary")) '
                     'else . end')
body_rewrites = []
core_matches = 0
for line in secs.get('Body Rewrite', []):
    if line.startswith('http-response-jq ') and 'homepage' in line and 'core' in line:
        # Upstream uses a single-quoted jq expression. Refuse to publish if
        # that format changes instead of silently losing this customization.
        if " '" not in line or not line.endswith("'"):
            raise SystemExit('Unsupported upstream homepage/core rewrite format')
        line = line[:-1] + ' | ' + bottom_nav_filter + "'"
        core_matches += 1
    body_rewrites.append(line)
if core_matches != 1:
    raise SystemExit(f'Expected one upstream homepage/core rewrite, got {core_matches}')
out = [
    '#!name=滴滴出行（no-resolve）',
    '#!desc=跟随 ifflagged/Romeo 上游自动更新；IP-CIDR 规则加 no-resolve；隐藏底部消息和行程，保留原有去广告规则。',
    '#!author=树先生 / Minis',
    '#!category=Minis',
    '#!system=ios',
    f'#!version={version()}',
]
for sec in ('Rule', 'Body Rewrite', 'Map Local', 'MITM'):
    body = rules if sec == 'Rule' else body_rewrites if sec == 'Body Rewrite' else secs.get(sec, [])
    if body:
        out += ['', f'[{sec}]'] + body
open(OUT, 'w').write('\n'.join(out) + '\n')
print('OK', OUT, 'no-resolve', fixed, write_lock(os.path.join(HERE, 'upstream.lock.json'), {'module': up}))
