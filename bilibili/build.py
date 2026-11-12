#!/usr/bin/env python3
"""从上游自动生成「哔哩哔哩 · 增强 + 皮肤」合并模块。
上游：
  kokoryh/Sparkle  release/surge/module/bilibili.sgmodule、dist/bilibili.json.js
  ClydeTime/BiliBili  js/BiliBili.Modified.response.js
产物（与本脚本同目录）：
  bilibili.sgmodule / bilibili.allinone.js / bilibili.skin.js / upstream.lock.json
"""
import json, os, re, sys, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = 'https://raw.githubusercontent.com'
MY = f'{RAW}/69hm754n29-oss/surge-modules/main/bilibili'
SRC = {
    'module': f'{RAW}/kokoryh/Sparkle/master/release/surge/module/bilibili.sgmodule',
    'kk': f'{RAW}/kokoryh/Sparkle/master/dist/bilibili.json.js',
    'clyde': f'{RAW}/ClydeTime/BiliBili/main/js/BiliBili.Modified.response.js',
}

# 你的参数（安装后无需重填；Surge 参数表里仍可改）
MY_ARGS = [
    ('首页标签', '推荐|热门'), ('底部导航', '177|181'), ('动态最常访问', 'auto'), ('创作中心', '0'),
    ('过滤置顶评论广告', '1'), ('优化评论区加载', 'bilibili.protobuf.request'), ('空降助手', 'bilibili.airborne'),
    ('空降助手策略', 'DIRECT'), ('屏蔽P2P', 'DEST-PORT'), ('日志等级', '4'), ('自定义装扮', ''),
]
MY_ARG = '首页标签={{{首页标签}}}&底部导航={{{底部导航}}}&创作中心={{{创作中心}}}&日志等级={{{日志等级}}}&自定义装扮={{{自定义装扮}}}'
MY_SCRIPTS = [
    'bili-merge-json = type=http-response,pattern=^https?:\\/\\/(?:app\\.bilibili\\.com\\/x\\/(?:resource\\/show\\/tab\\/v2|v2\\/(?:account\\/(?:mine(?:\\/ipad)?|myinfo)|space))|api\\.bilibili\\.com\\/x\\/vip\\/(?:web\\/vip_center\\/combine|price\\/panel\\/lexi|top_panel_info))(?:\\?|$),requires-body=1,max-size=-1,timeout=20,engine=webview,script-path=' + MY + '/bilibili.allinone.js,argument="' + MY_ARG + '"',
    'bili-skin = type=http-response,pattern=^https?:\\/\\/app\\.bilibili\\.com\\/x\\/resource\\/show\\/skin(?:\\?|$),requires-body=1,max-size=-1,timeout=20,engine=webview,script-path=' + MY + '/bilibili.skin.js,argument="' + MY_ARG + '"',
]
DROP_UPSTREAM_SCRIPTS = {'bilibili.skin'}  # 皮肤改用 ClydeTime，由 bili-skin 负责


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'surge-modules-builder'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8')


def sections(text):
    meta, secs, cur = [], {}, None
    order = []
    for line in text.splitlines():
        s = line.strip()
        m = re.match(r'^\[(.+)\]$', s)
        if m:
            cur = m.group(1); secs.setdefault(cur, []); order.append(cur); continue
        if cur is None:
            meta.append(line)
        elif s:
            secs[cur].append(line)
    return meta, secs, order


def js_literal(obj):
    s = json.dumps(obj, ensure_ascii=False)
    return s.replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def main():
    up = {k: get(u) for k, u in SRC.items()}
    for k in ('kk', 'clyde'):
        if len(up[k]) < 5000:
            sys.exit(f'上游 {k} 内容异常（{len(up[k])} 字节），中止')
    meta, secs, order = sections(up['module'])
    if 'Script' not in secs or 'MITM' not in secs:
        sys.exit('上游模块结构变化（缺少 [Script]/[MITM]），中止，需人工检查')

    # 上游新增参数自动并入
    up_args = re.search(r'^#!arguments=(.*)$', up['module'], re.M)
    names = [a for a, _ in MY_ARGS]
    args = list(MY_ARGS)
    if up_args:
        for item in up_args.group(1).split(','):
            n, _, v = item.partition(':')
            n = n.strip()
            if n and n not in names:
                args.append((n, v.strip().strip('"'))); names.append(n)
    used = set(re.findall(r'\{\{\{(.+?)\}\}\}', up['module'] + MY_ARG))
    missing = used - set(names)
    if missing:
        sys.exit(f'占位符未声明：{missing}')

    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    build = f'{stamp}.auto'

    # 脚本：填入上游源码
    srcs = js_literal({'kk': up['kk'], 'clyde': up['clyde']})
    for tpl, out in (('template_allinone.js', 'bilibili.allinone.js'), ('template_skin.js', 'bilibili.skin.js')):
        t = open(os.path.join(HERE, tpl), encoding='utf-8').read()
        t = t.replace('/*__BILI_SOURCES__*/', srcs).replace('/*__BILI_BUILD__*/', build)
        open(os.path.join(HERE, out), 'w', encoding='utf-8').write(t)

    # 模块
    up_desc = re.search(r'^#!desc=(.*)$', up['module'], re.M)
    up_desc_args = re.search(r'^#!arguments-desc=(.*)$', up['module'], re.M)
    lines = [
        '#!name=哔哩哔哩 · 增强 + 皮肤（自动更新）',
        '#!desc=合并 kokoryh 增强与 ClydeTime 皮肤：去广告、空降助手、评论区净化、首页标签与底栏可自选、我的页精简、皮肤与账户展示。每天自动跟随上游重新生成。',
        '#!author=Minis / kokoryh / ClydeTime',
        '#!category=Minis',
        '#!system=ios',
        f'#!version={build}',
        '#!arguments=' + ','.join(f'{n}:"{v}"' for n, v in args),
        '#!arguments-desc=首页标签/底部导航：用 | 分隔，可填名字或 id，例如 推荐|热门、177|181；留空保留服务器原样。\\n可选标签：40 推荐 / 41 热门 / 39 直播 / 3502 动画 / 3503 影视；底栏：177 首页 / 179 动态 / 181 我的 / 670 发布 / 3609 会员购。\\n自定义装扮：装扮套装 id 或名字，留空用自带皮肤。\\n\\n以下为上游参数说明：\\n' + (up_desc_args.group(1) if up_desc_args else ''),
        '',
    ]
    for sec in order:
        body = list(secs[sec])
        if sec == 'Script':
            kept = []
            for l in body:
                name = l.split('=', 1)[0].strip()
                if name in DROP_UPSTREAM_SCRIPTS:
                    continue
                kept.append(l)
            body = MY_SCRIPTS + kept  # 自定义脚本在前：同一 URL 只执行第一个匹配
        if sec == 'MITM' and not any(l.strip().startswith('h2') for l in body):
            body.append('h2 = true')
        lines += [f'[{sec}]'] + body + ['']
    mod = '\n'.join(lines)
    open(os.path.join(HERE, 'bilibili.sgmodule'), 'w', encoding='utf-8').write(mod)

    lock = {k: __import__('hashlib').sha256(v.encode()).hexdigest()[:16] for k, v in up.items()}
    lock['upstream_desc'] = up_desc.group(1) if up_desc else ''
    open(os.path.join(HERE, 'upstream.lock.json'), 'w').write(json.dumps(lock, ensure_ascii=False, indent=1) + '\n')
    print('OK', build, lock)


if __name__ == '__main__':
    main()
