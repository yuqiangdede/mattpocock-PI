# mattpocock-PI 0.16.1-beta.2 Windows 预览版

本版本包含阶段一 Skill Launcher，以及 PR #39、#40 的最新交互改进。

## 本次新增

- 六个独立 Coding Actions：需求讨论、固化需求、技术设计、拆分任务、实现、代码审查。点击后通过当前会话的原生 Pi Agent 调用对应 Skill。
- 独立扩展设置：编辑名称、可选提示词、说明、排序及启用状态，显式保存后生效；支持自建动作。
- 旧快捷提示词安全迁移，保留旧数据；支持 JSON 导入导出和跨数据目录使用。
- 缺失 Skill 有明确诊断；配置损坏时保留原文件并回退默认，不阻塞普通 Chat，显式恢复前保留备份。
- 修改 Skill 后，下次动作执行加载最新内容。历史工程 Workflow 保持兼容；Development Navigator 不在本次范围内。
- Matt 技能使用中文快捷入口，并按项目周期分类；选择技能保留草稿，手动发送后执行。
- 移除 Coding Actions 中重复的需求确认入口；Workflow 保留确认与历史记录，等待请求期间可用 Cancel 或 Escape 关闭弹窗。

## Windows 文件

- `PI-Desktop-Setup-0.16.1-beta.2.exe`：安装器。
- `PI-Desktop-Portable-0.16.1-beta.2.zip`：解压后运行 `PI-Desktop.exe`。
- `PI-Desktop-Portable-0.16.1-beta.2.exe`：Portable 启动器。

发行文件与 `SHA256SUMS.txt` 位于 GitHub Release。ZIP 和 Portable 用户下载后手动替换程序，保留原数据目录。

## 验收边界

这是未签名 Windows 预览版。真实外部模型、干净虚拟机、真实 NSIS 安装/升级/卸载、真实 updater 安装链路、macOS/Linux 及远程 pi-host 未覆盖。测试使用隔离数据与本地确定性 Provider。实际测试结果见 [beta.2 验收记录](windows-release-acceptance-2026-10-06-beta2.md)。

最新主分支重新构建与验收记录见 [2026-10-07 发布验收](windows-release-acceptance-2026-10-07-beta2.md)。
