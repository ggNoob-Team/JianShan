# 本机管理台内嵌 WebView TDD 证据

## 行为矩阵

| 场景                     | 期望行为                                                                    | 覆盖                                                          |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 桌面设置选择“本机管理台” | 右侧内容区不再显示普通设置卡片，而是进入整页管理台。                        | `settings-screen.tsx` 特殊布局                                |
| 管理台启动成功           | 顶部显示当前地址，并使用 Electron 专用持久化浏览器分区加载管理台。          | `local-admin-console-page.test.tsx`、Electron renderer export |
| 管理台内部导航           | 地址栏跟随当前 WebView URL 更新，“浏览器打开”使用最新地址。                 | `local-admin-console-page.test.tsx`                           |
| 点击“浏览器打开”         | 通过现有 Electron 外部链接桥接在系统浏览器打开当前管理台地址。              | `local-admin-console-page.test.tsx`                           |
| 管理台地址不可用         | 保留管理台说明和重试按钮，浏览器打开按钮禁用。                              | `local-admin-console-page.test.tsx`                           |
| 非 Electron 构建         | 不渲染管理台入口；Electron renderer 明确选择 `.electron.tsx` WebView 实现。 | `PASEO_WEB_PLATFORM=electron expo export` bundle 检查         |

## 红证据

新增 `local-admin-console-page.test.tsx` 时组件尚不存在，测试启动失败：

```text
Failed to resolve import "./local-admin-console-page"
```

## 绿证据

- `npx vitest run src/desktop/components/local-admin-console-page.test.tsx --project unit --bail=1` -> 3 passed。
- `npm run typecheck --workspace=@getpaseo/app` -> passed。
- 定向 lint -> 0 warnings, 0 errors。
- `npm run format:check` -> passed。
- `PASEO_WEB_PLATFORM=electron npx expo export --platform web` -> passed。
- 在 Electron renderer bundle 中确认使用 `document.createElement("webview")`，没有落入非 Electron 占位实现。

## 变异敏感性

将“浏览器打开”从当前 WebView URL 改为固定初始 URL 后，内部导航用例失败；恢复后通过。

## 未验证范围

尚未启动完整 Electron 安装包人工登录管理台；已验证页面交互、Electron 文件解析和最终 renderer bundle。真实 WebView 的登录会话与窗口尺寸仍需桌面运行验收。
