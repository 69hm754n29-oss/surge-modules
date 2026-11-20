# 小红书合并版

- 主模块和 JS 来自 [fmz200/wool_scripts](https://github.com/fmz200/wool_scripts)；本目录生成的合并 JS 按上游 GPL-3.0 分发，见 `COPYING`。对应源码是上游 JS、`template_dispatch.js` 和 `build.py`；`upstream.lock.json` 记录输入指纹。
- 墨鱼规则从 [Polly-ai/Wynston 的 Surge 镜像](https://github.com/Polly-ai/Wynston/blob/main/Surge/Module/XiaoHongShuAds.sgmodule) 同步。原站曾对旧脚本 URL 返回 HTML。合并版不复制其 JS；只在主脚本未覆盖的 URL 上引用构建时检查过的固定提交。镜像未同步的变化不会进入本模块。
- 同一接口只使用一个响应处理器：奶思＋本地处理优先，墨鱼用于补充；两套上游对共同接口的独有行为不承诺完全叠加。保留图文信息流过滤、额外 Map Local 和笔记实况的本地保存逻辑。未启用的 Feed 时间模块不纳入。
- 实况按请求 ID 配对，缓存保存在 Surge 本机，不上传。缓存未命中则放行原响应。请求和响应样本未纳入仓库，`test.js` 使用合成样本。
- `python3 xhs/build.py`（需 Node.js）重新构建。语法、常见接口及互斥路由检查通过后才替换产物，输入异常保留仓库上一版。GitHub Actions 每 6 小时检查，不保证 Surge 同步时刻与 Actions 一致。
- 安装时以远程 URL 导入模块，停用原 4 个模块但保留它们作为回退；小红书的重写及 MITM 仍需要启用。首次在真机核对首页、笔记下载与实况保存。
