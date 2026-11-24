# 隐藏可见“虚拟”标签 TDD 证据

## 行为矩阵

| 场景                              | 期望行为                                                             | 覆盖                   |
| --------------------------------- | -------------------------------------------------------------------- | ---------------------- |
| 侧栏 creator 为 `筑梦/virtual`    | 只显示“筑梦”，不再显示“虚拟”。                                       | `meta-items.test.ts`   |
| 侧栏只有 virtual 状态、没有角色名 | 不生成空的 creator 项，也不显示“虚拟”。                              | `meta-items.test.ts`   |
| 客户端团队页                      | 虚拟成员继续单独统计，但成员标题旁不显示“虚拟”。                     | `team-screen.tsx`      |
| Web 管理台团队页                  | 继续显示自动成员统计，但移除成员旁“虚拟”徽标，计数改为“项自动统计”。 | `admin-server.test.ts` |
| 管理台标题归属                    | 保留 owner 字段和转移能力，不显示“虚拟”文字。                        | `admin-server.test.ts` |
| 后台数据                          | `virtual` 字段、独立成员和归属判定保持不变。                         | `admin-data.test.ts`   |

## 红证据

- 修改测试期望后，侧栏测试失败：creator item 仍带 `virtual` / 仍会出现虚拟项。
- 管理台静态资源测试失败：脚本中仍包含 `>虚拟</span>`。

## 绿证据

- `npx vitest run packages/app/src/components/sidebar/workspace-meta-row/meta-items.test.ts packages/app/src/hooks/sidebar-workspaces-view-model.test.ts packages/app/src/screens/team-screen-model.test.ts --bail=1` -> 77 passed。
- `npx vitest run packages/server/src/server/admin/admin-server.test.ts packages/server/src/server/admin/admin-data.test.ts --bail=1` -> 14 passed。
- `npm run typecheck`、`npm run lint` -> 通过。
