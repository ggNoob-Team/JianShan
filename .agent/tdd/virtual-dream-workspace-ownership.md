# 虚拟筑梦工作区归属 TDD 证据

## 行为矩阵

| 场景                            | 期望行为                                                               | 覆盖                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 已有角色名                      | 保留已有角色名，不因 workspace 名或后续改名改成 `筑梦`。               | `workspace-ownership.test.ts`, `session.test.ts`                                                  |
| 无角色名 + CLI/MCP + `dream/`   | 创建成功，`createdBy` 固定为 `筑梦` 且 `virtual=true`。                | `workspace-ownership.test.ts`, `creation.e2e.test.ts`                                             |
| 无角色名 + 非 `dream/`          | 创建失败并返回“请联系管理员分配角色”。                                 | `workspace-ownership.test.ts`, `creation.e2e.test.ts`                                             |
| 无角色名 + 手机/网页/直接客户端 | 即使名为 `dream/` 也拒绝创建。                                         | `workspace-ownership.test.ts`, existing creation tests                                            |
| 历史 dream workspace            | 没有持久化 owner 时，从不可变的 `displayName`/`branch` 识别为 `筑梦`。 | `workspace-ownership.test.ts`, `session.test.ts`                                                  |
| Descriptor 透传                 | workspace descriptor 携带 `createdBy`，旧 daemon 字段保持可选。        | `session.test.ts`, protocol schema                                                                |
| 侧栏展示                        | 有角色名显示“角色名 + 虚拟”，dream 兜底显示“筑梦 + 虚拟”。             | `sidebar-workspaces-view-model.test.ts`, `workspace-agent-activity.test.ts`, `meta-items.test.ts` |
| 团队统计                        | 虚拟活动进入独立成员视图；常规与虚拟会话不重复计数。                   | `admin-data.test.ts`, `team-screen-model.test.ts`, `admin-server.test.ts`                         |
| 工作区改名                      | 只更新 title，不改变 `createdBy`。                                     | `session.workspaces.test.ts`                                                                      |

## 红证据

- `session.test.ts` 的 descriptor 测试初始失败：`expected undefined to deeply equal { clientId: 'client-role', ... }`。
- `admin-data.test.ts` 的虚拟拆分测试初始失败：虚拟会话仍计入普通角色，且没有独立虚拟成员。
- `workspace-agent-activity.test.ts` / `sidebar-workspaces-view-model.test.ts` 初始因缺少 `createdByVirtual` 和归属透传失败。
- `team-screen-model.test.ts` 初始在跨 host 合并时丢失 `virtual` 字段。

## 绿证据

- `npx vitest run packages/server/src/server/workspace-ownership.test.ts packages/server/src/server/admin/admin-data.test.ts packages/server/src/server/admin/admin-server.test.ts --bail=1` -> 27 passed。
- `npx vitest run packages/app/src/utils/workspace-agent-activity.test.ts packages/app/src/components/sidebar/workspace-meta-row/meta-items.test.ts packages/app/src/hooks/sidebar-workspaces-view-model.test.ts packages/app/src/screens/team-screen-model.test.ts --bail=1` -> 85 passed。
- `npx vitest run packages/server/src/server/session.test.ts -t "workspace ownership|legacy workspace created by an unnamed agent" --bail=1` -> 2 passed。
- `npx vitest run packages/server/src/server/session.workspaces.test.ts -t "workspace.title.set.request stores the title" --bail=1` -> 1 passed。
- `npx vitest run packages/server/src/server/agent/mcp-server.test.ts packages/server/src/server/agent/create-agent/create.test.ts -t "virtual|worktree" --bail=1` -> 14 passed。
- `npx vitest run packages/server/src/server/creation/creation.e2e.test.ts -t "unnamed CLI" --bail=1` -> 2 passed。
- `npm run typecheck`、`npm run lint`、`npm run format:check` -> 全部通过。

## 变异敏感性

- 关闭 CLI/MCP 的 `dream/` 兜底条件：`workspace-ownership.test.ts` 失败（exit 1），恢复后通过。
- 移除 descriptor 的 owner 透传：`session.test.ts` 失败（exit 1），恢复后通过。
- 强制侧栏 `virtual=false`：`sidebar-workspaces-view-model.test.ts` 失败（exit 1），恢复后通过。
- 移除团队虚拟成员：`admin-data.test.ts` 失败（exit 1），恢复后通过。
