# 回答完成时间 TDD 证据

## 行为矩阵

| 场景               | 预期行为                                                         | 覆盖                                   |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| 回答完成           | 完成 footer 显示回答完成时间，时间由问题开始时间加本轮用时得到。 | `turn-activity.spec.ts`                |
| 活动摘要已显示用时 | footer 不再重复用时，但仍显示回答完成时间。                      | `turn-activity.spec.ts` 的折叠活动场景 |
| 普通回答           | footer 同时显示用时和回答完成时间。                              | `agent-message-submission.spec.ts`     |
| 桌面端与移动端     | 900px 和 390px 布局都显示回答完成时间。                          | `agent-message-submission.spec.ts`     |
| 24 小时制          | 回答完成时间固定显示为 `17:26`，不显示 AM/PM。                   | `utils/time.test.ts`                   |

## 红证据

- 先在完成态 activity 测试中断言 `turn-completed-timestamp` 可见：
  `npm run test:e2e --workspace=@getpaseo/app -- e2e/browser/turn-activity.spec.ts --grep "collapses a completed turn and expands its process in order"`
- 结果失败：复杂回答的 `hideDuration` 同时隐藏了完成时间，`turn-completed-timestamp` 不存在。
- 增加 24 小时制单测时，`formatMessageTimestamp24Hour` 尚不存在，`time.test.ts` 失败。

## 绿证据

- footer 将完成时间从“仅悬停显示”改为完成态始终显示；活动摘要已展示耗时时，footer 单独显示完成时间。
- 活动摘要场景测试通过，并验证完成时间符合本地时间格式。
- 普通回答在 900px 和 390px viewport 下同时显示 `用时 · 完成时间`：
  `npm run test:e2e --workspace=@getpaseo/app -- e2e/browser/agent-message-submission.spec.ts --grep "keeps the bubble shadow and completion time"`
- `formatMessageTimestamp24Hour` 使用 `hourCycle: "h23"`，同一天返回 `17:26`，带日期时返回 `Monday 22:12`。
- 活动摘要视觉截图：`packages/app/test-results/turn-activity-collapses-a--f2827-xpands-its-process-in-order-browser/completed-turn-timestamp.png`。

## 变异敏感性

- 再次让完成时间依赖 `showDuration` 时，`turn-completed-timestamp` 断言失败。
- 恢复完成时间独立显示后，断言通过。

## 测试影响

- 修改 `AssistantTurnFooter` 的展示逻辑和属性命名。
- 更新 `turn-activity.spec.ts`，覆盖回答完成后的可见时间。
- 更新 `agent-message-submission.spec.ts`，覆盖桌面端和移动端普通回答。
- 更新 `utils/time.test.ts`，覆盖 24 小时制格式化和日期上下文。
- `timeline/turn-time.test.ts` 已覆盖 `completedAt = 问题开始时间 + durationMs`。
