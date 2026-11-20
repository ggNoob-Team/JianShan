# 回答完成时间 TDD 证据

## 行为矩阵

| 场景           | 预期行为                                                      | 覆盖                               |
| -------------- | ------------------------------------------------------------- | ---------------------------------- |
| 回答完成       | footer 只显示回答完成时间，时间由问题开始时间加本轮用时得到。 | `turn-activity.spec.ts`            |
| 活动摘要头部   | 继续显示 `用时 40s ›`，并保留展开过程详情的入口。             | `turn-activity.spec.ts`            |
| footer 操作    | 保留复制、添加笔记和 fork 按钮。                              | `agent-message-submission.spec.ts` |
| 桌面端与移动端 | 900px 和 390px 布局都显示回答完成时间。                       | `agent-message-submission.spec.ts` |
| 24 小时制      | 回答完成时间固定显示为 `17:26`，不显示 AM/PM。                | `utils/time.test.ts`               |

## 红证据

- 先在完成态 activity 测试中断言 `turn-completed-timestamp` 可见：
  `npm run test:e2e --workspace=@getpaseo/app -- e2e/browser/turn-activity.spec.ts --grep "collapses a completed turn and expands its process in order"`
- 结果失败：复杂回答的 `hideDuration` 同时隐藏了完成时间，`turn-completed-timestamp` 不存在。
- 增加 24 小时制单测时，`formatMessageTimestamp24Hour` 尚不存在，`time.test.ts` 失败。
- 要求 footer 去掉 `Worked for` 时，原 footer 仍显示“用时”，契约测试失败。

## 绿证据

- footer 在完成态始终只显示 24 小时制完成时间；耗时只保留在活动摘要头部。
- 活动摘要场景测试通过，并验证完成时间符合本地时间格式。
- 普通回答在 900px 和 390px viewport 下不显示 `用时`，同时显示完成时间和 footer 笔记按钮：
  `npm run test:e2e --workspace=@getpaseo/app -- e2e/browser/agent-message-submission.spec.ts --grep "keeps the bubble shadow and completion time"`
- `formatMessageTimestamp24Hour` 使用 `hourCycle: "h23"`，同一天返回 `17:26`，带日期时返回 `Monday 22:12`。
- 活动摘要视觉截图：`packages/app/test-results/turn-activity-collapses-a--f2827-xpands-its-process-in-order-browser/completed-turn-timestamp.png`。

## 变异敏感性

- 再次让 footer 渲染耗时时，`getByText(/^Worked for/)` 的零实例断言失败。
- 移除 footer 耗时并保留笔记按钮后，断言通过。

## 测试影响

- 修改 `AssistantTurnFooter`，移除耗时展示及 `hideDuration` 传递链。
- 更新 `turn-activity.spec.ts`，覆盖回答完成后的可见时间。
- 更新 `agent-message-submission.spec.ts`，覆盖桌面端、移动端、无 footer 耗时和笔记按钮。
- 更新 `utils/time.test.ts`，覆盖 24 小时制格式化和日期上下文。
- `timeline/turn-time.test.ts` 已覆盖 `completedAt = 问题开始时间 + durationMs`。
