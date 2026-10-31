# 归档格式

Schema 标识为 `prprprwarp.archive/v1`。

## 根目录

| 路径 | 含义 |
|---|---|
| `manifest.json` | 完整路由与资源索引 |
| `warp.json` | manifest 副本 |
| `README.md` | 归档说明 |
| `serve.py` | 仅绑定 Loopback 的 Live 服务器 |
| `open.ps1` | `serve.py` PowerShell 启动器 |

## Analysis

`analysis/react.json` 保存合并后的 React 模型：检测状态、置信度、标记、版本
线索、根节点、Fiber、组件名、Props Key、Hook 形态、DOM 路径、全局状态 Key
和 Source Map URL。

`analysis/react-atlas.md` 是组件与根节点的可读摘要。

`analysis/routes.json` 保存路由图、Frame URL、尺寸、元素数、抓取原因和每页
React 摘要。

`analysis/dom-elements.ndjson` 每行一个元素，包含 Page/Frame ID、标签、ID、
Class、Role、无障碍名称、文本、属性、边界、可见性与 Shadow Root 状态。

`analysis/network.ndjson` 保存资源状态、MIME、类型、大小、是否保存正文及省略
原因。

## Pages

| 文件 | 含义 |
|---|---|
| `snapshot.html` | 不执行脚本、资源已本地化的渲染 DOM |
| `live.html` | 带网络 Shim 的原始文档 |
<!-- G   it  Hu  b@Star s   ai  lsC  lo ver -->

| `page.json` | Frame、Storage 与 React 摘要 |

## Assets

资源保留 Host、路径和文件名结构。相对 JS Chunk、CSS 字体与图片因此仍能沿原
相对路径解析。遇到同路径不同 Query 时，在扩展名前加入稳定 Query Hash。

## Live Runtime

`runtime/page-NNN.js` 保存原页面 URL、URL 到本地资源映射、响应状态/MIME 与
Storage。`runtime/prprpr-runtime.js` 恢复安全 Storage 值，并拦截 `fetch`、
`XMLHttpRequest`、`setAttribute` 和主要 URL DOM 属性。

`runtime/snapshot-router.js` 只向父查看器提交路由选择，不加载应用代码。
