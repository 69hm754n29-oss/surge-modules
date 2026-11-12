# surge-modules

跟随上游自动重建的 Surge 模块。GitHub Actions 每 6 小时运行一次 `build_all.sh`，有变化才提交。

| 模块 | 安装链接 | 上游 |
|---|---|---|
| 哔哩哔哩 · 增强 + 皮肤（自动更新） | `bilibili/bilibili.sgmodule` | kokoryh/Sparkle + ClydeTime/BiliBili |
| YouTube 合并版（省内存） | `youtube-merged.sgmodule` | gholts/surge + Maasea/sgmodule |
| 滴滴出行（no-resolve） | `didi-noresolve.sgmodule` | ifflagged/Romeo |
| 百度贴吧去广告（no-resolve） | `tieba-noresolve.sgmodule` | app2smile/rules |
| 航旅纵横去广告 | `umetrip.sgmodule` | xingjiu29/Umetrip（Loon→Surge 自动转换） |
| 重启记录器 | `restart-logger.sgmodule` | 本地，无上游 |

本地重建：`sh build_all.sh`（需要 python3 和 node）。
