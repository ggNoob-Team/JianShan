# Android 启动首屏品牌图标修复证据

## 行为矩阵

| 场景             | 期望行为                                                   | 验证                                                    |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Android 冷启动   | 首屏显示当前见山“双峰+太阳”图标，不再显示旧 Paseo 蝴蝶。   | Expo prebuild 生成的 `splashscreen_logo.png` 已逐级检查 |
| Android 浅色主题 | 在现有白色启动背景上使用深绿圆角图标，图标边缘和文字清晰。 | `splash-icon.png` 实际查看                              |
| Android 深色主题 | 同一见山图标可辨识，不依赖旧 Paseo 素材。                  | 图标包含透明圆角与高对比浅色山形                        |
| Android 通知栏   | 单色通知图标也使用当前见山山形，而不是旧蝴蝶。             | `notification-icon.png` 合成到深色背景后查看            |
| 各 Android 密度  | mdpi、hdpi、xhdpi、xxhdpi、xxxhdpi 均由新源图重新生成。    | `npx expo prebuild --platform android --no-install`     |

## 修复前证据

- `packages/app/assets/images/splash-icon.png` 修复前 SHA-256 为 `424a16809f71b6d0df230e4f76c4462b9cc36087065d400fef20e8b28565e198`。
- 生成的 `drawable-xxxhdpi/splashscreen_logo.png` SHA-256 为 `5021d3b0a506a16db1f4964d11dc0a069e2adb94ed356c009573c78fc7b7a8d5`。
- 实际查看原生资源确认仍是旧 Paseo 蝴蝶图。

## 修复后证据

- 新 `splash-icon.png` 为 1024×1024 RGBA，从当前 `icon.png` 生成圆角透明边，SHA-256 为 `7a53281ee19e56f35d098ac390a7823eff048dc9913ec9133b26907131dad4aa`。
- 新 `notification-icon.png` 为 96×96 RGBA 见山单色标，SHA-256 为 `af2dfdd8e1c5c2e35b6734e881ec87adc2886987054712e8e8efb78801fb30ec`。
- 重新执行 Expo prebuild 后，生成的 `drawable-xxxhdpi/splashscreen_logo.png` SHA-256 为 `99c485382cdc3a1eb5843106b82fe781f8a345b089db1e1a73c2e326d2d89c6b`。
- 实际查看生成的 mdpi 到 xxxhdpi 启动图，均显示当前见山图标。
- `npx vitest run app.config.test.ts --project unit --bail=1` -> 4 passed。
- `npm run format:check` -> passed。

## 未验证范围

尚未在当前机器安装 APK 做真机冷启动录屏；已验证 Expo prebuild 实际生成的 Android 原生启动资源及其最终图片内容。
