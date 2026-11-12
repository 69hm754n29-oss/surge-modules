#!/bin/sh
# 依次重建所有跟随上游的模块
set -e
cd "$(dirname "$0")"
for m in bilibili didi tieba umetrip youtube; do
  [ -f "$m/build.py" ] && { echo "== $m"; python3 "$m/build.py"; }
done
