# 设置中的版本检测

入口为「设置 → 关于 → 版本与更新来源」。打开页面只读取本地版本和本次运行已缓存的结果；用户可以检查全部或单项检测、失败重试，并前往对应来源页面。检测不下载或安装更新。

| 来源 | 当前版本 | 最新版本与入口 |
| --- | --- | --- |
| PI-Desktop 原版 | 本应用的 PI-Desktop 版本基线，不代表另行安装了原版 | `vastsa/PI-Desktop` 稳定发布 |
| Matt Pocock 技能包 | Host 实际安装清单中的完整提交 SHA；页面显示前 12 位，悬停查看完整值 | `mattpocock/skills` 的 `main` 提交与仓库页面 |
| mattpocock-PI | 当前应用版本 | `yuqiangdede/mattpocock-PI` 稳定发布；没有稳定发布时展示预发布 |

发布版本按数字版本和预发布标识比较，较旧发布不会提示升级。无法比较的标签或不同技能 SHA 显示版本不同，由用户查看；无发布和网络错误分别展示。技能包版本记录不保证本地修改的技能全部与上游一致。

实现位于 shared 的版本状态与 IPC 协议、Electron 的版本检测服务、Host 的只读清单 RPC，以及 renderer 的设置组件。查询复用现有公共 HTTPS 客户端与代理策略，更新入口由主进程固定映射。

环境与初始化沿用项目 README。开发运行使用 `pnpm dev`；新增 RPC 需要重建 Host，新增 IPC 需要重建 shared。

验证入口：

```powershell
pnpm --config.verifyDepsBeforeRun=false --filter @pi-desktop/shared build
pnpm --config.verifyDepsBeforeRun=false --filter @pi-desktop/desktop typecheck
node --test apps/desktop/test/version-sources.test.mjs apps/desktop/test/engineering-skill-update.test.mjs
cargo test -p host-core bundled_revision_reads_actual_manifest_without_installing
node scripts/e2e-version-sources.mjs
node scripts/e2e-version-sources.mjs --live-network --screenshot
node scripts/e2e-version-sources.mjs --controller --live-network
node scripts/e2e-settings-scroll.mjs --about-only --screenshot
```

界面验证使用实际组件和隔离 Electron，模拟 IPC 检查三项展示、手动检测、单项失败重试和来源入口。需要已有 renderer 构建样式，临时文件位于项目 `cache/verification`，测试退出时清理。联网成功还取决于运行时网络与 GitHub API 限流。

本应用名称、反馈与打包发布源均使用 mattpocock-PI。设置页只展示统一的三个来源手动检测入口；主进程限制为手动更新，历史自动偏好不会下载安装，菜单检测也读取本应用 GitHub 发布。原版仍作为独立上游来源展示，原版内置 changelog 不作为 fork 的新版本说明。技能安装保持现有行为。

显示名称独立于 Electron 内部名称；应用 ID、内部名称、打包产品名、IPC 命名、包名与数据目录保留兼容标识，避免切换名称导致既有数据不可见。模型、语音、网络、同步与开发者设置属于共用运行能力，保留现有配置。

本次验证：12 项相关 Node 测试、Host 只读版本测试、桌面类型检查、桌面生产构建与 Electron 界面检查通过。Electron 实际联网查询三个来源成功。联网探针使用空技能安装版本，只验证上游读取；实际安装版本由 Host 清单测试覆盖。

本应用设置适配验证：18 项相关 Node 测试与 4 项反馈单元测试通过；真实 Electron 关于页与更新控制器验证通过，历史自动偏好被限制为手动，下载安装被阻止。发布 feed 工作流用例因本 fork 没有该工作流而跳过。完整设置回归在 Cloud sync 搜索用例失败，未纳入本次关于页调整的通过范围。
