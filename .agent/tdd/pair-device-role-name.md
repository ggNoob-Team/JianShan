# 配对设备角色名称 TDD 证据

## 行为矩阵

| 场景                      | 期望行为                                                                                               | 覆盖                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 打开配对设备弹窗          | 先显示角色名称输入框，不请求 pairing offer，也不显示二维码或链接。                                     | `pair-device-section.test.tsx` |
| 角色名称为空或只有空格    | 提交按钮不可用，不发起请求。                                                                           | `pair-device-section.test.tsx` |
| 输入合法角色名称          | 去除首尾空格后作为 `clientName` 传给 `getDaemonPairingOffer`，对应 CLI 的 `paseo daemon pair --name`。 | `pair-device-section.test.tsx` |
| Relay 未启用              | 保留已输入的角色名称；启用 Relay 后重新生成 offer 时仍传入同一个 `clientName`。                        | `pair-device-section.test.tsx` |
| 配对链接生成              | 显示本次配对角色名称。                                                                                 | `pair-device-section.test.tsx` |
| 关闭弹窗后重新打开        | 清空角色名称与已提交状态，重新要求输入。                                                               | `pair-device-section.test.tsx` |
| 推送使 pairing offer 失效 | 现有基础 query key 仍能匹配带角色名称的扩展 key。                                                      | `push-router.test.ts`          |

## 红证据

首次运行 `pair-device-section.test.tsx` 时，弹窗直接显示 `pairing.device.loadingOffer`，找不到 `pair-device-role-name-input`，证明旧实现会在角色名称为空时立即请求并生成配对内容。

## 绿证据

- `npx vitest run src/desktop/components/pair-device-section.test.tsx --project unit --bail=1` -> 4 passed。
- `npx vitest run src/data/push-router.test.ts --project unit --bail=1` -> 10 passed。
- `npm run typecheck --workspace=@getpaseo/app` -> passed。
- 定向 lint -> 0 warnings, 0 errors。
- `npm run format:check` -> passed。

## 变异敏感性

- 将“是否必须先输入角色名称”改为恒为 `false` 后，首个回归测试找不到角色输入框并失败。
- 将 `getDaemonPairingOffer({ clientName })` 改为不传参数后，回归测试捕获到调用参数缺失并失败。
- 两处恢复后全部通过。

## 未验证范围

尚未在已安装的桌面和移动端包上人工点击完整二维码流程；当前验证覆盖组件状态、RPC 参数、Relay 重新生成和 query 失效路径。
