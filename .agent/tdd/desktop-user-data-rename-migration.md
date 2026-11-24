# 桌面品牌改名后的 userData 兼容 TDD 证据

## 行为矩阵

| 场景                                 | 期望行为                                                       | 覆盖                                  |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------------------- |
| 从旧版 `Paseo` 升级到 `JianShan`     | 继续使用 `appData/Paseo`，保留 host registry、设置和窗口状态。 | `legacy-user-data.test.ts`, `main.ts` |
| 全新安装 `JianShan`                  | 旧目录不存在时继续使用默认 `JianShan` 目录。                   | `legacy-user-data.test.ts`            |
| 应用名未变化                         | 不执行迁移覆盖。                                               | `legacy-user-data.test.ts`            |
| 测试或开发显式指定 userData          | 强制目录优先，不触发 legacy 路径。                             | `main.ts`                             |
| 已升级过一次且新建了 `JianShan` 目录 | 只要旧 `Paseo` 目录仍存在，仍切回旧目录恢复原 host。           | `main.ts` resolution order            |

## 红证据

- 新增迁移测试首次运行失败：`Cannot find module './legacy-user-data.js'`。

## 根因证据

- host registry key：`@paseo:daemon-registry`，由 AsyncStorage 写入 Electron `userData`。
- 品牌提交 `d56f1c9ede3bdf6172df0dcca07800913ef79a97` 将 `productName` 从 `Paseo` 改成 `JianShan`。
- Windows Electron 默认 userData 路径因此从 `%APPDATA%\\Paseo` 变为 `%APPDATA%\\JianShan`，新版会读取空目录。

## 绿证据

- `npx vitest run packages/desktop/src/settings/legacy-user-data.test.ts --bail=1` -> 3 passed。
- `npm run typecheck --workspace=@getpaseo/desktop` -> passed。
- 定向 `npm run lint -- packages/desktop/src/main.ts packages/desktop/src/settings/legacy-user-data.ts packages/desktop/src/settings/legacy-user-data.test.ts` -> passed。
