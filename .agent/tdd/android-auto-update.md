# Android 自动更新检测 TDD 证据

## 行为矩阵

| 场景                         | 期望行为                                                | 覆盖                                       |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------ |
| 发布版本高于当前版本         | 自动检测为有更新，并保留下载 URL、大小和发布时间。      | `android-app-update.test.ts`               |
| 当前版本等于发布版本         | 显示已是最新版本，不弹更新提示。                        | `android-app-update.test.ts`               |
| 预发布版本比较               | `beta.10` 高于 `beta.2`，正式版高于同核心预发布版。     | `android-app-update.test.ts`               |
| 发布 JSON 非法               | 缺少版本、非 HTTPS 下载地址或网络失败时返回可展示错误。 | `android-app-update.test.ts`               |
| Production Android           | 启动、回到前台和手动检查会请求最新发布信息。            | `android-app-update-provider.tsx`          |
| F-Droid / 开发版 / iOS / Web | 不启用 Android APK 自动更新。                           | `shouldCheckAndroidAppUpdate` runtime gate |
| 发现更新                     | 显示可关闭的更新提示，按钮用系统浏览器打开 APK。        | `android-app-update-source.tsx`            |
| 设置页                       | 关于页可手动检查并下载更新。                            | `settings-screen.tsx`                      |

## 红证据

- 新增测试首次运行失败：`Cannot find module './android-app-update'`，确认功能尚不存在。

## 绿证据

- `npx vitest run packages/app/src/android/updates/android-app-update.test.ts --bail=1` -> 6 passed。
- `npm run typecheck --workspace=@getpaseo/app` -> passed。
- 定向 `npm run lint -- packages/app/src/android/updates ...` -> passed。

## 变异敏感性

- 将版本判断从 `comparison < 0` 改为 `comparison > 0` 后，版本比较测试失败（exit 1），恢复后通过。
