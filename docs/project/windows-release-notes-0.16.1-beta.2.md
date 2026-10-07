# mattpocock-PI 0.16.1-beta.2 发布说明草稿

这是 Windows 预览版的发布准备稿，尚未发布。

## 本次新增

- 六个独立 Coding Actions：需求讨论、固化需求、技术设计、拆分任务、实现、代码审查。点击后通过当前会话的原生 Pi Agent 调用对应 Skill。
- 独立扩展设置：编辑名称、可选提示词、说明、排序及启用状态，显式保存后生效；支持自建动作。
- 旧快捷提示词安全迁移，保留旧数据；支持 JSON 导入导出和跨数据目录使用。
- 缺失 Skill 有明确诊断；配置损坏时保留原文件并回退默认，不阻塞普通 Chat，显式恢复前保留备份。
- 修改 Skill 后，下次动作执行加载最新内容。历史工程 Workflow 保持兼容；Development Navigator 不在本次范围内。

## Windows 文件

- `PI-Desktop-Setup-0.16.1-beta.2.exe`：安装器。
- `PI-Desktop-Portable-0.16.1-beta.2.zip`：解压后运行 `PI-Desktop.exe`。
- `PI-Desktop-Portable-0.16.1-beta.2.exe`：Portable 启动器。

候选产物和 SHA256 清单保留在独立工作树的 `apps/desktop/release/beta2/`。不要使用上一轮同名 beta.1 候选替换已发布资产。

## 验收边界

这是未签名 Windows 预览版。真实外部模型、干净虚拟机、真实 NSIS 安装/升级/卸载、真实 updater 安装链路、macOS/Linux 及远程 pi-host 未覆盖。测试使用隔离数据与本地确定性 Provider。实际测试结果见 [beta.2 验收记录](windows-release-acceptance-2026-10-06-beta2.md)。

提交、推送、合并、打标签和公开发布属于后续交付阶段，本轮没有执行。
