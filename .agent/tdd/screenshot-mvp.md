# 移动端截屏 MVP TDD 证据

## 行为矩阵

| 场景         | 预期行为                                                                                       | 覆盖                                           |
| ------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 顶部入口     | 支持截屏的移动端在 workspace 顶部和 Quick Input 顶部显示 Screenshot 按钮，不再占用底部输入框。 | `screenshot-mvp.spec.ts`                       |
| 捕获         | 点击顶部入口后通过平台捕获器取得当前 App 画面。                                                | `screenshot-mvp.spec.ts`                       |
| 编辑         | 编辑器支持裁剪、裁剪应用、画笔、矩形、箭头、文字、撤销和重置。                                 | `screenshot-mvp.spec.ts`、`model.test.ts`      |
| 文字         | 选择文字工具后点击画布可输入文字，确认时读取输入框实时值，中文也写入截图并可撤销。             | `screenshot-mvp.spec.ts`、Web/Native 编辑器    |
| Android 手势 | Native 绘制与裁剪手柄统一使用 PanResponder，不依赖 Modal 内 Gesture Handler 命中。             | `editor.impl.tsx`                              |
| 发送路由     | 点击编辑器发送后，从 workspace 进入 Quick Input，并携带截图附件。                              | `screenshot-mvp.spec.ts`、`pending-capture.ts` |
| 发送         | Quick Input 显示图片附件托盘，可继续选择会话或新建会话。                                       | `screenshot-mvp.spec.ts`                       |
| HarmonyOS    | ArkTS `webPageSnapshot` 桥返回 PNG data URL，Web Shell 复用 Web 编辑器。                       | `screen-capture-bridge.ets`、Harmony HAP 构建  |

## 红证据

- 裁剪几何测试开始时 `model.ts` 不存在：
  `npx vitest run src/screenshot/model.test.ts --bail=1` 失败，随后实现几何函数并通过。
- 端到端首次运行时，截图按钮已出现，但编辑器没有完成挂载，`screenshot-editor` 不可见；修复 Web 编辑器加载路径后通过。
- 编辑器最初直接加载 Skia，Web 端出现 `CanvasKit` 未初始化；改为 Web DOM Canvas 和 native Skia 两条渲染路径后通过。
- Android 矩形/箭头无法绘制的原因确认是 editor Modal 内缺少 `GestureHandlerRootView`；由父级 RootView 无法跨 Modal 生效。
- 文字工具测试先于实现添加，首次运行因找不到 `screenshot-tool-text` 失败；实现后同一用例通过。
- 用户反馈 Android 输入后点 √ 画布无字：单字体 Skia Text 不保证中文字体回退，且 React 状态可能落后于输入法实时值。修复为 Paragraph 字体回退、提交时读取输入框实时值、边缘位置钳制。

## 绿证据

- `npx vitest run src/screenshot/model.test.ts src/i18n/resources.test.ts --bail=1`：43 passed。
- `npm run test:e2e --workspace=@getpaseo/app -- e2e/browser/screenshot-mvp.spec.ts`：通过，覆盖顶部入口与笔记按钮同排、截屏、裁剪、画笔、中文文字、发送跳转 Quick Input 和附件托盘。
- `npm run harmony:build -- --skip-sign`：ArkTS HAP 构建成功，生成 `entry-default-unsigned.hap`。
- `npm run typecheck --workspace=@getpaseo/app`：通过。
- `npm run lint -- ...`、`npm run format:check:files -- ...`：通过。

## 变异敏感性

- 裁剪矩形映射中的画布尺寸校验和边界收缩由 `model.test.ts` 直接约束。
- 端到端测试要求 workspace 顶部截图按钮、截图编辑器、裁剪应用按钮、Quick Input 页面和图片附件托盘同时可见；移除任一段链路会使测试失败。
- 端到端同时验证画笔后 Undo 从 disabled 变为 enabled，证明 native/Web 编辑器收到并提交了绘制状态。
- 端到端要求文字输入框出现、可填写、确认后关闭，并保持 Undo 可用。
- 端到端直接在 DOM 输入框写入中文但不触发 React change 事件，点击确认后画布红色像素数仍必须增加，约束提交读取实时输入值。

## 测试影响

- 新增 `screenshot` 几何测试和浏览器端 MVP 契约。
- 新增原生截屏适配器、HarmonyOS `webPageSnapshot` bridge、Web/Native 编辑器分流。
- Quick Input 从纯文本扩展为可选择图片附件发送。
- workspace 顶部截图入口通过 pending capture 转到 Quick Input；编辑器发送不再回填当前 composer。
- 截图编辑器新增文字工具；Web 使用 Canvas `fillText`，Native 使用 Skia Paragraph 和字体回退导出到最终 PNG。
- Android 绘制改用 PanResponder；本次尝试安装当前源码 Debug 包做真机验证，但 Gradle 下载 `dl.google.com` 依赖超时，仍需真机确认。
- 需要原生重建；HarmonyOS 需要重新构建 HAP。
