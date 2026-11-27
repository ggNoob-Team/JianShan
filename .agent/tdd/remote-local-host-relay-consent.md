# 远程 Host 使用本机的中继确认 TDD 证据

## 行为矩阵

| 场景                | 期望行为                                                                      | 覆盖                                     |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| 本地 Relay 已开启   | 打开“允许此远程 Host 使用这台设备”开关时直接写入授权。                        | `remote-local-host-access-card.test.tsx` |
| 本地 Relay 未开启   | 开关不立即生效，显示与配对设备一致的中继确认提示。                            | `remote-local-host-access-card.test.tsx` |
| 用户确认启用 Relay  | 先启用本地 daemon Relay，再写入远程 Host 使用本机的授权，最终开关为开启状态。 | `remote-local-host-access-card.test.tsx` |
| 用户取消            | 不启用 Relay、不写入授权，开关保持关闭。                                      | `remote-local-host-access-card.test.tsx` |
| 关闭已有授权        | 直接关闭，不弹 Relay 提示。                                                   | `remote-local-host-access-card.test.tsx` |
| 配对设备 Relay 提示 | 继续使用抽取后的共享提示组件，视觉和行为保持不变。                            | `pair-device-section.test.tsx`           |

## 红证据

新增 `remote-local-host-access-card.test.tsx` 时组件尚不存在，测试启动失败：

```text
Failed to resolve import "./remote-local-host-access-card"
```

## 绿证据

- `npx vitest run src/screens/settings/remote-local-host-access-card.test.tsx src/desktop/components/pair-device-section.test.tsx --project unit --bail=1` -> 8 passed。
- `npm run typecheck --workspace=@getpaseo/app` -> passed。
- 定向 lint -> 0 warnings, 0 errors。
- `npm run format:check` -> passed。

## 变异敏感性

临时让开启开关时跳过 Relay 检测并直接写入授权，首个用例失败，实际调用了 `setRemoteLocalHostAccess("srv_remote", true)` 且没有显示确认框；恢复后通过。

## 未验证范围

尚未在安装包中人工点击确认框并观察 daemon Relay 状态切换；当前覆盖开关分支、Relay 配置写入和授权调用顺序。
