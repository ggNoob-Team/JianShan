# Windows CLI 安装 PATH 修复 TDD 证据

## 行为矩阵

| 场景                                 | 期望行为                                                                       | 覆盖                                       |
| ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Windows 首次安装 CLI                 | 写入 `%USERPROFILE%\.local\bin\paseo.cmd`，并将该目录持久化到当前用户 `PATH`。 | `shell-rc.test.ts`、`windows-path.test.ts` |
| 用户 PATH 已含等价目录               | `%USERPROFILE%`、正反斜杠、大小写、引号和尾部斜杠均视为同一目录，不重复追加。  | `windows-path.test.ts`                     |
| 旧版本只写入了 `.cmd`，没有配置 PATH | 不再误报“已安装”；设置页重新显示“安装”以修复。                                 | `status.test.ts`                           |
| PATH 写入完成                        | 同时更新当前应用进程 PATH，本次安装结果立即可判定为已安装。                    | `shell-rc.test.ts`                         |
| PowerShell 更新失败                  | 安装失败向上抛出，由现有桌面 IPC 错误提示展示，不静默成功。                    | `shell-rc.test.ts`                         |
| macOS / Linux                        | 保持原有文件存在判定与 shell rc 行为。                                         | `status.test.ts`                           |
| 已安装后的终端                       | 设置页提示旧终端不会继承新 PATH，需要完全退出后重新打开。                      | Integrations 设置页                        |

## 红证据

- 首次运行找不到尚不存在的 `windows-path`。
- `ensureCliPath` 尚不存在：`TypeError: ensureCliPath is not a function`。
- 新增状态测试首次运行找不到 `status` 模块，确认旧实现没有“文件存在但 PATH 未配置”的判定。

## 绿证据

- `npx vitest run src/integrations/cli-install/windows-path.test.ts src/integrations/cli-install/shell-rc.test.ts src/integrations/cli-install/status.test.ts src/integrations/cli-install/path.test.ts --bail=1` -> 19 passed。
- `npm run typecheck --workspace=@getpaseo/desktop` -> passed。
- `npm run build:main --workspace=@getpaseo/desktop` -> passed。
- `npm run typecheck --workspace=@getpaseo/app` -> passed。
- 定向 lint -> 0 warnings, 0 errors。
- `npm run format:check` -> passed。

## 变异敏感性

临时将 `windowsPathContainsEntry` 改为恒为 `false` 后，状态判定和等价 PATH 去重共 5 个测试失败；恢复后通过。

## 未验证范围

当前机器不是 Windows，未实际调用 `powershell.exe` 写入 Windows 用户注册表。PowerShell 调用边界通过注入 updater 测试，PATH 合并与状态判定使用纯函数测试覆盖；最终仍需在 Windows 安装包上做一次手工安装验证。
