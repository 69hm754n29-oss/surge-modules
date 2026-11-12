"""各 build.py 共用的小工具。"""
import hashlib, json, os, re, urllib.request

def get(url, min_size=200):
    req = urllib.request.Request(url, headers={'User-Agent': 'surge-modules-builder'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read().decode('utf-8')
    if len(data) < min_size:
        raise SystemExit(f'上游内容异常（{len(data)} 字节）：{url}')
    return data

def sections(text):
    secs, order, cur = {}, [], None
    for line in text.splitlines():
        s = line.strip()
        m = re.match(r'^\[(.+)\]$', s)
        if m:
            cur = m.group(1); secs.setdefault(cur, []); order.append(cur); continue
        if cur and s:
            secs[cur].append(line)
    return secs, order

def meta(text, key):
    m = re.search(rf'^#!{re.escape(key)}=(.*)$', text, re.M)
    return m.group(1).strip() if m else ''

def write_lock(path, urls_text: dict, extra=None):
    d = {k: hashlib.sha256(v.encode()).hexdigest()[:16] for k, v in urls_text.items()}
    d.update(extra or {})
    open(path, 'w').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
    return d

def version():
    import datetime
    return f'{datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d.%H%M}'
