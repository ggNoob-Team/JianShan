# 手动本机 Host 的远程执行授权可见性 TDD 证据

## 行为矩阵

| 场景                                                           | 期望行为                                                               | 覆盖                                                      |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| 桌面端已手动添加 `localhost:6767`，内建 daemon 未运行          | 识别该 Host 为本机，远程 Host 详情显示“允许此远程 Host 使用这台设备”。 | `use-is-local-daemon.test.tsx`                            |
| 本机连接使用 `127.0.0.1`、`[::1]`、Unix socket 或 Windows pipe | 与本机 daemon 状态返回的 `serverId` 采用同一套识别规则。               | `host-connection.test.ts`                                 |
| Host 列表只有远程 TCP 地址                                     | 不把远程 Host 误判为本机。                                             | `host-connection.test.ts`、`use-is-local-daemon.test.tsx` |
| 内建 daemon 已返回 `serverId`，但 Host 尚未写入注册表          | 保留桌面 daemon 状态作为回退。                                         | `use-is-local-daemon.test.tsx`                            |
| 非桌面运行环境                                                 | 不把任何 Host 识别为当前设备。                                         | `use-is-local-daemon.test.tsx`                            |

## 红证据

`npx vitest run src/hooks/use-is-local-daemon.test.tsx --project unit --bail=1` 失败：

```text
expected null to be 'srv_local'
```

复现场景为 Host 列表同时包含远程 `45.40.254.22:4100` 和手动添加的 `localhost:6767`，而桌面内建 daemon 状态没有 `serverId`。

共享解析函数首次运行也按预期失败：`resolveLocalServerIdFromHosts is not a function`。

## 绿证据

- `npx vitest run src/hooks/use-is-local-daemon.test.tsx src/types/host-connection.test.ts --project unit --bail=1` -> 40 passed。
- `npx vitest run src/runtime/host-runtime.test.ts --project unit -t "registers the local daemon on a remote host after explicit opt-in" --bail=1` -> 1 passed。
- `npm run build:client && npm run typecheck --workspace=@getpaseo/app` -> passed。
- 定向 `npm run lint -- ...` -> 0 warnings, 0 errors。

## 变异敏感性

临时把 `directTcp` 的本机判定改为恒为 `false` 后，`useLocalDaemonServerId` 回归测试和共享解析测试同时失败；恢复后通过。
