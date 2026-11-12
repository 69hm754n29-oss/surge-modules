#!/usr/bin/env python3
"""生成「YouTube 合并版」：以本地已生效的模块为骨架，
每次从上游重新取 gholts / Maasea 的脚本与改写，合并后输出 ../youtube-merged.sgmodule。
路径不变，Surge 里已安装的模块会自己更新。
"""
import hashlib, json, os, re, sys, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
SKELETON = os.path.join(HERE, 'skeleton.sgmodule')
OUT = os.path.normpath(os.path.join(HERE, '..', 'youtube-merged.sgmodule'))
R = 'https://raw.githubusercontent.com'
SRC = {
    'gholts': f'{R}/gholts/surge/main/modules/youtube-enhance.sgmodule',
    'maasea': f'{R}/Maasea/sgmodule/master/YouTube.Enhance.sgmodule',
}


def get(u):
    req = urllib.request.Request(u, headers={'User-Agent': 'surge-modules-builder'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8')


def sections(text):
    secs, cur = {}, None
    for line in text.splitlines():
        s = line.strip()
        m = re.match(r'^\[(.+)\]$', s)
        if m:
            cur = m.group(1); secs.setdefault(cur, []); continue
        if cur and s:
            secs[cur].append(line)
    return secs


def main():
    up = {k: get(u) for k, u in SRC.items()}
    if len(up['gholts']) < 500 or len(up['maasea']) < 500:
        sys.exit('上游模块内容异常，中止')
    g, m = sections(up['gholts']), sections(up['maasea'])
    # 本地已生效的参数优先（例如 blockShorts=true），避免重新生成后被上游默认值改掉
    local = {}
    for line in open(SKELETON, encoding='utf-8').read().splitlines():
        mm = re.match(r'^(\S+)\s*=\s*type=', line)
        if not mm:
            continue
        a = re.search(r'argument=("?\{.*?\}"?)(?:,requires|,script|,timeout|,engine|$)', line)
        if a:
            try:
                local[mm.group(1).strip()] = json.loads(a.group(1).strip('"'))
            except Exception:
                pass
    local_alias = {
        'block_shorts': local.get('youtube.enhance.response', {}).get('blockShorts'),
        'block_vertical_live': local.get('youtube.enhance.response', {}).get('blockVerticalLive'),
    }
    args_text = ' '.join(up.values())
    defaults = {}
    for mod in (up['gholts'], up['maasea']):
        for line in mod.splitlines():
            if line.startswith('#!arguments='):
                for item in line[len('#!arguments='):].split(','):
                    k, _, v = item.partition(':')
                    defaults.setdefault(k.strip(), v.strip().strip('"'))

    def expand(text):
        for k, v in defaults.items():
            text = text.replace('{{{' + k + '}}}', v)
        return text
    for k, v in local_alias.items():
        if v is not None and ('{{{' + k + '}}}') in args_text:
            defaults[k] = 'true' if v is True else ('false' if v is False else str(v))
    g = {k: [expand(x) for x in v] for k, v in g.items()}
    m = {k: [expand(x) for x in v] for k, v in m.items()}
    sk = sections(open(SKELETON, encoding='utf-8').read())
    if not sk.get('Script'):
        sys.exit('骨架文件缺少 [Script]，中止')

    # 上游脚本：gholts 全部改用 WebView；Maasea 的 youtube.response patterns 更宽，留作兜底
    scripts = []
    for l in g.get('Script', []):
        l = re.sub(r'engine=jsc', 'engine=webview', l)
        if 'engine=' not in l:
            l = l.replace('script-path=https', 'engine=webview,script-path=https', 1) if 'script-path=' in l else l
        scripts.append(l)
    for l in m.get('Script', []):
        if l.split('=', 1)[0].strip() == 'youtube.response':
            l = re.sub(r'engine=jsc', 'engine=webview', l)
            scripts.append(l.replace('youtube.response =', 'youtube.maasea.fallback =', 1))
    # 骨架里 Music 模块带来的本地脚本（如有）保留
    keep = [l for l in sk['Script'] if l.split('=', 1)[0].strip() not in
            {s.split('=', 1)[0].strip() for s in scripts}]
    scripts += keep
    # 兜底脚本：用本地已生效的 argument（上游模块本身不带），否则上游传入的会被改写
    fb_old = [l for l in sk['Script'] if l.split('=', 1)[0].strip() == 'youtube.maasea.fallback']
    fb_new = [l for l in scripts if l.split('=', 1)[0].strip() == 'youtube.maasea.fallback']
    if fb_old and fb_new:
        arg_old = re.search(r'argument=("?\{.*?\}"?)', fb_old[0])
        if arg_old:
            i = scripts.index(fb_new[0])
            scripts[i] = re.sub(r'argument=("?\{.*?\}"?)', 'argument=' + arg_old.group(1), fb_new[0])
        else:
            scripts[scripts.index(fb_new[0])] = re.sub(r',?argument=("?\{.*?\}"?)', '', fb_new[0])

    def merge(sec, *sources):
        out, seen = [], set()
        for src in sources:
            for l in src.get(sec, []):
                if l not in seen:
                    seen.add(l); out.append(l)
        return out
    rew = merge('URL Rewrite', g, m, sk)
    maps = merge('Map Local', g, m, sk)
    rules = merge('Rule', sk)          # Music 的 UDP 屏蔽等本地规则
    mitm = merge('MITM', sk)

    out = [
        '#!name=YouTube 合并版（省内存）',
        '#!desc=合并 YouTube Enhance(gholts) + Youtube去广告(Maasea) + Youtube (Music) Enhance 的生效内容，行为与三者同时启用一致。全部脚本使用 WebView 引擎，内存不计入 Surge 主进程。每 6 小时跟随上游重新生成。',
        '#!author=Minis / gholts / Maasea',
        '#!category=Minis',
        '#!system=ios',
        f"#!version={datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d.%H%M}",
    ]
    for name, body in (('Rule', rules), ('URL Rewrite', rew), ('Map Local', maps), ('Script', scripts), ('MITM', mitm)):
        if body:
            out += ['', f'[{name}]'] + body
    open(OUT, 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    lock = {k: hashlib.sha256(v.encode()).hexdigest()[:16] for k, v in up.items()}
    open(os.path.join(HERE, 'upstream.lock.json'), 'w').write(json.dumps(lock, indent=1) + '\n')
    print('OK', OUT, lock)


if __name__ == '__main__':
    main()
