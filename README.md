# Claude Code for Mac

基于 Electron、React 和 Claude Agent SDK 构建的第三方 macOS 桌面客户端，提供中文界面。此项目不是 Anthropic 官方桌面应用。

## 下载和安装

在 [Releases](https://github.com/2061623884/Claude-Code-for-Mac/releases) 下载最新版本。

- `Claude-Code-for-Mac-0.3.0-arm64.dmg`：打开后将 `Claude Code.app` 拖到 Applications。
- `Claude-Code-for-Mac-0.3.0-arm64.zip`：解压后得到同一个应用。
- `SHA256SUMS.txt`：安装包 SHA-256 校验值。

当前提供 **Apple Silicon（arm64）** 版本，不支持 Intel Mac。应用尚未使用 Apple Developer ID 签名或经过 Apple 公证，macOS 可能显示安全提示。

首次使用需要在本机配置有效的 Claude Code 登录或 API 认证。安装包不包含账号、API Key 或聊天记录。

## 功能

- 项目管理、历史会话、流式回复、权限确认、模型和思考程度选择。
- 右侧栏仅在会话内开放，标签和展开状态按会话隔离。加号新建“开始”页，提供工作区文件、终端、浏览器和侧边聊天四个入口。
- 文件树与代码、Markdown、图片、HTML、PDF、DOCX、Excel（XLSX/XLS）内嵌预览。PDF 支持密码输入；Excel 支持工作表切换与大表按可见区域渲染。
- 在项目目录运行的内嵌交互终端，以及内嵌浏览器。
- 可主动创建多个独立侧边聊天，分别保存草稿和问答。没有消息时显示引导，发送后隐藏，清空后重新显示。`/btw` 每次创建独立聊天页。
- 归档当前会话后返回主页，不再停留在已归档页面。
- 侧栏调宽、展开与收起动效，浅色和深色主题。
- 独立的会话摘要面板，汇总文件变更、来源、关联项目目录、任务／待办与子 Agent。
- 摘要分类仅在有记录时显示，默认折叠，展开后最多预览三条；底部唯一的“查看全部”打开完整会话摘要标签，右上角固定按钮在收起时显示页面数、展开时切换为隐藏侧栏图标。

摘要直接来自工具调用、SDK 任务事件与目录 Hooks，不额外调用模型。变更行数表示已确认文件工具操作的累计值，不是仓库净差异；缺少可靠补丁时显示未知，通过终端或外部程序产生的改动可能未覆盖。旧会话缺失的生命周期事件不会被猜测补齐。

应用将精简活动记录保存在用户数据目录的 `session-activity/`，以便重启后恢复摘要。不会复制完整工具参数或工具返回正文。

HTML 和 DOCX 预览不执行脚本，也不加载文档中的远程资源。Office 预览只读，不保证完整还原排版或图表，不执行宏或重新计算公式。PDF 预览上限 100 MB，Office 文件上限 30 MB；超限或不支持的文件可用系统默认应用打开。

切换会话、返回主页、归档或进入设置时，会保留终端进程与浏览器页面；关闭标签、移除所属项目或退出应用时释放资源。侧栏标签、草稿和侧边聊天仅在本次应用运行期间保留，重启后不会恢复。

## 本地开发

建议使用满足依赖要求的 Node.js 24 LTS（24.15.0 或更高的 24.x 版本）。编译终端原生模块需要 Xcode Command Line Tools。

```sh
npm ci
npm run dev
```

依赖安装后会自动为 Electron 重建 `node-pty`。更换 Electron 版本后可执行 `npm run rebuild-native`。

## 检查与构建

```sh
npm run typecheck
npm test
npm run build
npx electron-builder --mac dir --arm64
```

生成的应用位于 `dist/mac-arm64/Claude Code.app`。

生成 Release 安装包：

```sh
npx electron-builder --mac dmg zip --arm64 --publish never '-c.artifactName=Claude-Code-for-Mac-${version}-${arch}.${ext}'
```

界面与工作区集成验证：

```sh
npm run build
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron scripts/smoke-sidebar.cjs
```

会话摘要集成验证使用合成 SDK 事件：

```sh
env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron scripts/smoke-summary.cjs
```

该验证使用临时项目和合成会话，检查会话隔离、归档导航、侧边聊天、DOCX/Excel/PDF 文件预览、终端和本地浏览器，不发送 Claude 对话。Office 样本在运行时生成；PDF 样本可通过 `scripts/generate-pdf-fixtures.py` 重新生成（需要 Python 的 reportlab、pypdf）。`npm run probe` 则会实际调用模型，应按需要手动运行。

## 项目结构

- `src/main`：Electron 主进程、Agent SDK、文件访问、终端和浏览器。
- `src/preload`：经过隔离的 IPC 桥接。
- `src/renderer`：React 界面和状态管理。
- `src/shared`：共享类型和工具函数。
- `test`：单元测试、交互测试与测试数据。样例数据中的本机路径已替换为示例路径。
- `scripts`：构建安装、原生模块和界面验证辅助脚本。

应用设置存放在 `~/Library/Application Support/claude-desk`，不属于源码仓库或 Release 附件。
