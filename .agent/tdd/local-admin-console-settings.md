# 桌面端本地管理台设置入口 TDD 证据

## 行为矩阵

| 场景                        | 期望行为                                                 | 覆盖                                                        |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Windows / macOS 桌面设置    | 在“诊断”和“关于”之间显示“本地管理台”。                   | `host-routes.test.ts`, settings sidebar                     |
| daemon 正在运行             | 从 `desktop_daemon_status.adminUrl` 读取实际地址并展示。 | `local-admin-console-section.tsx`, `daemon-manager.test.ts` |
| admin 端口被占用后向下漂移  | 不拼接固定端口，始终使用本次 daemon 返回的 `adminUrl`。  | `local-admin-console-section.tsx`, daemon status            |
| 打开管理台                  | 使用 Electron 外部打开桥接进入系统浏览器。               | `openExternalUrl`, `open-local-admin-console`               |
| daemon 未运行或管理台未就绪 | Open 按钮禁用，可手动刷新 daemon 状态。                  | `refresh-local-admin-console`                               |
| Web / 移动端                | 不显示桌面专用入口。                                     | `desktopOnly` section gate                                  |

## 红证据

- 新增路由测试初始失败：`SETTINGS_SECTION_SLUGS` 中没有 `admin`，索引为 `-1`。

## 绿证据

- `npx vitest run packages/app/src/utils/host-routes.test.ts --bail=1` -> 39 passed。
- `npm run typecheck --workspace=@getpaseo/app` -> passed。
- 定向 `npm run lint -- ...` -> passed。
- 既有 daemon manager 测试验证 `adminUrl` 为非固定端口：`http://127.0.0.1:6801/`。
