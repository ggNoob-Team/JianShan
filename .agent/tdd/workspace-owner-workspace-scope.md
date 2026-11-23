# Workspace Owner 跨工作区串号 TDD 证据

## 行为矩阵

| 场景                            | 期望行为                                                        | 覆盖                                             |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| 当前 workspace 没有持久化 owner | 只从拥有相同 `workspaceId` 的 agent 中选最早创建者。            | `workspace-ownership.test.ts`                    |
| 其他 workspace 存在更早的 agent | 不得借用其他 workspace 的角色。                                 | `workspace-ownership.test.ts`                    |
| Dream workspace 无 owner        | 仍可从不可变的 `displayName`/`branch` 回退为 `筑梦`。           | `workspace-ownership.test.ts`, `session.test.ts` |
| Agent 在已有 workspace 内创建   | 仍继承该 workspace 的正确 owner。                               | `mcp-server.test.ts`, `creation.e2e.test.ts`     |
| 团队统计                        | 只使用当前 workspace 的真实 owner，不把全部角色合并成最早用户。 | `admin-data.test.ts`                             |

## 红证据

- 新增跨 workspace 用例初始失败：期望 `少爷`，实际返回另一个 workspace 最早 agent 的 `书记`。
- 根因：回退过滤只检查 `agent.workspaceId !== undefined`，没有比较当前 workspace id。

## 绿证据

- `npx vitest run packages/server/src/server/workspace-ownership.test.ts packages/server/src/server/admin/admin-data.test.ts --bail=1` -> 23 passed。
- `npx vitest run packages/server/src/server/session.test.ts -t "workspace ownership|legacy workspace created by an unnamed agent" --bail=1` -> 2 passed。
- MCP 继承 workspace owner 用例 -> 1 passed。
- CLI 在 dream workspace 内创建 agent 用例 -> 1 passed。
- `npm run typecheck`、`npm run lint`、`npm run format:check` -> 全部通过。
