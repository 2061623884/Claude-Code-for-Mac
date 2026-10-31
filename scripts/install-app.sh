#!/bin/zsh
# 打包并安装到「应用程序」。用法：npm run install-app
# 第一次安装时会把原来的「Claude Code.app」（VS Code 启动器）移到 backup/ 里保存。
set -euo pipefail
cd "${0:A:h}/.."
unset ELECTRON_RUN_AS_NODE

npx electron-vite build
npx electron-builder --mac dir --arm64

APP="dist/mac-arm64/Claude Code.app"
DEST="/Applications/Claude Code.app"
BACKUP="backup/Claude Code（VS Code 启动器）.app"

# 本地自用：用固定的本地证书签名（见 signing.sh），重装后文件夹访问授权依然有效
source scripts/signing.sh
sign_app "$APP"
codesign --verify --deep --strict "$APP"

if [[ -d "$DEST" && ! -e "$DEST/Contents/Resources/app.asar" ]]; then
  # 目标位置是旧的启动器（不是本应用），先移走备份
  mkdir -p backup
  [[ -e "$BACKUP" ]] && BACKUP="backup/Claude Code（VS Code 启动器）$(date +%Y%m%d%H%M%S).app"
  mv "$DEST" "$BACKUP"
  echo "已备份旧启动器到：$PWD/$BACKUP"
elif [[ -d "$DEST" ]]; then
  rm -rf "$DEST"
fi

ditto "$APP" "$DEST"
echo "已安装：$DEST"

if pgrep -f "/Applications/Claude Code.app/Contents/MacOS/Claude Code" >/dev/null; then
  echo "⚠️  Claude Code 正在运行旧版本：请按 ⌘Q 退出后重新打开，新版本才会生效。"
fi
