# 用户消息阴影 TDD 证据

## 行为矩阵

| 场景           | 预期行为                                                     | 覆盖                                              |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| 桌面端用户消息 | 用户消息气泡使用明显阴影和轻量描边，和助手消息形成层级区分。 | `agent-message-submission.spec.ts` 900px viewport |
| 移动端用户消息 | 用户消息气泡保留同一阴影和描边，390px 布局不丢失。           | `agent-message-submission.spec.ts` 390px viewport |
| 跨平台渲染     | Web/iOS 使用 shadow 属性，Android 同时使用 elevation。       | 气泡共享样式                                      |

## 红证据

- 先添加 `user-message-bubble` 定位点与浏览器契约测试，在阴影仍为 `0.08` 且没有描边时提高验收门槛：
  `npm run test:e2e --workspace=@getpaseo/app -- e2e/browser/agent-message-submission.spec.ts --grep "keeps a shadow on desktop and mobile layouts"`
- 结果失败：实际阴影为 `rgba(0, 0, 0, 0.08) 0px 2px 8px 0px`，契约要求包含 `0.24`，且尚未满足 `1px` 描边。

## 绿证据

- 在 `UserMessage` 气泡样式中使用 `0.24` 阴影、`4px` 下偏移、`12px` 模糊、`elevation: 4` 和 `surface4` 描边后，同一测试通过。
- 测试同时验证 900px 和 390px viewport，并保存两个尺寸的截图；合成预览位于 `artifacts/message-shadow-desktop-mobile.png`。

## 变异敏感性

- 将阴影强度降回 `0.08` 或移除描边后，契约测试失败。
- 恢复 `0.24` 阴影与 `1px` 描边后，契约测试通过。

## 测试影响

- 仅变更用户消息气泡的视觉样式，并新增一个 `testID` 供视觉契约测试定位。
- 未改变消息数据、交互、可访问性或布局约束。
