# Harmony 图库快捷按钮直连修复证据

## 根因

鸿蒙壳的 `isHarmonyShell()` 只要求存在 `window.paseoPhotoPicker.pickImages`，但图库选择器同时要求 `pickImages` 和 `readImages`。当 ArkWeb 没有暴露第二个代理方法时，检测返回 `false`，快捷按钮回退到 Expo Web 文件输入，ArkWeb 因此显示系统的“选择上传”面板。

## 行为矩阵

| 场景                                 | 期望行为                                                           | 覆盖                                   |
| ------------------------------------ | ------------------------------------------------------------------ | -------------------------------------- |
| 当前鸿蒙桥只暴露 `pickImages`        | `pickImages` 一次调用直接返回压缩后的照片，不再要求 `readImages`。 | `harmony-gallery-picker.test.ts`       |
| 旧鸿蒙桥返回 URI 且提供 `readImages` | 继续走两步兼容协议。                                               | `harmony-gallery-picker.test.ts`       |
| 桥不存在                             | 返回 `null`，不会在该函数内部模拟成文件选择器。                    | `harmony-gallery-picker.test.ts`       |
| 同步代理回调                         | 回调完成后清理超时定时器，结果只提交一次。                         | 直接照片测试                           |
| 完整鸿蒙构建                         | Web bundle、ArkTS 与 HAP 均成功生成。                              | `npm run harmony:build -- --skip-sign` |

## 红证据

新增“只有 `pickImages` 且直接返回 photos”的测试后失败：

```text
expected false to be true
```

失败点是 `hasHarmonyGalleryPicker()`，确认旧实现会跳过鸿蒙原生桥并落入 Expo Web 文件选择。

## 绿证据

- `npx vitest run src/hooks/harmony-gallery-picker.test.ts src/utils/harmony-shell.test.ts --project unit --bail=1` -> 10 passed。
- `npm run typecheck --workspace=@getpaseo/app` -> passed。
- 定向 lint -> 0 warnings, 0 errors。
- `npm run format:check` -> passed。
- `npm run harmony:build -- --skip-sign` -> ArkTS 编译和 HAP 打包成功。
- 生成 `packages/harmony/build/outputs/hap/entry-default-unsigned.hap`，bundle 内确认只依赖 `pickImages` 并解析直接返回的 `photos`。

## 未验证范围

当前没有 Harmony 真机连接，尚未在设备上人工点击图库按钮确认系统 PhotoViewPicker 的最终交互；已完成 Web 桥测试、ArkTS 编译和 HAP 打包验证。
