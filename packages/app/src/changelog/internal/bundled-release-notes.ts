const ENGLISH_RELEASE_NOTES = `## 0.14.0 - 2026-11-19

Cross-host file handoff, clearer team host states, role-aware workspaces, and local Git workspace choice.

### Added

- Added cross-host file handoff, so an agent can send files to another connected host.
- Added role ordering and virtual ownership views to the admin console.
- Kept the local workspace choice for Git projects.

### Improved

- Team analytics now distinguishes offline and unsupported hosts and matches the admin styling.
- Note details stay inside the workspace dialog.

### Fixed

- Enforced role ownership for agent-created workspaces.

## 0.13.9 - 2026-11-17

Worktree-first Git workspaces, per-client host registrations, prefetched workspace notes, and a team analytics refresh.

### Added

- Git workspaces now default to worktrees, so new workspaces get an isolated checkout.
- Workspace notes open in a prefetched dialog instead of waiting for a separate load.
- The team analytics dashboard now matches the admin reference layout.

### Fixed

- Host registrations are isolated per client, so one client's pairing cannot leak into another client's host list.

### Improved

- Added a second HarmonyOS AppGallery test link to the download page.

## 0.13.8 - 2026-11-16

Team roles, an embedded team view, steadier directory sync, and full Codex history on resume.

### Added

- Added pairing roles, so a host can grant a client a role when it pairs.
- Added the admin team view and embedded it in the client, with per-member sessions, questions and model usage.
- Added a date-range selector to the team view.

### Improved

- Kept directory subscriptions alive while a demand refresh is in flight, so release/reacquire cycles cannot reject the refresh promise.

### Fixed

- Fixed reopening an idle Codex agent showing only the tail of the thread; the persisted transcript now loads before the live window.
- Fixed the team view ignoring the selected date range.

## 0.13.24 - 2026-11-06

JianShan branding, QR pairing on HarmonyOS, workspace link tabs, faster startup, and a composer that stays put.

### Added

- Added QR-code pairing on HarmonyOS, so a phone can scan a host invitation directly.
- Added an option to open links in workspace WebView tabs without leaving the current flow.
- Renamed the visible client and startup identity to JianShan, with a new startup mark and HarmonyOS icon.
- Kept the quick-input composer pinned to the bottom while editing.

### Improved

- Split the startup bundle and loaded icons and KaTeX on demand to reduce first-screen work.
- Cached HarmonyOS shell assets to speed up repeat launches.
- Bounded workspace hydration to two seconds so an offline host no longer leaves the app stuck on the splash screen.
- Updated the download site to serve the latest APK from GitHub Releases.

### Fixed

- Fixed the app sometimes remaining on the splash screen when settings or workspace hydration stalled.
`;

const CHINESE_RELEASE_NOTES = `## 0.14.0 - 2026-11-19

跨主机文件传交、更清晰的团队主机状态、角色化工作区，以及 Git 项目的本地工作区选择。

### 新增

- 新增跨主机文件传交，Agent 可以把文件发送到另一台已连接主机。
- 管理端新增角色排序和虚拟归属视图。
- Git 项目保留本地工作区选择。

### 改进

- 团队分析区分离线与不支持的主机，并与管理端样式对齐。
- 笔记详情保持在当前工作区对话框内打开。

### 修复

- 修复 Agent 创建工作区的角色归属校验问题。

## 0.13.9 - 2026-11-17

Git 工作区默认使用 worktree、按客户端隔离主机注册、预取工作区笔记，以及团队分析看板更新。

### 新增

- 新建 Git 工作区默认使用 worktree，获得独立的工作目录。
- 工作区笔记改为预取后在对话框中打开，减少等待。
- 团队分析看板已与管理员参考布局对齐。

### 修复

- 主机注册按客户端隔离，避免一个客户端的配对信息影响另一个客户端。

### 改进

- 下载页新增第二个 HarmonyOS AppGallery 测试入口。

## 0.13.8 - 2026-11-16

角色配对、内嵌团队视图、更稳定的目录同步，以及恢复完整的 Codex 历史记录。

### 新增

- 配对时可为客户端指定角色。
- 新增管理端团队视图，并内嵌到客户端，可查看成员的会话、提问和模型消耗。
- 团队视图新增日期范围选择。

### 改进

- 目录同步在按需刷新进行期间保持订阅，避免释放/重新获取时拒绝刷新 promise。

### 修复

- 修复重新打开空闲 Codex 代理时只显示会话尾部的问题；现在会先读取持久化记录，再收窄到实时窗口。
- 修复团队视图未按所选日期范围统计的问题。

## 0.13.24 - 2026-11-06

见山品牌焕新、HarmonyOS 扫码配对、工作区链接标签页、启动性能优化，以及固定在底部的快捷输入栏。

### 新增

- HarmonyOS 支持扫描二维码配对，可直接扫描主机邀请。
- 链接可在工作区 WebView 标签页中打开，不必离开当前工作流。
- 客户端可见名称和启动标识更新为“见山”，同步更换 HarmonyOS 图标。
- 快捷输入栏固定在底部，编辑时保持可见。

### 改进

- 拆分启动包并按需加载图标与 KaTeX，减少首屏加载工作。
- 缓存 HarmonyOS 静态资源，加快重复启动。
- 为工作区 hydration 设置 2 秒上限，主机离线或设置读取卡住时不再一直停在启动页。
- 发布下载页改为从 GitHub Releases 获取最新 APK。

### 修复

- 修复设置或工作区数据加载停滞时应用可能一直停留在启动页的问题。
`;

export function resolveBundledReleaseNotes(language: string): string {
  return language.toLowerCase().startsWith("zh") ? CHINESE_RELEASE_NOTES : ENGLISH_RELEASE_NOTES;
}
