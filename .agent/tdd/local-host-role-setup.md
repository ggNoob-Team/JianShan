# 本机 Host 角色设置 TDD 证据

## 方案结论

`clientName` 是 workspace/agent 的归属名称，也是创建任务时的必填项。`admin`/`member` 是客户端角色类型，不是角色名称的替代项；当前只影响本机 UI 入口（例如团队页），不授予 daemon 权限。

本机用户拥有本地 daemon，因此允许在 Host 概览中自行设置角色名称；首次设置名称时默认角色类型为 `admin`，之后可切换为 `member`。远端 Host 仍由配对链接或对应管理员分配，客户端不提供自改入口。

## 行为矩阵

| 场景                        | 期望行为                                                             | 覆盖                                                                    |
| --------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 本机 Host 没有 `clientName` | 新建 workspace 前提示先到 Host 概览设置角色名称，并提供直接入口。    | `local-host-role.test.ts` / `use-local-host-role-setup.ts`              |
| 远端 Host 没有 `clientName` | 不显示本机设置提示，继续使用“联系管理员分配角色”的远端流程。         | `local-host-role.test.ts`                                               |
| 本机第一次设置角色名称      | 去除首尾空格后保存；缺失的角色类型默认成 `admin`。                   | `local-host-role.test.ts`、`host-runtime.test.ts`                       |
| 本机已有成员角色            | 后续修改名称时保留显式的 `member`，不强制升级为管理员。              | `local-host-role.test.ts`                                               |
| 角色名称非法                | 空名称和超过 120 字符的名称被拒绝。                                  | `local-host-role.test.ts`、`host-runtime.test.ts`                       |
| Host 概览                   | 仅本机 Host 显示“角色名称”和“角色类型”；角色名称变更会更新连接身份。 | `host-client-role-section.tsx`、Host Runtime clientName reconnect tests |

## 红证据

- 新增 `local-host-role.test.ts` 时模块不存在，测试启动失败。
- 新增 HostRuntimeStore 测试时 `store.setHostClientIdentity` 不存在，运行失败：`TypeError: store.setHostClientIdentity is not a function`。

## 绿证据

- `npx vitest run src/screens/settings/local-host-role.test.ts src/runtime/host-runtime.test.ts --project unit -t "local host roles|setHostClientIdentity" --bail=1` -> 5 passed。
- `npm run typecheck --workspace=@getpaseo/app` -> passed。
- 定向 lint -> 0 warnings, 0 errors。
- `npm run format:check` -> passed。

## 变异敏感性

将本机首次角色类型默认值从 `admin` 改成 `member` 后，对应用例失败；恢复后通过。

## 未验证范围

尚未在安装包中人工走完整流程（新建 workspace 提示 → Host 概览设置角色 → 返回重试）；当前覆盖规则、持久化和连接身份更新路径。
