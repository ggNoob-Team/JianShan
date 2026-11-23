# 筑梦 Agent 继承 Workspace 归属 TDD 证据

## 行为矩阵

| 场景                                                     | 期望行为                                                                   | 覆盖                         |
| -------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------- |
| CLI 在已有 dream workspace 内创建 agent，调用者无角色    | 创建成功，`createdBy` 继承 workspace 的 `筑梦/virtual`。                   | `creation.e2e.test.ts`       |
| MCP 在已有 virtual workspace 内创建 agent，caller 无角色 | 创建成功，`createdBy` 继承 workspace owner。                               | `mcp-server.test.ts`         |
| 非 dream、无 owner、caller 无角色                        | 仍按角色规则拒绝。                                                         | 既有 `mcp-server.test.ts`    |
| 新建 worktree                                            | 只在真正创建 workspace 时解析创建者角色，已有 workspace 路径不再提前拦截。 | `session.ts` / creation 回归 |
| 目标 workspace 有正常角色                                | Agent 继承该角色；由 agent 创建时仍标记 virtual。                          | `create-agent/create.ts`     |

## 红证据

- 新增 MCP 用例初始失败：`PaseoToolInputError: 请联系管理员分配角色`。
- 失败发生在 `resolveCreateAgentToolArgs` 提前解析 caller 角色时，而不是 workspace 创建阶段。

## 绿证据

- `npx vitest run packages/server/src/server/agent/mcp-server.test.ts -t "inherits the target workspace|rejects agent-scoped creation when the caller has no assigned role" --bail=1` -> 2 passed。
- `npx vitest run packages/server/src/server/creation/creation.e2e.test.ts -t "unnamed CLI agents inherit|unnamed CLI clients" --bail=1` -> 3 passed。
- `npx vitest run packages/server/src/server/agent/create-agent/create.test.ts --bail=1` -> 10 passed。
- `npm run typecheck`、`npm run lint`、`npm run format:check` -> 全部通过。

## 变异敏感性

- 让 `resolveExistingWorkspaceOwner` 永远返回 `undefined` 后，MCP 继承用例失败（exit 1），恢复后通过。
