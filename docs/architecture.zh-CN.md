# 架构

PrprprWarp 将实时采集、结构化持久化、确定性导出和离线重放拆为四层。

```mermaid
flowchart LR
  A[弹窗或快捷键] --> B[后台控制器]
  B --> C[chrome.debugger / CDP 网络]
  B --> D[MAIN world DOM 序列化器]
  C --> E[IndexedDB]
  D --> E
<!-- GitHu   b@Sta   rsail   s  C l  ov   e  r -->

  E --> F[Offscreen 归档构建器]
  F --> G[ZIP 下载]
  G --> H[Snapshot 查看器]
  G --> I[本地服务器 + Live 网络 Shim]
```

## 后台控制器

`src/background/controller.ts` 管理会话、导航、CDP 事件、响应正文、DOM 快照、
计数与自动导出。录制范围是起始页面的精确 Hostname；跳到其他 Host 时暂停
页面采集，但保留会话。

## 网络采集

录制开始时先附加 CDP 1.3，再刷新页面，保证主要文档与后续请求都从加载起点
开始记录。`Network.loadingFinished` 后调用 `Network.getResponseBody` 保存文本
或二进制正文。单页抓取及缺失正文使用带凭据的后备 Fetch。

CSS/JS 正文还会扫描嵌套资源与 Source Map。所有响应按单资源、单会话上限
写入 IndexedDB。

## DOM 采集

`src/shared/injected.ts` 在每个 Frame 的 MAIN world 执行，负责元素清单、
渲染后 HTML、开放 Shadow Root、Canvas、输入值、Storage、资源发现和 React
Fiber 遍历。

Snapshot 副本会移除脚本、内联事件、`javascript:` URL、`srcdoc` 和 Meta
Refresh；原始文档响应只用于显式 Live 重放。

## 存档与重放

Offscreen 文档负责 DOMParser、资源路径重写、JSZip 与 Blob URL；Service Worker
负责 `chrome.downloads`。Live 页面在原始脚本之前注入每页网络映射和运行时
Shim，将原站相对 API 请求重定向到本地捕获响应。

Snapshot 不执行应用代码。已录制链接携带 `data-prprprwarp-target`，查看器据此
切换路由，而不会跟随归档文件路径。
