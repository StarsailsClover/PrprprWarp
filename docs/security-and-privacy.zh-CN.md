# 安全与隐私

## 本地优先

PrprprWarp 不包含遥测、统计、云上传、账号或更新检查。抓取数据在导出或删除前
保存在扩展 IndexedDB，ZIP 通过浏览器下载。

扩展会访问被录制页面，并为缺失资源发起带凭据的后备请求。

## 敏感数据

归档可能含登录态 HTML/API 响应、页面文本、属性、非敏感 Storage、带 Query
<!-- G  itHub@Stars  a   il s C l   o  ver -->

的 URL、响应头和脚本。

Authorization、Cookie、Proxy Authorization、API Key、Auth Token、CSRF 等
请求/响应头默认替换为 `[redacted by PrprprWarp]`。

命中 Auth、Token、Secret、Password、Session、Credential、API Key 的 Storage
Key 默认脱敏；其他值会在 Live 模式恢复到 local/session Storage。

关闭脱敏会提高重放成功率，但只应对私有、可信归档使用。

## 脚本执行

- Snapshot 会移除脚本、内联事件、`javascript:` URL、`srcdoc` 与 Meta Refresh。
- Live 会在本地服务器中执行抓取到的脚本。
- 服务器只绑定 `127.0.0.1`。
- 不要把服务器暴露到 LAN、公网或反向代理。
- 只打开来源可信的 Live 归档。

## 浏览器权限

| 权限 | 原因 |
|---|---|
| `debugger` | 读取精确响应正文与导航网络事件 |
| `scripting` | 在每个 Frame 的 MAIN world 执行 DOM 序列化 |
| `tabs`, `webNavigation` | 跟随同 Host 路由 |
| `downloads` | 下载 ZIP |
| `offscreen` | 在 Service Worker 外运行 DOMParser/JSZip/Blob |
| `storage`, `unlimitedStorage` | 保存设置与大型本地会话 |

`debugger` 会产生浏览器警告，并且不能与目标标签页已打开的 DevTools 同时使用。

## 删除

删除会话会删除 IndexedDB 中的 Page 与 Resource。已经下载的 ZIP 是普通用户
文件，需要单独清理。
