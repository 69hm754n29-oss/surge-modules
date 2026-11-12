#!/usr/bin/env python3
"""航旅纵横去广告：从 xingjiu29/Umetrip 的 Loon 插件自动转换为 Surge 模块。"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from _common import get, sections, write_lock, version

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'umetrip.sgmodule'))
BASE = 'https://raw.githubusercontent.com/xingjiu29/Umetrip/refs/heads/main/'
PLUGIN, JS = BASE + 'umetrip.plugin', BASE + 'umetrip.js'

up, js = get(PLUGIN), get(JS, 1000)
secs, _ = sections(up)
ns = {}
for k, v in secs.items():
    ns[k.lower()] = v
# Loon 的 response if ${url} ~= /re/i then script("...") with ...  ->  Surge 脚本行
script_lines = []
for l in ns.get('script', []):
    m = re.search(r'if\s+\$\{url\}\s*~=\s*/(.+?)/[a-z]*\s+then\s+script\("([^"]+)"\)(.*)$', l)
    if not m:
        continue
    pat, path, rest = m.groups()
    opts = []
    if re.search(r'requires[_]?body\s*=\s*(true|1)', rest): opts.append('requires-body=1')
    if re.search(r'binary[_]?body[_]?mode\s*=\s*(true|1)', rest): opts.append('binary-body-mode=1')
    to = re.search(r'timeout\s*=\s*(\d+)', rest)
    opts.append(f'timeout={to.group(1)}' if to else 'timeout=30')
    opts.append('max-size=300000')          # 脚本本身会跳过 >300KB 的响应
    opts.append('engine=webview')           # 用了 TextDecoder，只有 WebView 引擎有
    script_lines.append(
        'umetrip.native = type=http-response,pattern=' + pat.replace('\\/', '\\/') +
        ',requires-body=1,binary-body-mode=1,' + ','.join(o for o in opts if not o.startswith('requires-body') and not o.startswith('binary-body')) +
        ',script-path=' + path)
url_rw, map_local = [], []
for l in ns.get('rewrite', []):
    m = re.match(r'^(\S+)\s+-\s+reject$', l)
    if m:
        url_rw.append(f'{m.group(1)} - reject'); continue
    m = re.match(r'^(\S+)\s+-\s+reject-dict$', l)
    if m:
        map_local.append(f'{m.group(1)} data-type=text data="{{}}" status-code=200 header="Content-Type: application/json"')
out = [
    '#!name=航旅纵横去广告',
    '#!desc=精简首页、精简我的页面。由杏九的 Loon 插件（xingjiu29/Umetrip）每次自动转换为 Surge 模块。',
    '#!author=杏九 / Minis',
    '#!category=Minis',
    '#!system=ios',
    f'#!version={version()}',
]
for sec, body in (('Rule', ns.get('rule', [])), ('URL Rewrite', url_rw), ('Map Local', map_local),
                  ('Script', script_lines), ('MITM', ns.get('mitm', []))):
    if body:
        out += ['', f'[{sec}]'] + body
open(OUT, 'w').write('\n'.join(out) + '\n')
print('OK', OUT, 'scripts', len(script_lines), write_lock(os.path.join(HERE, 'upstream.lock.json'), {'plugin': up, 'js': js}))
