# Claude Code for Mac

基于 Electron、React 和 Claude Agent SDK 构建的第三方 macOS 桌面客户端，提供中文界面。此项目不是 Anthropic 官方桌面应用。

## 下载和安装

在 [Releases](https://github.com/2061623884/Claude-Code-for-Mac/releases) 下载最新版本。

- `Claude-Code-for-Mac-0.1.1-arm64.dmg`：打开后将 `Claude Code.app` 拖到 Applications。
- `Claude-Code-for-Mac-0.1.1-arm64.zip`：解压后得到同一个应用。
- `SHA256SUMS.txt`：安装包 SHA-256 校验值。

当前提供 **Apple Silicon（arm64）** 版本，不支持 Intel Mac。应用尚未使用 Apple Developer ID 签名或经过 Apple 公证，macOS 可能显示安全提示。

首次使用需要在本机配置有效的 Claude Code 登录或 API 认证。安装包不包含账号、API Key 或聊天记录。

## 功能

- 项目管理、历史会话、流式回复、权限确认、模型和思考程度选择。
- 右侧栏支持多个页面，加号新建“开始”页，提供工作区文件、终端和浏览器三个入口。
- 文件树与代码、Markdown、图片、HTML 静态预览、PDF 预览。
- 在项目目录运行的内嵌交互终端，以及内嵌浏览器。
- “顺便问一下”侧边聊天。没有消息时显示引导，发送后隐藏，清空后重新显示。
- 侧栏调宽、展开与收起，浅色和深色主题。

HTML 预览不执行脚本；二进制或超过预览大小限制的文件可用系统默认应用打开。切换到设置页会保留终端进程与浏览器页面；关闭对应标签时才释放资源。终端和侧栏页面状态不保证跨应用重启恢复。

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

该验证使用临时项目检查文件预览、终端和本地浏览器，不发送 Claude 对话。`npm run probe` 则会实际调用模型，应按需要手动运行。

## 项目结构

- `src/main`：Electron 主进程、Agent SDK、文件访问、终端和浏览器。
- `src/preload`：经过隔离的 IPC 桥接。
- `src/renderer`：React 界面和状态管理。
- `src/shared`：共享类型和工具函数。
- `test`：单元测试、交互测试与测试数据。样例数据中的本机路径已替换为示例路径。
- `scripts`：构建安装、原生模块和界面验证辅助脚本。

应用设置存放在 `~/Library/Application Support/claude-desk`，不属于源码仓库或 Release 附件。
