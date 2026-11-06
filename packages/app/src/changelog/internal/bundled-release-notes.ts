const ENGLISH_RELEASE_NOTES = `## 0.13.24 - 2026-11-06

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

const CHINESE_RELEASE_NOTES = `## 0.13.24 - 2026-11-06

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
